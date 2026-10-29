import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startReceiver } from '../serve.mjs';
import { readExport } from '../lib/export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const { server, url } = await startReceiver();
const key = 'ludolingua.workbench.v1';
let browser, page;
const receipt = { schema: 'ludolingua.workspace-receiving.v1', startedAt: new Date().toISOString(), checks: [], errors: [], failedRequests: [], httpErrors: [], passed: false };
const checked = name => receipt.checks.push(name);
async function stored() { return page.evaluate(k => localStorage.getItem(k), key); }
async function seed(value) { await page.evaluate(({ k, value }) => value === null ? localStorage.removeItem(k) : localStorage.setItem(k, value), { k: key, value }); }
async function unchecked() {
  assert.equal(await page.locator('#export-button').isDisabled(), true);
  assert.equal(await page.locator('#comparison-export-button').isDisabled(), true);
  assert.equal(await page.locator('#digest').textContent(), '');
  assert.equal(await page.locator('#comparison-digest').textContent(), '');
  assert.equal(await page.locator('.result-state.verified').count(), 0);
  assert.equal(await page.locator('#comparison-status').getAttribute('data-preserved'), 'unchecked');
}
async function restore() { await page.click('#restore-workspace'); }
async function noticeError() { await page.locator('#notice.error').waitFor(); assert.ok((await page.locator('#notice').innerText()).trim().length > 12); }
async function throwStorage(method, name) {
  await page.evaluate(({ method, name }) => {
    const original = Storage.prototype[method];
    window.releaseWorkspaceStorage = () => { Storage.prototype[method] = original; delete window.releaseWorkspaceStorage; };
    Storage.prototype[method] = function (...args) { if (args[0] === 'ludolingua.workbench.v1') throw new DOMException('Controlled browser storage failure', name); return original.apply(this, args); };
  }, { method, name });
}
try {
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome-stable', chromiumSandbox: true, args: ['--disable-dev-shm-usage'] });
  const cdp = await browser.newBrowserCDPSession(), command = await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(x => x === '--no-sandbox' || x === '--disable-setuid-sandbox'), false);
  const context = await browser.newContext({ locale: 'es-MX', viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  page = await context.newPage(); await page.goto('chrome://sandbox'); receipt.sandbox = await page.locator('body').innerText(); assert.match(receipt.sandbox, /Seccomp-BPF sandbox\s+Yes/i);
  page.on('pageerror', e => receipt.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') receipt.errors.push(m.text()); });
  page.on('requestfailed', r => receipt.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
  page.on('response', r => { if (r.status() >= 400) receipt.httpErrors.push({ url: r.url(), status: r.status() }); });
  await page.goto(url); await page.locator('#case-select option').first().waitFor({ state: 'attached' });
  assert.match(await page.locator('#save-workspace').innerText(), /guardar/i);
  await page.selectOption('#case-select', 'es-adapted');
  await page.click('#use-current-as-source');
  await page.fill('#label-1', 'Bote');
  await page.fill('#label-0', '');
  const relation = page.locator('#clue-editor .clue-row').first().locator('select[data-field="kind"]');
  await relation.selectOption('after');
  await page.locator('.hint-editing summary').click();
  const rawHints = 'Primera ayuda.\n\nSegunda ayuda.\n';
  await page.fill('#hint-editor', rawHints);
  await page.locator('#mapping-editor [data-source-id="key"] select').selectOption('bell');
  const revision = (await page.locator('#revision').innerText()).match(/\d+/)[0];
  await page.click('#save-workspace');
  const dirtySaved = await stored(); assert.ok(dirtySaved); assert.equal(JSON.parse(dirtySaved).schema, 'ludolingua.workspace.v1');
  await page.reload(); await page.locator('#case-select option').first().waitFor({ state: 'attached' });
  await restore();
  assert.equal(await page.locator('#label-0').inputValue(), '');
  assert.equal(await page.locator('#label-1').inputValue(), 'Bote');
  assert.equal(await relation.inputValue(), 'after');
  assert.equal(await page.locator('#hint-editor').inputValue(), rawHints);
  assert.equal(await page.locator('#mapping-editor [data-source-id="key"] select').inputValue(), 'bell');
  assert.match(await page.locator('#source-summary').innerText(), /Agua.*Barco.*Roca.*Estrella/s);
  assert.equal((await page.locator('#revision').innerText()).match(/\d+/)[0], revision);
  assert.equal(await page.locator('#ui-language').inputValue(), 'es');
  await unchecked();
  checked('Actual reload and explicit restore retain invalid/dirty labels, typed clues, raw hint blank lines, Spanish UI and captured source/mapping without validation');

  // Build a valid played puzzle, including deliberate reveal, then retain it through reload.
  await page.selectOption('#case-select', 'es-adapted'); await page.selectOption('#source-select', 'en-original');
  await page.click('#check-button'); await page.locator('.result-state.verified').waitFor();
  await page.click('#compare-button'); await page.locator('#comparison-status[data-preserved="true"]').waitFor();
  const comparisonDownloadEvent = page.waitForEvent('download');
  await page.click('#comparison-export-button');
  const comparisonDownload = await comparisonDownloadEvent;
  const comparisonPath = resolve(evidenceDir, 'workspace-before-save-comparison.json');
  await comparisonDownload.saveAs(comparisonPath);
  await page.click('#player-tab');
  const move = page.locator('#player-order li[data-card-id="star"] button[data-direction="down"]'); await move.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
  await page.fill('#answer', 'abre'); await page.locator('#answer').press('Enter');
  await page.locator('#player-feedback').filter({ hasText: 'La acción funciona' }).waitFor();
  await page.click('#hint-button'); await page.click('#reveal-button');
  const hints = await page.locator('#hints').textContent();
  const order = await page.locator('.keeper-label').allTextContents();
  await page.click('#save-workspace'); const playedSaved = await stored();
  await page.reload(); await page.locator('#case-select option').first().waitFor({ state: 'attached' }); await restore();
  assert.equal(await page.locator('#player').isVisible(), true);
  assert.equal(await page.locator('#player-tab').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#author').isVisible(), false);
  assert.deepEqual(await page.locator('.keeper-label').allTextContents(), order);
  assert.equal(await page.locator('#answer').inputValue(), 'abre');
  assert.equal(await page.locator('#hints').textContent(), hints);
  assert.equal(await page.locator('#reveal').isVisible(), true);
  assert.match(await page.locator('#reveal').innerText(), /ABRE/);
  await page.click('#author-tab'); await unchecked();
  await page.click('#check-button'); await page.locator('.result-state.verified').waitFor();
  const pendingDownload = page.waitForEvent('download'); await page.click('#export-button');
  const download = await pendingDownload, path = resolve(evidenceDir, 'restored-and-rechecked.json'); await download.saveAs(path);
  const verified = await readExport(await readFile(path, 'utf8')); assert.equal(verified.integrity.verified, true); assert.equal(verified.validation.result.mechanicalSuccess, true);
  checked('Played order, answer, hints and deliberate reveal survive reload; restored validation stays unchecked until a real new check and downloaded export');

  const invalidPlayed = JSON.parse(dirtySaved);
  invalidPlayed.player.attempted = true; invalidPlayed.player.revealed = true;
  invalidPlayed.player.answer = 'ABRE'; invalidPlayed.mode = 'player';
  await seed(JSON.stringify(invalidPlayed)); await restore();
  assert.equal(await page.locator('#player').isVisible(), true);
  assert.equal(await page.locator('#label-0').inputValue(), '');
  assert.equal(await page.locator('#reveal').isVisible(), true);
  assert.doesNotMatch(await page.locator('#player-feedback').innerText(), /La acción funciona|The action works/);
  assert.match(await page.locator('#reveal').innerText(), /no cumple|no pasa|no supera|does not pass|no es v[aá]lid|no v[aá]lid/i);
  await page.click('#author-tab'); await unchecked();
  checked('Dirty structurally valid save with attempted/revealed flags recomputes failure instead of importing a successful play result');

  for (const [input, file] of [['#import-file', path], ['#comparison-import-file', comparisonPath]]) {
    await page.selectOption('#case-select', 'en-ambiguous');
    await seed(dirtySaved);
    await page.evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        const file = this;
        return new Promise(resolveRead => { window.releaseWorkspaceImport = () => { File.prototype.text = original; original.call(file).then(resolveRead); }; });
      };
    });
    await page.setInputFiles(input, file);
    await page.waitForFunction(() => typeof window.releaseWorkspaceImport === 'function');
    await restore();
    assert.equal(await page.locator('#label-1').inputValue(), 'Bote');
    await page.evaluate(() => { window.releaseWorkspaceImport(); delete window.releaseWorkspaceImport; });
    await noticeError();
    assert.equal(await page.locator('#label-0').inputValue(), '');
    assert.equal(await page.locator('#label-1').inputValue(), 'Bote');
    assert.equal(await page.locator('#hint-editor').inputValue(), rawHints);
    assert.equal(await page.locator('#mapping-editor [data-source-id="key"] select').inputValue(), 'bell');
    await unchecked();
  }
  checked('Explicit workspace restoration invalidates pending episode and comparison imports so delayed reads cannot overwrite restored state');


  // Evidence fields are never authority for a saved draft. A strict codec may reject extra fields.
  const forged = JSON.parse(playedSaved);
  Object.assign(forged, { result: { valid: true, outcome: 'verified' }, digest: '0'.repeat(64), checked: { validation: { result: { mechanicalPreserved: true } } } });
  await page.fill('#label-1', 'Bote'); await seed(JSON.stringify(forged)); await restore();
  await unchecked();
  checked('Serialized forged validation cannot enable episode or comparison export');

  for (const [label, bad] of [['missing', null], ['malformed', '{'], ['unknown schema', JSON.stringify({ ...JSON.parse(playedSaved), schema: 'ludolingua.workspace.v999' })]]) {
    await page.fill('#label-1', `Live ${label}`); await seed(bad); await restore(); await noticeError();
    assert.equal(await page.locator('#label-1').inputValue(), `Live ${label}`);
    assert.equal(await stored(), bad);
  }
  checked('Missing, malformed and unknown-schema saved copies never replace live work or silently rewrite storage');

  await seed(playedSaved); await page.fill('#label-1', 'Live after save');
  for (const [method, error, button] of [['setItem', 'QuotaExceededError', '#save-workspace'], ['getItem', 'SecurityError', '#restore-workspace'], ['removeItem', 'SecurityError', '#delete-workspace']]) {
    await throwStorage(method, error); await page.click(button); await noticeError();
    assert.equal(await page.locator('#label-1').inputValue(), 'Live after save');
    await page.evaluate(() => window.releaseWorkspaceStorage());
    assert.equal(await stored(), playedSaved);
  }
  checked('Quota/security failures give useful feedback and preserve both current draft and previous good saved copy');
  await page.click('#delete-workspace'); assert.equal(await stored(), null);
  assert.equal(await page.locator('#label-1').inputValue(), 'Live after save');
  await page.selectOption('#ui-language', 'en');
  assert.match(await page.locator('#save-workspace').innerText(), /Save working copy/);
  await page.click('#save-workspace'); assert.ok(await stored());
  await page.selectOption('#ui-language', 'es');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.screenshot({ path: resolve(evidenceDir, 'workspace-spanish-narrow.png'), fullPage: true });
  checked('Explicit deletion removes only the stored copy; English/Spanish controls and 390px layout remain usable');
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.failedRequests, []); assert.deepEqual(receipt.httpErrors, []);
  receipt.passed = true;
} catch (error) {
  receipt.failure = { message: error.message, stack: error.stack };
  if (page) await page.screenshot({ path: resolve(evidenceDir, 'workspace-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString(); if (browser) await browser.close();
  await new Promise(done => server.close(done));
  await writeFile(resolve(evidenceDir, 'workspace-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
