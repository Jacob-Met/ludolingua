import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startReceiver } from '../serve.mjs';
import { createPlaytestRecord, readPlaytestRecord } from '../lib/playtest-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) {
  throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir, { recursive: true });
const sourceEvidenceDir = resolve(evidenceDir, 'actual-player-downloads');
const receipt = {
  schema: 'ludolingua.browser-cohort-receiving.v1',
  startedAt: new Date().toISOString(),
  checks: [], errors: [], failedRequests: [], httpErrors: [], inputs: [],
  passed: false,
  limitations: [
    'Authored automated browser receiving, not independently attested human play.',
    'Session IDs do not authenticate distinct people or native-language proficiency.',
    'No model inference, translation-quality or comparable-difficulty claim.'
  ]
};
const check = name => receipt.checks.push(name);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const recordNames = [
  'cohort-session-a-empty.json',
  'cohort-session-a-partial.json',
  'cohort-session-a-complete.json',
  'cohort-session-a-spanish-ui-duplicate.json',
  'cohort-session-b-failed.json'
];
const zero = {
  sessions: 1, sessionsWithSuccess: 0, sessionsWithHints: 0,
  sessionsWithReveal: 0, attempts: 0, successfulAttempts: 0,
  moves: 0, hintsShown: 0, resets: 0
};
const completedSession = {
  ...zero, sessionsWithSuccess: 1, attempts: 2, successfulAttempts: 1, moves: 3
};
const twoSessionTotals = {
  ...completedSession, sessions: 2, attempts: 3
};
let browser, server, page, separatePlayer;

function observe(surface) {
  surface.on('pageerror', error => receipt.errors.push(String(error)));
  surface.on('console', message => {
    if (message.type() === 'error') receipt.errors.push(message.text());
  });
  surface.on('requestfailed', request => receipt.failedRequests.push({
    url: request.url(), error: request.failure()?.errorText
  }));
  surface.on('response', response => {
    if (response.status() >= 400) receipt.httpErrors.push({
      url: response.url(), status: response.status()
    });
  });
}
async function save(name, value) {
  const path = resolve(evidenceDir, name);
  await writeFile(path, typeof value === 'string' || Buffer.isBuffer(value)
    ? value : JSON.stringify(value, null, 2) + '\n');
  return path;
}
async function cohortState(kind) {
  await page.locator('#playtest-cohort-status[data-state="' + kind + '"]').waitFor();
  if (kind !== 'loading') {
    await page.waitForFunction(() =>
      document.getElementById('playtest-cohort-files').value === '' &&
      document.getElementById('playtest-cohort-status').getAttribute('aria-busy') === 'false');
  }
}
async function selectCohort(paths, kind = 'ready') {
  await page.setInputFiles('#playtest-cohort-files', paths);
  await cohortState(kind);
}
async function displayedCohort() {
  return page.locator('#playtest-cohort-result').evaluate(container => {
    const counts = (element, attribute) => Object.fromEntries(
      [...element.querySelectorAll('[' + attribute + ']')].map(node => {
        const text = node.textContent.trim();
        if (!/^\d+$/.test(text)) throw new Error('A cohort count must be plain nonnegative integer text.');
        return [node.getAttribute(attribute), Number(text)];
      })
    );
    return {
      inputs: counts(container, 'data-cohort-input'),
      episodes: [...container.querySelectorAll('article[data-episode-sha256]')].map(article => ({
        sha256: article.dataset.episodeSha256,
        recorded: counts(article, 'data-cohort-metric')
      })).sort((a, b) => a.sha256.localeCompare(b.sha256))
    };
  });
}
async function assertDisplayed(inputs, groups) {
  assert.deepEqual(await displayedCohort(), {
    inputs,
    episodes: groups.map(([hash, recorded]) => ({ sha256: hash, recorded }))
      .sort((a, b) => a.sha256.localeCompare(b.sha256))
  });
}
async function authorState() {
  return page.evaluate(() => {
    const byId = id => document.getElementById(id);
    const digest = id => byId(id).textContent.match(/[a-f0-9]{64}/)?.[0] ?? '';
    return {
      episode: byId('case-select').value,
      revision: byId('revision').textContent.match(/\d+/)?.[0],
      title: byId('episode-title-input').value,
      story: byId('episode-story-input').value,
      action: byId('required-action').value,
      labels: [...byId('cards-editor').querySelectorAll('input')].map(input => input.value),
      freeze: byId('freeze-labels').checked,
      hints: byId('hint-editor').value,
      digest: digest('digest'),
      comparisonDigest: digest('comparison-digest'),
      exportDisabled: byId('export-button').disabled,
      comparisonExportDisabled: byId('comparison-export-button').disabled,
      source: byId('source-select').value,
      mapping: [...document.querySelectorAll('.mapping-row select')].map(select => select.value),
      drafts: Object.keys(localStorage).filter(key => key.startsWith('ludolingua.author-draft:'))
        .sort().map(key => [key, localStorage.getItem(key)]),
      player: {
        order: [...byId('player-order').children].map(row => row.dataset.cardId),
        answer: byId('answer').value,
        hints: byId('hints').textContent,
        revealHidden: byId('reveal').hidden,
        reveal: byId('reveal').textContent
      }
    };
  });
}
async function separateDownload(name) {
  const pending = separatePlayer.waitForEvent('download');
  await separatePlayer.click('#playtest-download');
  const download = await pending;
  const path = resolve(evidenceDir, name);
  await download.saveAs(path);
  assert.equal(await download.failure(), null);
  return readFile(path);
}
async function singleReview() {
  return page.locator('#playtest-review').evaluate(element => ({
    text: element.textContent,
    opened: element.querySelector('details')?.open,
    visibleEvents: element.querySelectorAll('li').length
  }));
}

// The probe only controls browser File reads and observes completion of native
// digests. It never substitutes parsed records, validation or aggregate output.
async function installReadProbe() {
  await page.evaluate(() => {
    const probe = {
      originalText: File.prototype.text,
      originalDigest: crypto.subtle.digest,
      reads: [], gates: new Set(), pending: new Map(), digests: 0
    };
    globalThis.__cohortReadProbe = probe;
    File.prototype.text = function () {
      const file = this;
      probe.reads.push(file.name);
      if (!probe.gates.has(file.name)) return probe.originalText.call(file);
      return new Promise((resolveRead, rejectRead) => {
        probe.pending.set(file.name, async fail => {
          probe.pending.delete(file.name);
          probe.gates.delete(file.name);
          if (fail) rejectRead(new Error('Deliberate stale file-read failure'));
          else resolveRead(await probe.originalText.call(file));
          await Promise.resolve();
        });
      });
    };
    crypto.subtle.digest = function (...args) {
      probe.digests++;
      return probe.originalDigest.apply(this, args).finally(() => { probe.digests--; });
    };
  });
}
async function gate(names) {
  await page.evaluate(values => {
    for (const name of values) globalThis.__cohortReadProbe.gates.add(name);
  }, names);
}
async function gatedSelection(path, name) {
  await page.setInputFiles('#playtest-cohort-files', path);
  await page.waitForFunction(value => globalThis.__cohortReadProbe.pending.has(value), name);
  await cohortState('loading');
}
async function release(name, fail = false) {
  await page.evaluate(async ({ name, fail }) => {
    const resume = globalThis.__cohortReadProbe.pending.get(name);
    if (!resume) throw new Error('Expected pending File.text gate: ' + name);
    await resume(fail);
  }, { name, fail });
  await page.waitForFunction(() => globalThis.__cohortReadProbe.digests === 0);
  // An animation frame follows the promise reactions that publish or discard
  // the completed read. This avoids a fixed sleep for the overlap assertions.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => done())));
}
async function browserFiles(kind, raw) {
  await page.evaluate(({ kind, raw }) => {
    const probe = globalThis.__cohortReadProbe;
    probe.reads.length = 0;
    const files = [];
    const file = (name, parts) => new File(parts, name, { type: 'application/json' });
    if (kind === 'too-many' || kind === 'exact-count') {
      for (let index = 0; index < (kind === 'too-many' ? 101 : 100); index++) {
        files.push(file('count-' + index + '.json', [raw]));
      }
    } else if (kind === 'too-large') {
      files.push(file('over-20mb.json', [new Uint8Array(20_000_001)]));
    } else if (kind === 'too-large-combined') {
      for (let index = 0; index < 3; index++) {
        files.push(file('combined-' + index + '.json', [new Uint8Array(14_000_000)]));
      }
    } else if (kind === 'exact-bytes') {
      const length = new TextEncoder().encode(raw).length;
      const padding = new Uint8Array(20_000_000 - length).fill(32);
      files.push(file('exact-a.json', [raw, padding]), file('exact-b.json', [raw, padding]));
    } else throw new Error('Unknown bounded browser-file course');
    const transfer = new DataTransfer();
    for (const item of files) transfer.items.add(item);
    const input = document.getElementById('playtest-cohort-files');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { kind, raw });
}

try {
  // Reuse the maintained real-player course, including its actual downloaded
  // files and CLI receiving, instead of inventing a second fake browser source.
  const source = spawnSync(process.execPath, ['tests/playtest-cohort-receiver.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 4_000_000,
    env: { ...process.env, LUDO_EVIDENCE_DIR: sourceEvidenceDir }
  });
  assert.equal(source.error, undefined);
  assert.equal(source.signal, null);
  assert.equal(source.status, 0, source.stderr || source.stdout);
  const sourceReceipt = JSON.parse(await readFile(resolve(sourceEvidenceDir, 'cohort-browser-receipt.json'), 'utf8'));
  assert.equal(sourceReceipt.passed, true);
  receipt.sourceCourse = { passed: sourceReceipt.passed, checks: sourceReceipt.checks };
  const records = [];
  for (const name of recordNames) {
    const path = resolve(sourceEvidenceDir, name), bytes = await readFile(path);
    const record = await readPlaytestRecord(bytes.toString('utf8'));
    records.push({ name, path, bytes, record });
    receipt.inputs.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const paths = records.map(record => record.path);
  const hash = records[0].record.integrity.episodeSha256;
  const fullInputs = { verifiedFiles: 5, uniqueSessions: 2, duplicateFiles: 1, supersededSnapshots: 2 };
  const oneInputs = { verifiedFiles: 1, uniqueSessions: 1, duplicateFiles: 0, supersededSnapshots: 0 };
  assert.deepEqual(sourceReceipt.cohort.inputs, fullInputs);
  assert.deepEqual(sourceReceipt.cohort.episodes[0].recorded, twoSessionTotals);

  const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
  const receiver = await startReceiver();
  server = receiver.server;
  receipt.url = receiver.url;
  browser = await chromium.launch({
    headless: true, executablePath: '/usr/bin/google-chrome-stable',
    chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--enable-automation']
  });
  const cdp = await browser.newBrowserCDPSession();
  const command = await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(arg => arg === '--no-sandbox' || arg === '--disable-setuid-sandbox'), false);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  page = await context.newPage();
  await page.goto('chrome://sandbox');
  receipt.sandbox = await page.locator('body').innerText();
  assert.match(receipt.sandbox, /Seccomp-BPF sandbox\s+Yes/i);
  observe(page);
  await page.goto(receiver.url);
  await page.locator('#case-select option').first().waitFor({ state: 'attached' });
  await page.selectOption('#case-select', 'en-original');
  assert.equal(await page.locator('#playtest-cohort-files').evaluate(input => input.multiple), true);
  assert.equal(await page.locator('#playtest-cohort-status').getAttribute('role'), 'status');
  assert.equal(await page.locator('#playtest-cohort-result').isVisible(), false);

  const invalid = await save('invalid-first-selection.json', '{');
  await selectCohort(invalid, 'error');
  assert.equal(await page.locator('#playtest-cohort-result').isVisible(), false);
  assert.equal(await page.locator('#playtest-cohort-result [data-cohort-input]').count(), 0);
  check('A failed first selection produces an error without a report or inherited verification');

  await page.fill('#episode-title-input', (await page.locator('#episode-title-input').inputValue()) + ' — preserved author draft');
  await page.fill('#episode-story-input', (await page.locator('#episode-story-input').inputValue()) + '\nThis authored wording stays in the workbench.');
  await page.fill('#label-0', 'Orchid');
  await page.locator('#draft-status[data-state="saved"]').waitFor();
  await page.click('#check-button');
  await page.waitForFunction(() => !document.getElementById('export-button').disabled);
  await page.click('#compare-button');
  await page.waitForFunction(() => !document.getElementById('comparison-export-button').disabled);
  await page.click('#player-tab');
  await page.locator('#player-order li[data-card-id="star"] button[data-direction="down"]').click();
  await page.fill('#answer', 'unfinished player answer');
  await page.click('#hint-button');
  await page.click('#reveal-button');
  await page.click('#author-tab');

  const popup = page.waitForEvent('popup');
  await page.click('#launch-playtest');
  separatePlayer = await popup;
  observe(separatePlayer);
  await separatePlayer.locator('#playtest-status[data-state="ready"]').waitFor();
  await separatePlayer.click('#playtest-hint');
  await separatePlayer.fill('#playtest-answer', 'WRONG');
  await separatePlayer.locator('#playtest-answer').press('Enter');
  const separateBefore = await separateDownload('separate-player-before-cohort.json');
  const authoredBefore = await authorState();
  assert.match(authoredBefore.digest, /^[a-f0-9]{64}$/);
  assert.match(authoredBefore.comparisonDigest, /^[a-f0-9]{64}$/);
  assert.ok(authoredBefore.drafts.length);

  await page.locator('#review-playtest-cohort').focus();
  const choose = page.waitForEvent('filechooser');
  await page.locator('#review-playtest-cohort').press('Enter');
  const chooser = await choose;
  assert.equal(chooser.isMultiple(), true);
  await chooser.setFiles(paths);
  await cohortState('ready');
  await assertDisplayed(fullInputs, [[hash, twoSessionTotals]]);
  assert.equal(await page.locator('#playtest-cohort-result article h5').first().innerText(), records[0].record.episode.title);
  assert.deepEqual(await authorState(), authoredBefore);
  await selectCohort(paths);
  await assertDisplayed(fullInputs, [[hash, twoSessionTotals]]);
  check('Keyboard file selection reviews actual downloads with literal CLI-parity totals; the same files can be selected again');

  const accepted = await displayedCohort();
  await selectCohort([...paths, invalid], 'error');
  assert.deepEqual(await displayedCohort(), accepted);
  assert.equal(await page.locator('#playtest-cohort-result').getAttribute('data-retained'), 'true');
  assert.match(await page.locator('#playtest-cohort-result').innerText(), /Previous verified report retained/);
  const conflictingA = await save('conflicting-a.json',
    await createPlaytestRecord(records[0].record.episode, 'cohort-browser-conflict', [{ type: 'hint', elapsedMs: 0 }]));
  const conflictingB = await save('conflicting-b.json',
    await createPlaytestRecord(records[0].record.episode, 'cohort-browser-conflict', [{ type: 'reveal', elapsedMs: 0 }]));
  await selectCohort([records[2].path, conflictingA, conflictingB], 'error');
  assert.deepEqual(await displayedCohort(), accepted);
  assert.match(await page.locator('#playtest-cohort-status').innerText(), /Conflicting records/);
  check('Mixed malformed and conflicting selections fail atomically and explicitly retain only the previous accepted report');

  const legacy = JSON.parse(await readFile(new URL('./fixtures/playtest-v0.1-attempt.json', import.meta.url), 'utf8'));
  const current = await createPlaytestRecord(legacy.episode, legacy.sessionId, legacy.events);
  const oldPath = await save('legacy-record.json', legacy), currentPath = await save('current-equivalent-record.json', current);
  const legacyHash = (await readPlaytestRecord(legacy)).integrity.episodeSha256;
  await selectCohort([oldPath, currentPath]);
  await assertDisplayed({ verifiedFiles: 2, uniqueSessions: 1, duplicateFiles: 1, supersededSnapshots: 0 },
    [[legacyHash, { ...zero, attempts: 1, moves: 3 }]]);
  check('Historical and current encodings normalize through the maintained reader into one recorded session');

  const longEpisode = structuredClone(records[0].record.episode);
  longEpisode.title = 'Árbol漢字'.repeat(90) + ' <img src=cohort-markup-probe onerror="globalThis.__cohortMarkupRan=true">';
  const longRecord = await createPlaytestRecord(longEpisode, 'cohort-browser-long-title', []);
  const longHash = (await readPlaytestRecord(longRecord)).integrity.episodeSha256;
  const longPath = await save('same-id-long-title.json', longRecord);
  await selectCohort([records[2].path, longPath]);
  const twoGroups = await displayedCohort();
  await assertDisplayed({ verifiedFiles: 2, uniqueSessions: 2, duplicateFiles: 0, supersededSnapshots: 0 },
    [[hash, completedSession], [longHash, zero]]);
  assert.equal(await page.locator('[data-episode-sha256="' + longHash + '"] h5').innerText(), longEpisode.title);
  assert.equal(await page.locator('#playtest-cohort-result img').count(), 0);
  assert.equal(await page.evaluate(() => globalThis.__cohortMarkupRan), undefined);
  for (const locale of ['es', 'en']) {
    await page.selectOption('#ui-language', locale);
    assert.deepEqual(await displayedCohort(), twoGroups);
    assert.equal(await page.locator('[data-episode-sha256="' + longHash + '"] h5').innerText(), longEpisode.title);
    if (locale === 'es') {
      assert.equal(await page.locator('#review-playtest-cohort').innerText(), 'Revisar varios registros de juego');
      assert.match(await page.locator('#playtest-cohort-status').innerText(), /^Archivos verificados:/);
      assert.match(await page.locator('#playtest-cohort-result').innerText(), /Intentos registrados/);
    }
  }
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#playtest-cohort-result').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.locator('#playtest-cohort-result').screenshot({ path: resolve(evidenceDir, 'browser-cohort-' + width + '.png') });
  }
  await page.click('#player-tab');
  assert.equal(await page.locator('#review-playtest-cohort').isVisible(), false);
  assert.equal(await page.locator('#playtest-cohort-result').isVisible(), false);
  await page.click('#author-tab');
  check('Exact hashes separate equal IDs and revisions; EN/ES preserves evidence, literal Unicode text and safe 390px/desktop layout');

  await installReadProbe();
  await selectCohort(paths);
  const lateA = await save('late-success-a.json', records[0].bytes);
  const laterB = await save('late-success-b.json', records[2].bytes);
  await gate(['late-success-a.json', 'late-success-b.json']);
  await gatedSelection(lateA, 'late-success-a.json');
  await gatedSelection(laterB, 'late-success-b.json');
  await release('late-success-b.json');
  await cohortState('ready');
  await assertDisplayed(oneInputs, [[hash, completedSession]]);
  await release('late-success-a.json');
  await cohortState('ready');
  await assertDisplayed(oneInputs, [[hash, completedSession]]);

  await selectCohort(paths);
  const errorA = await save('stale-error-a.json', records[0].bytes);
  const pendingB = await save('stale-error-b.json', records[2].bytes);
  await gate(['stale-error-a.json', 'stale-error-b.json']);
  await gatedSelection(errorA, 'stale-error-a.json');
  await gatedSelection(pendingB, 'stale-error-b.json');
  await page.selectOption('#ui-language', 'es');
  await release('stale-error-a.json', true);
  await cohortState('loading');
  assert.match(await page.locator('#playtest-cohort-status').innerText(), /^Comprobando/);
  assert.equal(await page.locator('#playtest-cohort-status').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('#playtest-cohort-files').evaluate(input => input.files[0]?.name), 'stale-error-b.json');
  await assertDisplayed(fullInputs, [[hash, twoSessionTotals]]);
  await release('stale-error-b.json');
  await cohortState('ready');
  assert.match(await page.locator('#playtest-cohort-status').innerText(), /^Archivos verificados:/);
  await assertDisplayed(oneInputs, [[hash, completedSession]]);
  await page.selectOption('#ui-language', 'en');
  check('A late older success cannot replace a newer report; a stale error cannot clear a pending picker, busy state or current locale');

  const independent = await save('independent-cohort-read.json', records[2].bytes);
  await gate(['independent-cohort-read.json']);
  await gatedSelection(independent, 'independent-cohort-read.json');
  await page.setInputFiles('#playtest-record-file', records[4].path);
  await page.locator('#playtest-review-status').filter({ hasText: 'Record verified' }).waitFor();
  assert.match(await page.locator('#playtest-review').innerText(), new RegExp(records[4].record.sessionId));
  await page.locator('#playtest-review details summary').click();
  const individualBefore = await singleReview();
  assert.equal(individualBefore.opened, true);
  await release('independent-cohort-read.json');
  await cohortState('ready');
  await assertDisplayed(oneInputs, [[hash, completedSession]]);
  assert.deepEqual(await singleReview(), individualBefore);
  for (const locale of ['es', 'en']) {
    await page.selectOption('#ui-language', locale);
    assert.equal((await singleReview()).opened, true);
    await assertDisplayed(oneInputs, [[hash, completedSession]]);
  }
  assert.deepEqual(await singleReview(), individualBefore);
  check('Single-record review completes during a pending cohort read and retains its accepted expanded journey through completion and localization');

  const rawEmpty = records[0].bytes.toString('utf8');
  for (const kind of ['too-many', 'too-large', 'too-large-combined']) {
    const previous = await displayedCohort();
    await browserFiles(kind, rawEmpty);
    await cohortState('error');
    assert.deepEqual(await page.evaluate(() => globalThis.__cohortReadProbe.reads), []);
    assert.deepEqual(await displayedCohort(), previous);
    assert.equal(await page.locator('#playtest-cohort-result').getAttribute('data-retained'), 'true');
  }
  await browserFiles('exact-count', rawEmpty);
  await cohortState('ready');
  await assertDisplayed({ verifiedFiles: 100, uniqueSessions: 1, duplicateFiles: 99, supersededSnapshots: 0 }, [[hash, zero]]);
  assert.equal(await page.evaluate(() => globalThis.__cohortReadProbe.reads.length), 100);
  await browserFiles('exact-bytes', rawEmpty);
  await cohortState('ready');
  await assertDisplayed({ verifiedFiles: 2, uniqueSessions: 1, duplicateFiles: 1, supersededSnapshots: 0 }, [[hash, zero]]);
  assert.deepEqual(await page.evaluate(() => globalThis.__cohortReadProbe.reads), ['exact-a.json', 'exact-b.json']);
  check('Real browser File limits reject oversized selections before any read and accept exactly 100 files and two valid 20MB files');

  await selectCohort(paths);
  await assertDisplayed(fullInputs, [[hash, twoSessionTotals]]);
  assert.deepEqual(await authorState(), authoredBefore);
  assert.deepEqual(await singleReview(), individualBefore);
  const separateAfter = await separateDownload('separate-player-after-cohort.json');
  assert.deepEqual(separateAfter, separateBefore);
  for (const record of records) assert.deepEqual(await readFile(record.path), record.bytes);
  receipt.finalReport = await displayedCohort();
  receipt.preservedSeparateJournalSha256 = sha256(separateAfter);
  check('Author drafts, checked exports/comparison, embedded player, separate player journal and original downloaded bytes remain unchanged');

  // Review captures of the ordinary five-file result, in addition to the long
  // content stress captures above. These add artifacts, not another test claim.
  const cohortSection = page.locator('.playtest-cohort[aria-labelledby="playtest-cohort-heading"]');
  await page.selectOption('#ui-language', 'en');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await cohortSection.scrollIntoViewIfNeeded();
  await cohortSection.screenshot({ path: resolve(evidenceDir, 'browser-cohort-real-desktop.png') });
  await page.selectOption('#ui-language', 'es');
  await page.setViewportSize({ width: 390, height: 1000 });
  await cohortSection.scrollIntoViewIfNeeded();
  await cohortSection.screenshot({ path: resolve(evidenceDir, 'browser-cohort-real-mobile-es.png') });
  await page.selectOption('#ui-language', 'en');
  await page.setViewportSize({ width: 1280, height: 1000 });
  receipt.reviewCaptures = [
    'browser-cohort-real-desktop.png',
    'browser-cohort-real-mobile-es.png'
  ];

  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.failedRequests, []);
  assert.deepEqual(receipt.httpErrors, []);
  receipt.passed = true;
} catch (error) {
  receipt.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  if (page) await page.screenshot({ path: resolve(evidenceDir, 'browser-cohort-failure.png'), fullPage: true }).catch(() => {});
} finally {
  receipt.finishedAt = new Date().toISOString();
  if (browser) await browser.close();
  if (server) await new Promise(done => server.close(done));
  await writeFile(resolve(evidenceDir, 'browser-cohort-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
