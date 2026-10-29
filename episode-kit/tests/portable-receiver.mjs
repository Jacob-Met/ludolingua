import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { startReceiver } from '../serve.mjs';
import { createOriginalEpisode } from '../lib/authoring.mjs';
import { createExport, readExport } from '../lib/export.mjs';
import { createPlaytestRecord, readPlaytestRecord } from '../lib/playtest-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const out = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const receipt = { schema: 'ludolingua.portable-player-receiving.v1', startedAt: new Date().toISOString(),
  checks: [], downloads: [], offlineDocuments: [], errors: [], passed: false, chromiumSandbox: true };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = name => receipt.checks.push(name);
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const chain = [
  { id: 'c1', kind: 'before', left: 'keeper-1', right: 'keeper-2' },
  { id: 'c2', kind: 'before', left: 'keeper-2', right: 'keeper-3' }
];
const rawStory = 'Keep literal $& and $' + "'" + ' and $' + String.fromCharCode(96) +
 '\n</script><script>window.__escape=1</script>\n日本語 · E\u0301toile · 🧩 · \u2028 · \u2029';
function make(id, locale = 'en') {
  const ep = createOriginalEpisode({ title: locale === 'es' ? 'Otro mensaje — Árbol' : 'A portable message — 日本語',
    story: rawStory, locale, labels: locale === 'es' ? ['Sol', 'Ave', 'Yoyo'] : ['Sun', 'Apple', 'Yarn'], action: 'SAY' }, { id });
  ep.clues = structuredClone(chain); ep.hints = ['Read the initials in order.', 'The first keeper starts with S.'];
  return ep;
}
async function saveDownload(page, selector, name) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const item = await pending, target = resolve(out, name); await item.saveAs(target);
  assert.equal(await item.failure(), null);
  const bytes = await readFile(target); receipt.downloads.push({ name, bytes: bytes.length, sha256: hash(bytes), suggestedFilename: item.suggestedFilename() });
  return { path: target, bytes };
}
async function recordDownload(page, name) {
  const file = await saveDownload(page, '#playtest-download', name);
  return { ...file, record: await readPlaytestRecord(file.bytes.toString('utf8')) };
}
async function solve(page) {
  for (let n = 1; n <= 3; n++) {
    const id = 'keeper-' + n;
    const order = await page.locator('#playtest-cards li').evaluateAll(nodes => nodes.map(node => node.dataset.cardId));
    for (let i = order.indexOf(id); i > n - 1; i--) await page.locator('#playtest-cards li[data-card-id="' + id + '"] button[data-direction="up"]').click();
  }
  await page.fill('#playtest-answer', 'say'); await page.locator('#playtest-answer').press('Enter');
}
let browser, authorContext, offlineContext, server, lastPage;
const observe = page => {
  lastPage = page; page.on('pageerror', e => receipt.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') receipt.errors.push(m.text()); });
};
async function openOffline(file, { width = 1280, ready = true } = {}) {
  const page = await offlineContext.newPage(); observe(page); await page.setViewportSize({ width, height: 900 });
  const item = { file, requests: [], failedRequests: [] }; receipt.offlineDocuments.push(item);
  page.on('request', r => item.requests.push(r.url()));
  page.on('requestfailed', r => item.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
  await page.goto(pathToFileURL(file).href);
  await page.locator('#portable-status[data-state="' + (ready ? 'ready' : 'error') + '"]').waitFor();
  assert.equal(await page.evaluate(() => window.opener), null);
  return page;
}
try {
  const started = await startReceiver(); server = started.server;
  browser = await chromium.launch({ executablePath: process.env.LUDO_BROWSER || '/usr/bin/google-chrome-stable', headless: true, chromiumSandbox: true });
  authorContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  authorContext.on('page', observe);
  const author = await authorContext.newPage(); await author.goto(started.url);
  await author.locator('#episode-title-input').waitFor();
  const episode = make('portable-browser-original'), exported = await createExport(episode);
  const exportPath = resolve(out, 'input-episode.json'); await writeFile(exportPath, JSON.stringify(exported));
  await author.setInputFiles('#import-file', exportPath);
  await author.waitForFunction(title => document.getElementById('episode-title-input').value === title, episode.title);
  await author.selectOption('#ui-language', 'es');
  const before = { storage: await storage(author), selected: await author.locator('#case-select').inputValue(),
    title: await author.locator('#episode-title-input').inputValue(), revision: await author.locator('#revision').textContent().catch(() => null) };
  const exportedHTML = await saveDownload(author, '#download-portable-player', 'workbench-player.html');
  await settle(author);
  assert.deepEqual(await storage(author), before.storage); assert.equal(await author.locator('#case-select').inputValue(), before.selected);
  assert.equal(await author.locator('#episode-title-input').inputValue(), before.title);
  assert.match(await author.locator('#notice').textContent(), /HTML para jugar/);
  await author.screenshot({ path: resolve(out, 'portable-author-desktop.png'), fullPage: true });
  check('Actual author download captures English content with Spanish controls and leaves source, selection and stored drafts unchanged');

  const renamedDir = resolve(out, 'Moved player 日本語'); await mkdir(renamedDir);
  const renamedPath = resolve(renamedDir, 'A renamed puzzle with spaces.html'); await rename(exportedHTML.path, renamedPath);
  offlineContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  await offlineContext.setOffline(true);
  const player = await openOffline(renamedPath);
  assert.equal(await player.locator('#playtest-ui-language').inputValue(), 'es');
  assert.equal(await player.locator('#playtest-story').textContent(), rawStory);
  assert.equal(await player.locator('#playtest-story').getAttribute('lang'), 'en');
  assert.equal(await player.evaluate(() => window.__escape), undefined);
  assert.equal(await player.locator('script').count(), 2);
  await player.locator('#portable-start').focus(); await player.keyboard.press('Enter');
  await player.locator('#playtest-session').waitFor({ state: 'visible' });
  await player.fill('#playtest-answer', 'wrong'); await player.locator('#playtest-answer').press('Enter');
  await player.locator('#playtest-hint').click(); await solve(player);
  await player.locator('#playtest-reveal').click(); await player.locator('#playtest-reset').click();
  await solve(player);
  const first = await recordDownload(player, 'offline-first-record.json');
  const summary = first.record.validation.result.summary;
  assert.equal(summary.attempts, 3); assert.equal(summary.successfulAttempts, 2);
  assert.equal(summary.hintsShown, 1); assert.equal(summary.resets, 1); assert.equal(summary.revealUsed, true);
  assert.deepEqual(first.record.episode, episode);
  await player.screenshot({ path: resolve(out, 'portable-player-desktop.png'), fullPage: true });
  await player.close();
  check('Moved single HTML opens directly offline; literal script terminators and dollar sequences remain inert; keyboard start, incorrect/correct attempts, hints, reveal, reset and actual record download all replay');

  const continuation = await openOffline(renamedPath, { width: 390 });
  await continuation.setInputFiles('#playtest-resume-file', first.path);
  await continuation.locator('#playtest-session').waitFor({ state: 'visible' });
  await continuation.selectOption('#playtest-ui-language', 'en');
  assert.equal(await continuation.locator('#playtest-title').textContent(), episode.title);
  await continuation.fill('#playtest-answer', 'SAY'); await continuation.locator('#playtest-answer').press('Enter');
  const extended = await recordDownload(continuation, 'offline-continued-record.json');
  assert.equal(extended.record.sessionId, first.record.sessionId);
  assert.deepEqual(extended.record.events.slice(0, first.record.events.length), first.record.events);
  assert.equal(extended.record.events.length, first.record.events.length + 1);
  assert.equal(extended.record.validation.result.summary.successfulAttempts, 3);
  await continuation.selectOption('#playtest-ui-language', 'es');
  const overflow = await continuation.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false);
  await continuation.screenshot({ path: resolve(out, 'portable-player-mobile-spanish.png'), fullPage: true });
  await continuation.close();
  check('A fresh offline file continues the downloaded record with exact prior events and session identity; UI changes preserve content and 390px Spanish layout has no horizontal overflow');

  const b = make('portable-browser-different', 'es'), bRecord = await createPlaytestRecord(b, 'explicit-synthetic-other-session', [{ type: 'hint', elapsedMs: 12 }]);
  const bPath = resolve(out, 'synthetic-different-puzzle-record.json'); await writeFile(bPath, JSON.stringify(bRecord));
  const other = await openOffline(renamedPath);
  await other.setInputFiles('#playtest-resume-file', bPath);
  await other.locator('#playtest-session').waitFor({ state: 'visible' });
  await other.selectOption('#playtest-ui-language', 'en'); await other.selectOption('#playtest-ui-language', 'es');
  assert.equal(await other.locator('#playtest-title').textContent(), b.title);
  assert.equal(await other.locator('#playtest-story').getAttribute('lang'), 'es');
  assert.equal(await other.locator('#portable-status').getAttribute('data-state'), 'playing');
  await solve(other); const otherSaved = await recordDownload(other, 'offline-other-puzzle-record.json');
  assert.equal(otherSaved.record.sessionId, bRecord.sessionId); assert.deepEqual(otherSaved.record.events[0], bRecord.events[0]);
  assert.deepEqual(otherSaved.record.episode, b);
  await other.close();
  check('An explicit synthetic record for a different puzzle adopts that record’s actual title, language, episode and history; included-puzzle preview never overwrites it');

  const htmlText = await readFile(renamedPath, 'utf8');
  const damaged = htmlText.replace(/(<script id="ludolingua-portable-data" type="application\/json">)[\s\S]*?(<\/script>)/, () =>
    '<script id="ludolingua-portable-data" type="application/json">{"schema":"invalid"}</script>');
  const damagedPath = resolve(out, 'damaged-included-data.html'); await writeFile(damagedPath, damaged);
  const recovered = await openOffline(damagedPath, { ready: false });
  assert.equal(await recovered.locator('#portable-start').isDisabled(), true);
  assert.equal(await recovered.locator('#playtest-resume-file').isEnabled(), true);
  await recovered.setInputFiles('#playtest-resume-file', first.path);
  await recovered.locator('#playtest-session').waitFor({ state: 'visible' });
  assert.equal(await recovered.locator('#playtest-title').textContent(), episode.title);
  assert.equal(await recovered.locator('#portable-status').evaluate(node => node.classList.contains('error')), false);
  await recovered.close();
  check('A damaged embedded seed refuses Start with an explanation but can still recover a valid saved record through the maintained continuation path');

  const delayed = await authorContext.newPage(); await delayed.goto(started.url);
  await delayed.locator('#episode-title-input').waitFor();
  await delayed.setInputFiles('#import-file', exportPath);
  await delayed.waitForFunction(title => document.getElementById('episode-title-input').value === title, episode.title);
  await delayed.selectOption('#ui-language', 'en');
  let releaseBundle, requestedBundle;
  const gate = new Promise(resolveGate => { releaseBundle = resolveGate; });
  const requested = new Promise(resolveRequested => { requestedBundle = resolveRequested; });
  await delayed.route('**/portable-player-bundle.json', async route => { requestedBundle(); await gate; await route.continue(); });
  let accidentalDownloads = 0; delayed.on('download', () => accidentalDownloads++);
  await delayed.locator('#download-portable-player').click(); await requested;
  await delayed.fill('#episode-title-input', 'Edited while export was pending');
  releaseBundle();
  await delayed.waitForFunction(() => document.getElementById('notice').textContent.includes('episode changed'));
  assert.equal(accidentalDownloads, 0); assert.equal(await delayed.locator('#download-portable-player').isEnabled(), true);
  await delayed.unroute('**/portable-player-bundle.json');
  const currentHTML = await saveDownload(delayed, '#download-portable-player', 'current-revision-player.html');
  const currentPlayer = await openOffline(currentHTML.path);
  assert.equal(await currentPlayer.locator('#playtest-title').textContent(), 'Edited while export was pending');
  assert.equal(await currentPlayer.locator('#playtest-ui-language').inputValue(), 'en');
  await currentPlayer.close();
  check('Editing during delayed runtime loading cancels the stale download; a later click exports and opens the current revision');

  await new Promise(resolveClose => server.close(resolveClose)); server = null;
  const serverless = await openOffline(renamedPath);
  await serverless.locator('#portable-start').click();
  await serverless.locator('#playtest-session').waitFor({ state: 'visible' });
  await serverless.close();
  check('Downloaded HTML starts again after the author HTTP server has actually stopped');
  for (const item of receipt.offlineDocuments) {
    assert.deepEqual(item.requests, [pathToFileURL(item.file).href]); assert.deepEqual(item.failedRequests, []);
  }
  assert.deepEqual(receipt.errors, []);
  receipt.passed = true;
} catch (error) {
  receipt.failure = String(error.stack || error);
  if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'BROWSER-RECEIPT.json'), JSON.stringify(receipt, null, 2) + '\n');
  await offlineContext?.close(); await authorContext?.close(); await browser?.close();
  if (server) await new Promise(resolveClose => server.close(resolveClose));
  console.log(JSON.stringify(receipt));
}
