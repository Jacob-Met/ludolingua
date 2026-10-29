import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startReceiver } from '../serve.mjs';
import { createExport, canonicalJSON } from '../lib/export.mjs';
import { checkAttempt } from '../lib/engine.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const out = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const historicalPath = fileURLToPath(new URL('./fixtures/duplicate-name-before-display-repair.json', import.meta.url));
const historical = await readPlaytestRecord(await readFile(historicalPath, 'utf8'));
const episode = historical.episode;
const expected = { key: 'Pine (key) [1]', bell: 'Pine (bell)', moon: 'Pine (key) [3]', star: 'Nest' };
const ids = ['key', 'bell', 'moon', 'star'], wrongOrder = ['bell', 'key', 'moon', 'star'];
const sourceText = canonicalJSON(episode);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { schema: 'ludolingua.portable-card-identity-receiving.v1', startedAt: new Date().toISOString(),
  fixture: 'duplicate-name-before-display-repair.json', episodeSha256: historical.integrity.episodeSha256,
  checks: [], downloads: [], offlineDocuments: [], errors: [], sandboxEnabled: true, passed: false };
const check = name => receipt.checks.push(name);
let browser, server, webContext, offlineContext, lastPage;
function observe(page) {
  lastPage = page;
  page.on('pageerror', e => receipt.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') receipt.errors.push(m.text()); });
}
async function download(page, selector, name) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const item = await pending, path = resolve(out, name); await item.saveAs(path);
  assert.equal(await item.failure(), null);
  const bytes = await readFile(path);
  receipt.downloads.push({ name, bytes: bytes.length, sha256: hash(bytes) });
  return { path, bytes };
}
async function record(page, name) {
  const file = await download(page, '#playtest-download', name);
  const value = await readPlaytestRecord(file.bytes.toString('utf8'));
  assert.equal(value.integrity.verified, true);
  assert.equal(canonicalJSON(value.episode), sourceText);
  assert.equal(value.integrity.episodeSha256, historical.integrity.episodeSha256);
  assert.deepEqual(value.episode.cards.map(c => c.label), ['Pine', 'Pine', 'Pine (key)', 'Nest']);
  return { ...file, value };
}
async function order(page) {
  return page.locator('#playtest-cards li').evaluateAll(nodes => nodes.map(n => n.dataset.cardId));
}
async function names(page) {
  const actual = await page.locator('#playtest-cards li').evaluateAll(nodes =>
    nodes.map(n => [n.dataset.cardId, n.querySelector('.keeper-label').textContent]));
  assert.equal(actual.length, 4);
  assert.deepEqual(Object.fromEntries(actual), expected);
  assert.equal(new Set(actual.map(([, text]) => text.normalize('NFC').replace(/\s+/gu, ' ').trim())).size, 4);
  const es = await page.locator('#playtest-ui-language').inputValue() === 'es';
  for (const [id, label] of actual) for (const direction of ['up', 'down']) {
    const wanted = es ? (direction === 'up' ? 'Subir ' : 'Bajar ') + label : 'Move ' + label + ' ' + direction;
    assert.equal(await page.locator('#playtest-cards li[data-card-id="' + id + '"] button[data-direction="' + direction + '"]').getAttribute('aria-label'), wanted);
  }
}
async function arrange(page, wanted) {
  for (let target = 0; target < wanted.length; target++) {
    const current = await order(page);
    assert.deepEqual([...current].sort(), [...ids].sort());
    for (let position = current.indexOf(wanted[target]); position > target; position--) {
      const button = page.locator('#playtest-cards li[data-card-id="' + wanted[target] + '"] button[data-direction="up"]');
      await button.focus(); await page.keyboard.press('Enter');
      assert.equal((await order(page))[position - 1], wanted[target]);
      await names(page);
    }
  }
  assert.deepEqual(await order(page), wanted);
}
async function attempt(page) {
  await page.fill('#playtest-answer', 'PPPN'); await page.locator('#playtest-answer').press('Enter');
}
async function course(page, prefix) {
  await names(page);
  const clues = await page.locator('#playtest-clues').innerText();
  for (const name of Object.values(expected)) assert.ok(clues.includes(name));
  await arrange(page, wrongOrder); await attempt(page);
  const wrong = await record(page, prefix + '-wrong.json');
  assert.equal(wrong.value.validation.result.summary.attempts, 1);
  assert.equal(wrong.value.validation.result.summary.successfulAttempts, 0);
  assert.deepEqual(wrong.value.validation.result.finalState.order, wrongOrder);
  await page.locator('#playtest-hint').click();
  await arrange(page, ids); await attempt(page); await page.locator('#playtest-reveal').click();
  assert.equal((await page.locator('#playtest-solution .path').innerText()).trim(), ids.map(id => expected[id]).join(' → ') + ' → PPPN');
  await page.locator('#playtest-reset').click(); await names(page);
  await arrange(page, ids); await attempt(page);
  const result = await record(page, prefix + '-record.json'), summary = result.value.validation.result.summary;
  assert.equal(summary.attempts, 3); assert.equal(summary.successfulAttempts, 2);
  assert.equal(summary.hintsShown, 1); assert.equal(summary.revealUsed, true); assert.equal(summary.resets, 1);
  return result;
}
function semantic(value) {
  const { firstSuccessMs, elapsedMs, ...summary } = value.validation.result.summary;
  return { episode: value.episode, events: value.events.map(({ elapsedMs, ...event }) => event),
    finalState: value.validation.result.finalState, summary };
}
async function offline(file) {
  const page = await offlineContext.newPage(); observe(page);
  const item = { file, requests: [], failedRequests: [] }; receipt.offlineDocuments.push(item);
  page.on('request', r => item.requests.push(r.url()));
  page.on('requestfailed', r => item.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
  await page.goto(pathToFileURL(file).href); await page.locator('#portable-status[data-state="ready"]').waitFor();
  return page;
}
async function continuation(file, saved, prefix, historicalInput = false) {
  const page = await offline(file);
  await page.setInputFiles('#playtest-resume-file', saved.path); await page.locator('#playtest-session').waitFor({ state: 'visible' });
  await names(page);
  assert.deepEqual(await order(page), saved.value.validation.result.finalState.order);
  assert.equal(await page.locator('#playtest-hints p').count(), saved.value.validation.result.finalState.visibleHintCount);
  assert.equal(await page.locator('#playtest-solution').isVisible(), saved.value.validation.result.finalState.revealed);
  const before = await record(page, prefix + '-before-action.json');
  assert.equal(before.value.sessionId, saved.value.sessionId);
  assert.deepEqual(before.value.events, saved.value.events);
  if (historicalInput) {
    assert.deepEqual(await order(page), ['key', 'star', 'bell', 'moon']);
    assert.equal(await page.locator('#playtest-hints p').count(), 1);
    await arrange(page, ids);
  }
  await attempt(page);
  const after = await record(page, prefix + '-after-action.json');
  assert.equal(after.value.sessionId, saved.value.sessionId);
  assert.deepEqual(after.value.events.slice(0, saved.value.events.length), saved.value.events);
  assert.ok(after.value.events.length > saved.value.events.length);
  assert.ok(after.value.events.slice(saved.value.events.length).every(e => e.elapsedMs >= saved.value.validation.result.summary.elapsedMs));
  assert.equal(after.value.validation.result.summary.successfulAttempts, saved.value.validation.result.summary.successfulAttempts + 1);
  assert.deepEqual(after.value.validation.result.finalState.order, ids);
  await page.selectOption('#playtest-ui-language', 'es'); await names(page);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: resolve(out, prefix + '-spanish-mobile.png'), fullPage: true });
  await page.close();
  return { priorEvents: saved.value.events.length, resultingEvents: after.value.events.length,
    sessionId: after.value.sessionId, sha256: hash(after.bytes) };
}
try {
  assert.equal(checkAttempt(episode, wrongOrder, 'PPPN').token, 'PPPN');
  assert.equal(checkAttempt(episode, wrongOrder, 'PPPN').success, false);
  assert.equal(checkAttempt(episode, ids, 'PPPN').success, true);
  const exported = await createExport(episode), sourcePath = resolve(out, 'collision-episode.json');
  await writeFile(sourcePath, JSON.stringify(exported));
  const started = await startReceiver(); server = started.server;
  browser = await chromium.launch({ executablePath: process.env.LUDO_BROWSER || '/usr/bin/google-chrome-stable', headless: true, chromiumSandbox: true });
  webContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const author = await webContext.newPage(); observe(author); await author.goto(started.url);
  await author.locator('#episode-title-input').waitFor();
  await author.setInputFiles('#import-file', sourcePath);
  await author.waitForFunction(title => document.getElementById('episode-title-input').value === title, episode.title);
  await author.selectOption('#ui-language', 'en');
  assert.equal(await author.locator('#create-episode-link').count(), 1);
  const firstChoices = await author.locator('#clue-editor select[data-field="left"]').first().locator('option').evaluateAll(ns => ns.map(n => [n.value, n.textContent]));
  assert.deepEqual(Object.fromEntries(firstChoices), expected);
  const sourceBefore = await download(author, '#export-button', 'author-before.json');
  const html = await download(author, '#download-portable-player', 'collision-player.html');
  const sourceAfter = await download(author, '#export-button', 'author-after.json');
  assert.deepEqual(sourceAfter.bytes, sourceBefore.bytes);
  assert.equal(canonicalJSON(JSON.parse(sourceAfter.bytes.toString()).episode), sourceText);
  receipt.html = { bytes: html.bytes.length, sha256: hash(html.bytes) };
  check('Actual author export keeps raw labels, IDs and exact episode bytes while choices display distinct names');
  const regular = await webContext.newPage(); observe(regular);
  await regular.goto(new URL('/web/playtest.html', started.url).href);
  await regular.setInputFiles('#playtest-file', sourcePath); await regular.locator('#playtest-session').waitFor({ state: 'visible' });
  const regularRecord = await course(regular, 'http');
  check('Maintained player distinguishes all card and accessible names; a same-token wrong-ID order fails and the intended order succeeds');
  await webContext.close(); webContext = null;
  await new Promise(done => { server.close(done); server.closeIdleConnections?.(); }); server = null;
  offlineContext = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  await offlineContext.setOffline(true);
  const player = await offline(html.path);
  await player.locator('#portable-start').focus(); await player.keyboard.press('Enter');
  await player.locator('#playtest-session').waitFor({ state: 'visible' });
  const offlineRecord = await course(player, 'offline');
  assert.deepEqual(semantic(offlineRecord.value), semantic(regularRecord.value));
  await player.screenshot({ path: resolve(out, 'offline-card-identities-desktop.png'), fullPage: true }); await player.close();
  check('Downloaded HTML works after server shutdown with networking disabled; all identity, clue, movement, attempt, hint, reveal and reset semantics match the maintained player');
  receipt.currentContinuation = await continuation(html.path, offlineRecord, 'continued-current');
  check('A downloaded offline record continues with the exact prior session and event prefix, then appends a successful attempt');
  receipt.historicalContinuation = await continuation(html.path, { path: historicalPath, value: historical }, 'continued-historical', true);
  check('The unchanged pre-repair synthetic record resumes exact order, hint, raw content and history before new actions; repaired names remain stable in narrow Spanish controls');
  for (const item of receipt.offlineDocuments) {
    assert.deepEqual(item.requests, [pathToFileURL(item.file).href]); assert.deepEqual(item.failedRequests, []);
  }
  assert.deepEqual(receipt.errors, []);
  receipt.semanticParity = true; receipt.serverStoppedBeforeOffline = true; receipt.passed = true;
} catch (error) {
  receipt.failure = String(error.stack || error); process.exitCode = 1;
  if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  receipt.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'PORTABLE-CARD-RECEIPT.json'), JSON.stringify(receipt, null, 2) + '\n');
  await offlineContext?.close(); await webContext?.close(); await browser?.close();
  if (server) await new Promise(done => { server.close(done); server.closeIdleConnections?.(); });
  console.log(JSON.stringify(receipt));
}
