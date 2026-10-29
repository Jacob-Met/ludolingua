import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!['--app-root', '--playwright', '--browser', '--out', '--legacy-fixture'].includes(key) || !value) {
    throw new Error('Usage: --app-root PATH --playwright ESM_FILE --browser PATH --out NEW_DIR [--legacy-fixture JSON]');
  }
  args[key.slice(2)] = value;
}
for (const key of ['app-root', 'playwright', 'browser', 'out']) assert.ok(args[key], `Missing --${key}`);
const appRoot = path.resolve(args['app-root']);
const out = path.resolve(args.out);
// First filesystem mutation: refuse an existing evidence directory.
await fs.mkdir(out);
const report = {
  startedAt: new Date().toISOString(), appRoot,
  browserExecutable: path.resolve(args.browser), chromiumSandbox: true,
  checks: [], pageErrors: [], consoleErrors: [], unexpectedRequests: [],
  requestCount: 0, modelPosts: 0, cleanup: {}, screenshots: [], navigations: []
};
let server;
let browser;
let browserServer;
let browserProcess;
let browserExit = null;
let ownedClose;
let baseURL;
let serverLog = '';
let serverExit = null;
let deadline;
let timedOut = false;
let deadlineClose;
let createExport, createPlaytestRecord, readPlaytestRecord, summarizePlaytestCohort, episode;
let activePage;
function bounded(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); })
  ]).finally(() => clearTimeout(timer));
}
function checkDeadline() {
  if (timedOut) throw new Error('Browser receiving exceeded its 60-second execution budget');
}

async function checkpoint(stage) {
  await fs.writeFile(path.join(out, 'lifecycle.json'), JSON.stringify({
    stage, at: new Date().toISOString(), serverPid: server?.pid,
    browserPid: browserProcess?.pid, browserExit,
    baseURL, checks: report.checks, cleanup: report.cleanup
  }, null, 2));
}
async function closeOwnedBrowser() {
  if (ownedClose) return ownedClose;
  ownedClose = (async () => {
    if (browser) {
      try { await bounded(browser.close(), 5000, 'Browser connection close'); }
      catch (error) { report.cleanup.browserConnectionError = String(error); }
    }
    if (!browserServer) return;
    try {
      await bounded(browserServer.close(), 15000, 'Owned browser server close');
      report.cleanup.browserServerGraceful = true;
    } catch (error) {
      report.cleanup.browserServerGraceful = false;
      report.cleanup.browserServerError = String(error);
      report.passed = false;
      try {
        await bounded(browserServer.kill(), 5000, 'Owned browser server kill');
        report.cleanup.browserForced = true;
      } catch (killError) { report.cleanup.browserKillError = String(killError); }
    }
    try {
      if (browserExit === null) await bounded(new Promise(resolve => {
        browserProcess.once('exit', (code, signal) => { browserExit = { code, signal }; resolve(); });
      }), 3000, 'Owned browser process exit');
      report.cleanup.browserClosed = browserExit !== null;
      report.cleanup.browserExit = browserExit;
      if (!report.cleanup.browserClosed) report.passed = false;
    } catch (error) { report.cleanup.browserExitError = String(error); report.passed = false; }
  })();
  return ownedClose;
}

async function record(name, fn) {
  checkDeadline();
  try { await fn(); }
  catch (error) {
    try {
      report.failureDOM = await bounded(activePage.evaluate(() => {
        return { status: document.querySelector('#playtest-status')?.textContent, body: document.body?.innerText.slice(0, 12000) };
      }), 3000, 'Failure state capture');
    } catch (captureError) { report.failureCaptureError = String(captureError); }
    await checkpoint('failed: ' + name);
    throw error;
  }
  checkDeadline();
  report.checks.push({ name, passed: true });
  await checkpoint(name);
}
async function newPage() {
  checkDeadline();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  try {
    checkDeadline();
    await context.route('**/*', async route => {
      const url = route.request().url();
      report.requestCount++;
      if (route.request().method() === 'POST') {
        report.modelPosts++;
        report.unexpectedRequests.push({ url, method: 'POST' });
        await route.abort(); return;
      }
      let allowed = false;
      try {
        const parsed = new URL(url);
        allowed = parsed.origin === new URL(baseURL).origin || ['data:', 'blob:', 'about:'].includes(parsed.protocol);
      } catch {}
      if (!allowed) {
        report.unexpectedRequests.push({ url, method: route.request().method() });
        await route.abort();
      } else {
        await route.continue();
      }
    });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(10000);
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) report.navigations.push(frame.url()); });
    const watch = p => {
      p.setDefaultTimeout(10000);
      p.on('pageerror', error => report.pageErrors.push(String(error)));
      p.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    };
    watch(page); context.on('page', watch);
    await page.goto(baseURL + '/web/playtest.html', { waitUntil: 'load', timeout: 10000 });
    checkDeadline();
    return { page, context };
  } catch (error) {
    await bounded(context.close(), 5000, 'Failed setup context close').catch(closeError => {
      report.cleanup.contextError = String(closeError);
    });
    throw error;
  }
}
async function closeContext(context) {
  await bounded(context.close(), 5000, 'Context close');
}

async function state(page) {
  return page.evaluate(() => ({
    title: document.querySelector('#playtest-title').textContent,
    revision: document.querySelector('#playtest-revision').textContent,
    order: [...document.querySelectorAll('#playtest-cards li')].map(e => e.dataset.cardId),
    hints: document.querySelector('#playtest-hints').textContent,
    revealed: !document.querySelector('#playtest-solution').hidden,
    feedback: document.querySelector('#playtest-feedback').textContent,
    summary: document.querySelector('#playtest-journal-summary').textContent
  }));
}
async function ready(page) { await page.locator('#playtest-status[data-state="ready"]').waitFor(); }
async function upload(page, selector, value, name = 'record.json') {
  await page.locator(selector).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}
async function download(page, name) {
  const pending = page.waitForEvent('download');
  await page.locator('#playtest-download').click();
  const filename = path.join(out, name);
  await (await pending).saveAs(filename);
  const raw = JSON.parse(await fs.readFile(filename, 'utf8'));
  const verified = await readPlaytestRecord(raw);
  assert.equal(verified.integrity.verified, true);
  return raw;
}
async function continuation(page, raw) {
  await upload(page, '#playtest-resume-file', raw);
  await ready(page);
}
async function runChecks() {
  const { page: donor, context } = await newPage();
  let resumed, original, originalState, extended;
  try {
    await record('actual player actions and downloaded record establish an interrupted journey', async () => {
      for (const width of [1440, 390]) {
        await donor.setViewportSize({ width, height: 1000 });
        assert.equal(await donor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await donor.locator('#playtest-file').isVisible(), true);
        assert.equal(await donor.locator('#playtest-resume-file').isVisible(), true);
        const filename = path.join(out, `player-entry-${width}.png`);
        await donor.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
        report.screenshots.push({ path: filename, width, purpose: 'empty player intake choices', visualReview: 'pending' });
      }
      await donor.setViewportSize({ width: 1440, height: 1000 });
      await upload(donor, '#playtest-file', await createExport(episode));
      await ready(donor);
      await donor.locator('#playtest-answer').fill('WRONG');
      await donor.locator('#playtest-answer').press('Enter');
      await donor.locator('#playtest-hint').click();
      const down = donor.locator('[data-card-id="star"] button[data-direction="down"]');
      await down.focus();
      for (let i = 0; i < 3; i++) await donor.keyboard.press('Space');
      await donor.locator('#playtest-answer').fill(' open ');
      await donor.locator('#playtest-answer').press('Enter');
      await donor.locator('#playtest-reveal').click();
      originalState = await state(donor);
      original = await download(donor, 'browser-original.json');
      assert.deepEqual(original.events.map(e => e.type), ['attempt', 'hint', 'move', 'move', 'move', 'attempt', 'reveal']);
      assert.equal(original.validation.result.summary.successfulAttempts, 1);
      assert.equal(original.validation.result.summary.revealUsed, true);
      assert.equal(original.validation.result.summary.hintsShown, 1);
      await donor.close();
    });
    await record('fresh window resumes exact captured episode, replay state and identity', async () => {
      resumed = await context.newPage(); activePage = resumed;
      await resumed.goto(baseURL + '/web/playtest.html');
      await continuation(resumed, original);
      assert.deepEqual(await state(resumed), originalState);
      assert.equal(await resumed.evaluate(() => document.activeElement?.id), 'playtest-arrange-heading');
      const unchanged = await download(resumed, 'browser-resumed-unchanged.json');
      assert.deepEqual(unchanged, original);
      assert.equal(await resumed.locator('#playtest-file').isDisabled(), true);
      assert.equal(await resumed.locator('#playtest-resume-file').isDisabled(), true);
      // Unsubmitted answers are not in the journal and must not be fabricated.
      assert.equal(await resumed.locator('#playtest-answer').inputValue(), '');
    });
    await record('continued action appends and old-plus-new cohort counts one session', async () => {
      await resumed.locator('#playtest-hint').focus();
      await resumed.keyboard.press('Enter');
      extended = await download(resumed, 'browser-continued.json');
      assert.equal(extended.sessionId, original.sessionId);
      assert.deepEqual(extended.episode, original.episode);
      assert.deepEqual(extended.events.slice(0, original.events.length), original.events);
      assert.equal(extended.events.length, original.events.length + 1);
      assert.equal(extended.events.at(-1).type, 'hint');
      assert.ok(extended.events.at(-1).elapsedMs >= original.events.at(-1).elapsedMs);
      const cohort = await summarizePlaytestCohort([original, extended]);
      assert.equal(cohort.inputs.uniqueSessions, 1);
      assert.equal(cohort.inputs.supersededSnapshots, 1);
      report.continuity = { sessionId: original.sessionId, originalEvents: original.events.length, continuedEvents: extended.events.length, cohortInputs: cohort.inputs };
    });
    await record('UI language and narrow keyboard course preserve the exact journal', async () => {
      for (const locale of ['es', 'en']) {
        await resumed.locator('#playtest-ui-language').selectOption(locale);
        assert.equal(await resumed.locator('html').getAttribute('lang'), locale);
        assert.equal(await resumed.locator('#playtest-cards').getAttribute('lang'), episode.locale);
        assert.deepEqual(await download(resumed, `browser-language-${locale}.json`), extended);
      }
      for (const width of [1440, 390]) {
        await resumed.setViewportSize({ width, height: 1000 });
        assert.equal(await resumed.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const filename = path.join(out, `continued-player-${width}.png`);
        await resumed.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
        report.screenshots.push({ path: filename, width, visualReview: 'pending' });
      }
    });
    await record('malformed and altered records do not start or replace a session', async () => {
      const p = await context.newPage(); activePage = p;
      await p.goto(baseURL + '/web/playtest.html');
      const tampered = structuredClone(original); tampered.events[0].answer = 'changed';
      for (const raw of ['{invalid JSON', tampered]) {
        await upload(p, '#playtest-resume-file', raw);
        await p.waitForFunction(() => document.querySelector('#playtest-status').dataset.state === 'error' && !document.querySelector('#playtest-resume-file').disabled && document.querySelector('#playtest-resume-file').value === '');
        assert.equal(await p.locator('#playtest-session').isVisible(), false);
        assert.equal(await p.locator('#playtest-resume-file').isEnabled(), true);
      }
      await continuation(p, original);
      const before = await state(p);
      await p.locator('#playtest-resume-file').dispatchEvent('change');
      assert.deepEqual(await state(p), before);
      assert.deepEqual(await download(p, 'browser-protected-current.json'), original);
      await p.close();
    });
    await record('oversized input is rejected before a session starts', async () => {
      const p = await context.newPage(); activePage = p;
      await p.goto(baseURL + '/web/playtest.html');
      await p.locator('#playtest-resume-file').setInputFiles({ name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.alloc(20_000_001, 32) });
      await p.locator('#playtest-status[data-state="error"]').waitFor();
      assert.equal(await p.locator('#playtest-session').isVisible(), false);
      assert.equal(await p.locator('#playtest-resume-file').isEnabled(), true);
      await p.close();
    });
    await record('legacy record continues while divergent copies remain cohort conflicts', async () => {
      const legacyPath = args['legacy-fixture'] || path.join(appRoot, 'tests/fixtures/playtest-v0.1-attempt.json');
      const legacy = JSON.parse(await fs.readFile(legacyPath, 'utf8'));
      assert.equal(Object.hasOwn(legacy.validation.result.finalState.lastAttempt, 'tokenMatches'), false);
      const p = await context.newPage(); activePage = p;
      await p.goto(baseURL + '/web/playtest.html');
      await continuation(p, legacy);
      const normalized = await download(p, 'legacy-normalized.json');
      assert.deepEqual(normalized.events, legacy.events);
      assert.equal(normalized.sessionId, legacy.sessionId);
      assert.equal(typeof normalized.validation.result.finalState.lastAttempt.tokenMatches, 'boolean');
      await p.locator('#playtest-hint').click();
      const extendedLegacy = await download(p, 'legacy-continued.json');
      assert.deepEqual(extendedLegacy.events.slice(0, legacy.events.length), legacy.events);
      const cohort = await summarizePlaytestCohort([legacy, extendedLegacy]);
      assert.equal(cohort.inputs.uniqueSessions, 1);
      assert.equal(cohort.inputs.supersededSnapshots, 1);
      const divergent = await createPlaytestRecord(original.episode, original.sessionId, [...original.events, { type: 'reset', elapsedMs: extended.events.at(-1).elapsedMs }]);
      await assert.rejects(() => summarizePlaytestCohort([extended, divergent]), /Conflicting records reuse one session ID/);
      await p.close();
    });
    await record('first pending intake and resumed record resist opener replacement', async () => {
      const parent = await context.newPage(); activePage = parent;
      await parent.goto(baseURL + '/web/playtest.html');
      const popup = parent.waitForEvent('popup');
      await parent.evaluate(() => { window.receiverChild = window.open('/web/playtest.html?handoff=continuation-review'); });
      const p = await popup; activePage = p;
      await p.waitForLoadState('load');
      await p.evaluate(() => {
        window.addEventListener('message', event => {
          if (event.origin === location.origin && event.source === window.opener && event.data?.token === 'continuation-review') {
            window.receivedPendingHandoff = Boolean(window.releaseReceiverRead) && document.querySelector('#playtest-resume-file').disabled;
          }
        });
        const originalText = File.prototype.text;
        File.prototype.text = function () {
          const file = this;
          return new Promise(resolve => { window.releaseReceiverRead = () => { File.prototype.text = originalText; originalText.call(file).then(resolve); }; });
        };
      });
      await upload(p, '#playtest-resume-file', original);
      await p.waitForFunction(() => typeof window.releaseReceiverRead === 'function');
      assert.equal(await p.locator('#playtest-file').isDisabled(), true);
      assert.equal(await p.locator('#playtest-resume-file').isDisabled(), true);
      const sendEpisode = async () => parent.evaluate(episodeExport => {
        window.receiverChild.postMessage({ type: 'ludolingua.playtest.episode', token: 'continuation-review', episodeExport }, location.origin);
      }, await createExport({ ...structuredClone(episode), title: 'Must not replace resumed episode' }));
      await sendEpisode();
      await p.waitForFunction(() => window.receivedPendingHandoff === true);
      await p.evaluate(() => { window.releaseReceiverRead(); delete window.releaseReceiverRead; });
      await ready(p);
      assert.deepEqual(await download(p, 'race-first-wins.json'), original);
      await sendEpisode();
      assert.deepEqual(await download(p, 'race-no-replacement.json'), original);
      await p.close(); await parent.close();
    });
    await record('large elapsed offset and full journal remain valid on continuation', async () => {
      const p = await context.newPage(); activePage = p;
      await p.goto(baseURL + '/web/playtest.html');
      const offsetEvents = [{ type: 'hint', elapsedMs: 1_000_000 }];
      const offset = await createPlaytestRecord(episode, 'independent-offset-fixture', offsetEvents);
      await continuation(p, offset);
      // Explicit bounded pause distinguishes additive continuation from max(old, new).
      await p.waitForTimeout(40);
      await p.locator('#playtest-reveal').click();
      const after = await download(p, 'offset-fixture-continued.json');
      assert.ok(after.events.at(-1).elapsedMs > 1_000_000);
      assert.ok(after.events.at(-1).elapsedMs < 1_010_000);
      await p.close();
      const fullPage = await context.newPage(); activePage = fullPage;
      await fullPage.goto(baseURL + '/web/playtest.html');
      const full = await createPlaytestRecord(episode, 'independent-full-fixture', Array.from({ length: 10000 }, (_, elapsedMs) => ({ type: 'reset', elapsedMs })));
      await upload(fullPage, '#playtest-resume-file', full);
      await fullPage.locator('#playtest-status[data-state="full"]').waitFor();
      for (const id of ['playtest-attempt', 'playtest-reset', 'playtest-hint', 'playtest-reveal']) assert.equal(await fullPage.locator('#' + id).isDisabled(), true);
      assert.deepEqual(await download(fullPage, 'full-fixture-unchanged.json'), full);
      await fullPage.close();
    });
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.unexpectedRequests, []);
    assert.equal(report.modelPosts, 0);
  } finally { await closeContext(context); }
}

try {
  const { chromium } = await import(pathToFileURL(path.resolve(args.playwright)).href);
  ({ createExport } = await import(pathToFileURL(path.join(appRoot, 'lib/export.mjs')).href));
  ({ createPlaytestRecord, readPlaytestRecord } = await import(pathToFileURL(path.join(appRoot, 'lib/playtest-export.mjs')).href));
  ({ summarizePlaytestCohort } = await import(pathToFileURL(path.join(appRoot, 'lib/playtest-cohort.mjs')).href));
  const { EPISODES } = await import(pathToFileURL(path.join(appRoot, 'fixtures/episodes.mjs')).href);
  episode = EPISODES.find(e => e.id === 'en-original');
  const env = { ...process.env, PORT: '0' };
  for (const key of ['NEBIUS_API_KEY', 'NEBIUS_MODEL', 'NEBIUS_BASE_URL']) delete env[key];
  server = spawn(process.execPath, [path.join(appRoot, 'serve.mjs')], {
    cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe']
  });
  report.serverPid = server.pid;
  const serverCheckpoint = checkpoint('server-created');
  server.on('exit', (code, signal) => { serverExit = { code, signal }; });
  baseURL = await bounded(new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code, signal) => reject(new Error(`Server exited before readiness: ${code}/${signal}`)));
    const consume = data => {
      serverLog = (serverLog + data.toString()).slice(-65536);
      const match = serverLog.match(/LUDOLINGUA episode receiver: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    };
    server.stdout.on('data', consume);
    server.stderr.on('data', consume);
  }), 10000, 'Server readiness');
  await serverCheckpoint;
  report.baseURL = baseURL;
  browserServer = await chromium.launchServer({
    executablePath: path.resolve(args.browser), headless: true,
    chromiumSandbox: true, timeout: 15000
  });
  browserProcess = browserServer.process();
  if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) browserExit = { code: browserProcess.exitCode, signal: browserProcess.signalCode };
  browserProcess.on('exit', (code, signal) => { browserExit = { code, signal }; });
  report.browserPid = browserProcess.pid;
  await checkpoint('browser-server-created');
  browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: 15000 });
  report.browserVersion = browser.version();
  // Only this browser is launched. The deadline closes it to abort active
  // Playwright operations; runChecks itself is awaited through cleanup.
  deadline = setTimeout(() => {
    timedOut = true;
    report.deadlineExpired = true;
    deadlineClose = closeOwnedBrowser()
      .then(() => { report.cleanup.deadlineBrowserClosed = true; })
      .catch(error => { report.cleanup.deadlineBrowserError = String(error); });
  }, 60000);
  await runChecks();
  checkDeadline();
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack || String(error);
} finally {
  clearTimeout(deadline);
  if (deadlineClose) await deadlineClose;
  await closeOwnedBrowser();
  if (server && server.pid) {
    const waitExit = () => serverExit ? Promise.resolve(serverExit) : new Promise(resolve => {
      server.once('exit', (code, signal) => resolve({ code, signal }));
    });
    try {
      if (!serverExit) {
        report.cleanup.serverSigintRequested = true;
        server.kill('SIGINT');
      }
      await bounded(waitExit(), 5000, 'Owned server SIGINT');
      assert.deepEqual(serverExit, { code: 0, signal: null }, 'Unexpected server exit');
      assert.equal(report.cleanup.serverSigintRequested, true, 'Server exited before requested cleanup');
      report.cleanup.serverGraceful = true;
    } catch (error) {
      report.cleanup.serverGraceful = false;
      report.cleanup.serverError = String(error);
      report.passed = false;
      if (!serverExit) {
        try {
          server.kill('SIGTERM');
          await bounded(waitExit(), 4000, 'Owned server SIGTERM');
          report.cleanup.serverForced = true;
        } catch (forcedError) {
          report.cleanup.serverForcedError = String(forcedError);
        }
      }
    }
    report.cleanup.serverExit = serverExit;
  }
  if (timedOut || report.cleanup.browserForced || report.cleanup.browserServerGraceful === false || (browserServer && !report.cleanup.browserClosed)) report.passed = false;
  await checkpoint('complete');
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'server.log'), serverLog);
  await fs.writeFile(path.join(out, 'receiving.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exitCode = report.passed ? 0 : 1;
}
