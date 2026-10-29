import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startReceiver } from '../serve.mjs';
import { readExport } from '../lib/export.mjs';
import { readComparisonExport } from '../lib/comparison-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const { server, url } = await startReceiver();
let browser, page;
const receipt = { schema: 'ludolingua.locale-receiving.v1', startedAt: new Date().toISOString(), checks: [], errors: [], failedRequests: [], httpErrors: [], passed: false };
const checked = name => receipt.checks.push(name);
function observe(p) {
  p.on('pageerror', e => receipt.errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') receipt.errors.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400) receipt.httpErrors.push({ url: r.url(), status: r.status() }); });
  p.on('requestfailed', r => receipt.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
}
async function language(locale) {
  await page.selectOption('#ui-language', locale);
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
}
async function download(button, name) {
  const pending = page.waitForEvent('download');
  await page.click(button);
  const file = await pending, path = resolve(evidenceDir, name);
  await file.saveAs(path);
  return { path, data: JSON.parse(await readFile(path, 'utf8')) };
}
async function gateFileRead() {
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      const file = this;
      return new Promise(resolveRead => { window.releaseLocaleImport = () => { File.prototype.text = original; original.call(file).then(resolveRead); }; });
    };
  });
}
async function releaseFileRead() {
  await page.evaluate(() => { window.releaseLocaleImport(); delete window.releaseLocaleImport; });
}
try {
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome-stable', chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--enable-automation'] });
  const cdp = await browser.newBrowserCDPSession(), command = await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(x => x === '--no-sandbox' || x === '--disable-setuid-sandbox'), false);
  const context = await browser.newContext({ locale: 'es-MX', viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  page = await context.newPage();
  await page.goto('chrome://sandbox');
  receipt.sandbox = await page.locator('body').innerText();
  assert.match(receipt.sandbox, /Seccomp-BPF sandbox\s+Yes/i);
  observe(page);
  await page.goto(url);
  await page.locator('#case-select option').first().waitFor({ state: 'attached' });
  assert.equal(await page.locator('#ui-language').inputValue(), 'es');
  assert.equal(await page.locator('html').getAttribute('lang'), 'es');
  assert.equal(await page.locator('#case-select').inputValue(), 'en-original');
  assert.match(await page.locator('#check-button').innerText(), /comprobar|verificar/i);
  assert.match(await page.locator('#player-tab').innerText(), /jugar/i);
  checked('Spanish browser defaults to Spanish controls independently of the English episode');

  await page.selectOption('#case-select', 'es-adapted');
  const authored = await page.locator('#episode-story').innerText();
  const clues = await page.locator('#author-clues').innerText();
  const semanticChanges = await page.locator('#semantic-changes').textContent();
  await page.click('#check-button');
  await page.locator('.result-state.verified').waitFor();
  await page.waitForFunction(() => /[a-f0-9]{64}/.test(document.querySelector('#digest').textContent));
  await page.click('#compare-button');
  await page.locator('#comparison-status[data-preserved="true"]').waitFor();
  const first = await download('#export-button', 'locale-episode-es.json');
  const pair = await download('#comparison-export-button', 'locale-comparison-es.json');
  const verified = await readExport(first.data), compared = await readComparisonExport(pair.data);
  assert.equal(verified.integrity.verified, true);
  assert.equal(compared.source.id, 'en-original');
  assert.equal(compared.target.id, 'es-adapted');
  assert.equal(compared.validation.result.mechanicalPreserved, true);
  await page.locator('.change-note summary').click();
  await page.locator('.comparison-changes summary').click();
  await language('en');
  assert.equal(await page.locator('.change-note').evaluate(n => n.open), true);
  assert.equal(await page.locator('.comparison-changes').evaluate(n => n.open), true);
  assert.equal(await page.locator('#episode-story').innerText(), authored);
  assert.equal(await page.locator('#author-clues').innerText(), clues);
  assert.equal(await page.locator('#semantic-changes').textContent(), semanticChanges);
  assert.equal(await page.locator('#export-button').isDisabled(), false);
  assert.equal(await page.locator('#comparison-export-button').isDisabled(), false);
  assert.deepEqual((await download('#export-button', 'locale-episode-en.json')).data, first.data);
  assert.deepEqual((await download('#comparison-export-button', 'locale-comparison-en.json')).data, pair.data);
  assert.match(await page.locator('#digest').innerText(), new RegExp(verified.integrity.episodeSha256));
  assert.match(await page.locator('#comparison-digest').innerText(), new RegExp(compared.integrity.bindingSha256));
  checked('UI language preserves full episode/comparison downloads, hashes, source/target snapshots, mapping, results and authored text');

  await page.fill('#label-1', 'Bote');
  const revision = (await page.locator('#revision').innerText()).match(/\d+/)[0];
  await language('es');
  assert.equal(await page.locator('#label-1').inputValue(), 'Bote');
  assert.equal((await page.locator('#revision').innerText()).match(/\d+/)[0], revision);
  assert.equal(await page.locator('#export-button').isDisabled(), true);
  assert.equal(await page.locator('#comparison-export-button').isDisabled(), true);
  assert.match(await page.locator('#notice').innerText(), /revisi[oó]n|comprob|verific/i);
  await page.locator('.hint-editing summary').click();
  const hintDraft = 'Primera pista.\n\nSegunda pista.\n';
  await page.fill('#hint-editor', hintDraft);
  await page.locator('#hint-editor').evaluate(input => input.setSelectionRange(3, 8, 'backward'));
  const hintRevision = (await page.locator('#revision').innerText()).match(/\d+/)[0];
  await page.locator('#ui-language').evaluate(select => { select.value = 'en'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.locator('#hint-editor').inputValue(), hintDraft);
  assert.deepEqual(await page.locator('#hint-editor').evaluate(input => ({ focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection })), { focused: true, start: 3, end: 8, direction: 'backward' });
  assert.equal(await page.locator('.hint-editing').evaluate(n => n.open), true);
  assert.equal(await page.locator('.change-note').evaluate(n => n.open), true);
  assert.equal((await page.locator('#revision').innerText()).match(/\d+/)[0], hintRevision);
  assert.equal(await page.locator('#export-button').isDisabled(), true);
  await language('es');
  checked('Switching language retains unchecked label/textarea drafts, blank lines, caret and disclosure state without resurrecting validation');

  await page.selectOption('#case-select', 'es-adapted');
  assert.equal(await page.locator('#label-1').inputValue(), 'Bote');
  await page.click('#discard-draft');
  await page.locator('#draft-status[data-state="discarded"]').waitFor();
  assert.equal(await page.locator('#label-1').inputValue(), 'Barco');
  await page.click('#player-tab');
  assert.doesNotMatch(await page.locator('body').innerText(), /\bABRE\b/);
  await page.fill('#answer', 'abre'); await page.locator('#answer').press('Enter');
  await page.locator('#player-feedback').filter({ hasText: 'todavía no cumple' }).waitFor();
  const move = page.locator('#player-order li[data-card-id="star"] button[data-direction="down"]');
  await move.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
  assert.deepEqual(await page.locator('.keeper-label').allTextContents(), ['Agua', 'Barco', 'Roca', 'Estrella']);
  await page.fill('#answer', 'cerrar'); await page.locator('#answer').press('Enter');
  await page.locator('#player-feedback').filter({ hasText: 'acción no coincide' }).waitFor();
  await page.click('#hint-button');
  const hint = await page.locator('#hints').innerText();
  await page.locator('#answer').focus();
  await page.locator('#answer').evaluate(input => input.setSelectionRange(1, 3));
  // A synthetic selector change avoids moving focus into the selector itself.
  await page.locator('#ui-language').evaluate(select => { select.value = 'en'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.deepEqual(await page.locator('#answer').evaluate(input => ({ focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd })), { focused: true, start: 1, end: 3 });
  assert.equal(await page.locator('#answer').inputValue(), 'cerrar');
  assert.equal(await page.locator('#hints').innerText(), hint);
  assert.deepEqual(await page.locator('.keeper-label').allTextContents(), ['Agua', 'Barco', 'Roca', 'Estrella']);
  assert.match(await page.locator('#player-feedback').innerText(), /action does not match/);
  assert.equal(await page.locator('#reveal').isVisible(), false);
  await language('es');
  await page.fill('#answer', 'abre'); await page.locator('#answer').press('Enter');
  await page.locator('#player-feedback').filter({ hasText: 'La acción funciona' }).waitFor();
  await page.click('#reveal-button');
  assert.match(await page.locator('#reveal').innerText(), /ABRE/);
  await language('en');
  assert.equal(await page.locator('#reveal').isVisible(), true);
  assert.match(await page.locator('#reveal').innerText(), /Required action: ABRE/);
  assert.equal(await page.locator('#hints').innerText(), hint);
  assert.equal(await page.locator('#answer').inputValue(), 'abre');
  checked('Spanish wrong-order, wrong-action, success, hint and reveal flows preserve play state and input focus/caret across UI changes');

  await page.click('#author-tab');
  for (const [input, file, expectedSelector] of [['#import-file', first.path, '.result-state.verified'], ['#comparison-import-file', pair.path, '#comparison-status[data-preserved="true"]']]) {
    await page.selectOption('#case-select', 'en-ambiguous');
    await gateFileRead(); await page.setInputFiles(input, file);
    await page.waitForFunction(() => typeof window.releaseLocaleImport === 'function');
    await language('es'); await releaseFileRead();
    await page.locator(expectedSelector).waitFor();
    assert.equal(await page.locator('#label-2').inputValue(), 'Roca');
    assert.equal(await page.locator('#notice').evaluate(n => n.classList.contains('error')), false);
    assert.equal(await page.locator('html').getAttribute('lang'), 'es');
    await language('en');
  }
  checked('Pending episode and comparison imports survive UI changes and retain the chosen interface language');

  await gateFileRead(); await page.setInputFiles('#import-file', first.path);
  await page.waitForFunction(() => typeof window.releaseLocaleImport === 'function');
  await page.fill('#label-1', 'Bote'); await language('es'); await releaseFileRead();
  await page.locator('#notice.error').waitFor();
  assert.equal(await page.locator('#label-1').inputValue(), 'Bote');
  assert.match(await page.locator('#notice').innerText(), /cambi|modific/i);
  checked('Real intervening edits still reject pending imports with Spanish feedback');

  await page.selectOption('#case-select', 'es-adapted');
  await page.selectOption('#source-select', 'en-original');
  await page.click('#compare-button'); await page.locator('#comparison-status[data-preserved="true"]').waitFor();
  await gateFileRead(); await page.setInputFiles('#comparison-import-file', pair.path);
  await page.waitForFunction(() => typeof window.releaseLocaleImport === 'function');
  const keyMapping = page.locator('#mapping-editor [data-source-id="key"] select');
  await keyMapping.selectOption('bell');
  await language('en'); await language('es'); await releaseFileRead();
  await page.locator('#notice.error').waitFor();
  assert.equal(await keyMapping.inputValue(), 'bell');
  assert.equal(await page.locator('#comparison-export-button').isDisabled(), true);
  assert.equal(await page.locator('#comparison-status').getAttribute('data-preserved'), 'unchecked');
  assert.match(await page.locator('#notice').innerText(), /cambi|modific/i);
  checked('A real role-map edit rejects pending comparison import through language switches without overwriting the edited mapping');

  await page.selectOption('#case-select', 'es-adapted'); await page.click('#check-button');
  await page.locator('.result-state.verified').waitFor(); await page.click('#compare-button');
  await page.locator('#comparison-status[data-preserved="true"]').waitFor();
  await page.screenshot({ path: resolve(evidenceDir, 'locale-spanish-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'Spanish author view overflows');
  await page.screenshot({ path: resolve(evidenceDir, 'locale-spanish-narrow.png'), fullPage: true });
  await page.click('#player-tab');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'Spanish player view overflows');
  await page.screenshot({ path: resolve(evidenceDir, 'locale-player-narrow.png'), fullPage: true });
  checked('Spanish author, comparison and player views fit a 390px viewport');

  const fallbackContext = await browser.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });
  const fallback = await fallbackContext.newPage(); observe(fallback); await fallback.goto(url);
  await fallback.locator('#case-select option').first().waitFor({ state: 'attached' });
  assert.equal(await fallback.locator('#ui-language').inputValue(), 'en');
  assert.equal(await fallback.locator('html').getAttribute('lang'), 'en');
  assert.match(await fallback.locator('#check-button').innerText(), /Check this revision/);
  await fallback.selectOption('#case-select', 'es-adapted'); await fallback.click('#player-tab');
  assert.equal(await fallback.locator('#answer-button').innerText(), 'Try action');
  await fallbackContext.close();
  checked('Unsupported browser language falls back to English even while playing Spanish authored content');
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.failedRequests, []); assert.deepEqual(receipt.httpErrors, []);
  receipt.passed = true;
} catch (error) {
  receipt.failure = { message: error.message, stack: error.stack };
  if (page) await page.screenshot({ path: resolve(evidenceDir, 'locale-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString();
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
  await writeFile(resolve(evidenceDir, 'locale-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
