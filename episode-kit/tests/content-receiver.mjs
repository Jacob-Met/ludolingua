import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EPISODES } from '../fixtures/episodes.mjs';
import { createExport, readExport } from '../lib/export.mjs';
import { startReceiver } from '../serve.mjs';

assert.ok(process.env.PLAYWRIGHT_PACKAGE && process.env.LUDO_EVIDENCE_DIR, 'Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
const evidenceRelative = relative(packageRoot, evidenceDir);
assert.ok(isAbsolute(evidenceRelative) || evidenceRelative === '..' || evidenceRelative.startsWith('..' + sep), 'Keep receiving evidence outside episode-kit.');
await mkdir(evidenceDir, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const episode = structuredClone(EPISODES.find(item => item.id === 'es-adapted'));
episode.id = 'long-content-receiver';
episode.revision = Number.MAX_SAFE_INTEGER;
episode.title = 'Archivo'.repeat(16);
const longUrl = 'https://example.invalid/localizacion/' + 'explicacion'.repeat(18);
episode.story = 'Referencia del autor: ' + longUrl;
episode.hints = ['Consulta la referencia: ' + longUrl];
episode.provenance.semanticChanges = ['Referencia de los cambios: ' + longUrl];
episode.cards[0].label = 'Agua' + 'a'.repeat(96);
const bundle = await createExport(episode);
assert.equal((await readExport(bundle)).validation.result.mechanicalSuccess, true);
const importPath = resolve(evidenceDir, 'long-content-input.json');
await writeFile(importPath, JSON.stringify(bundle, null, 2) + '\n');
const receipt = {
  schema: 'ludolingua.content-receiving.v1', startedAt: new Date().toISOString(),
  checks: [], dimensions: [], downloads: [], errors: [], failedRequests: [], httpErrors: [],
  inputSha256: bundle.validation.episodeSha256, passed: false,
};
let browser, server, page;
function checked(name) { receipt.checks.push(name); }
async function widthCheck(name) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    scrollX: window.scrollX,
  }));
  receipt.dimensions.push({ name, ...dimensions });
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, name + ': content overflows ' + JSON.stringify(dimensions));
  assert.equal(dimensions.scrollX, 0, name + ': horizontal scrolling was needed');
}
async function withinViewport(selector) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box, selector + ' must be visible');
  assert.ok(box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1, selector + ' must be reachable without horizontal scrolling');
  assert.equal(await page.evaluate(() => window.scrollX), 0);
  return locator;
}
async function waitForTitle(title) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await page.locator('#episode-title').textContent() === title) return;
    await new Promise(done => setTimeout(done, 50));
  }
  assert.equal(await page.locator('#episode-title').textContent(), title);
}
async function assertContent() {
  assert.equal(await page.locator('#episode-title').textContent(), episode.title);
  assert.equal(await page.locator('#episode-story').textContent(), episode.story);
  assert.equal(await page.locator('#label-0').inputValue(), episode.cards[0].label);
  assert.equal(await page.locator('#hint-editor').inputValue(), episode.hints[0]);
  assert.ok((await page.locator('#semantic-changes').textContent()).includes(episode.provenance.semanticChanges[0]));
}
try {
  ({ server, url: receipt.url } = await startReceiver());
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome-stable', chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--enable-automation'] });
  const session = await browser.newBrowserCDPSession();
  const command = await session.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(value => value === '--no-sandbox' || value === '--disable-setuid-sandbox'), false);
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 }, acceptDownloads: true });
  page = await context.newPage(); page.setDefaultTimeout(10_000);
  page.on('pageerror', error => receipt.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()); });
  page.on('requestfailed', request => receipt.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) receipt.httpErrors.push({ url: response.url(), status: response.status() }); });
  await page.goto('chrome://sandbox'); receipt.sandbox = await page.locator('body').innerText(); assert.match(receipt.sandbox, /Seccomp-BPF sandbox\s+Yes/i);
  await page.goto(receipt.url); await page.locator('#case-select option').first().waitFor({ state: 'attached' });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.click('#author-tab'); await page.selectOption('#ui-language', 'en');
    await page.selectOption('#case-select', 'en-original');
    await page.selectOption('#source-select', 'en-original');
    await page.setInputFiles('#import-file', importPath); await waitForTitle(episode.title);
    await assertContent(); await widthCheck('import-' + width);
    const notes = page.locator('.change-note');
    if (!(await notes.evaluate(element => element.open))) await notes.locator('summary').click();
    await (await withinViewport('#check-button')).click(); await page.locator('.result-state.verified').waitFor();
    await (await withinViewport('#compare-button')).click(); await page.locator('#comparison-status[data-preserved="true"]').waitFor();
    await widthCheck('checked-author-' + width);
    checked('Long authored content and 100-character card label fit at ' + width + 'px with successful episode and comparison mechanics');

    await (await withinViewport('#use-current-as-source')).click(); await page.click('#compare-button');
    await page.locator('#comparison-status[data-preserved="true"]').waitFor();
    assert.equal(await page.locator('#source-summary h4').textContent(), episode.title);
    assert.ok((await page.locator('#source-summary').textContent()).includes(episode.cards[0].label));
    await widthCheck('captured-source-' + width);
    await page.selectOption('#ui-language', 'es'); await assertContent(); await widthCheck('spanish-author-' + width);
    await page.screenshot({ path: resolve(evidenceDir, 'content-author-' + width + '.png'), fullPage: true });
    checked('Captured source and Spanish interface preserve full long text within ' + width + 'px');

    const downloadEvent = page.waitForEvent('download');
    await (await withinViewport('#export-button')).click();
    const download = await downloadEvent, path = resolve(evidenceDir, 'long-content-downloaded-' + width + '.json');
    await download.saveAs(path); assert.equal(await download.failure(), null);
    const received = await readExport(await readFile(path, 'utf8'));
    assert.deepEqual(received.episode, episode);
    assert.equal(received.validation.result.mechanicalSuccess, true);
    assert.equal(received.integrity.episodeSha256, (await readExport(bundle)).integrity.episodeSha256);
    receipt.downloads.push({ width, file: path, episodeSha256: received.integrity.episodeSha256 });
    await page.selectOption('#case-select', 'en-original');
    await page.setInputFiles('#import-file', path); await waitForTitle(episode.title);
    await assertContent(); await widthCheck('reopened-' + width);
    checked('Actual export and reopen retain the exact complete episode at ' + width + 'px');

    await page.click('#player-tab'); await page.click('#reset-order');
    assert.equal(await page.locator('#author').isVisible(), false);
    assert.equal(await page.locator('#reveal').isVisible(), false);
    assert.equal(await page.locator('#answer').inputValue(), '');
    assert.doesNotMatch(await page.locator('body').innerText(), /\bABRE\b/u);
    await withinViewport('#answer'); await withinViewport('#answer-button');
    await widthCheck('player-' + width);
    await (await withinViewport('#hint-button')).click();
    assert.equal(await page.locator('#hints p').textContent(), episode.hints[0]);
    assert.equal(await page.locator('#reveal').isVisible(), false);
    assert.doesNotMatch(await page.locator('body').innerText(), /\bABRE\b/u);
    await widthCheck('hint-' + width);
    await page.screenshot({ path: resolve(evidenceDir, 'content-player-' + width + '.png'), fullPage: true });
    checked('Player controls and complete hint fit at ' + width + 'px without revealing the action');
  }
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.failedRequests, []); assert.deepEqual(receipt.httpErrors, []);
  receipt.passed = true;
} catch (error) {
  receipt.failure = { message: error.message, stack: error.stack }; process.exitCode = 1;
  if (page) await page.screenshot({ path: resolve(evidenceDir, 'content-failure.png'), fullPage: true }).catch(() => {});
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(done => server.close(done));
  receipt.finishedAt = new Date().toISOString();
  await writeFile(resolve(evidenceDir, 'content-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
