import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const out = resolve(process.env.LUDO_EVIDENCE_DIR); await mkdir(out, { recursive: true });
const source = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(resolve(tmpdir(), 'ludolingua-serving-browser-')), kit = resolve(temporary, 'episode-kit');
await cp(source, kit, { recursive: true });
const { startReceiver } = await import(pathToFileURL(resolve(kit, 'serve.mjs')).href);
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const receipt = { schema: 'ludolingua.portable-serving-receiving.v1', startedAt: new Date().toISOString(),
  checks: [], downloads: [], pageErrors: [], consoleErrors: [], offlineRequests: [], passed: false, sandboxEnabled: true };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const recoveryGuidance = {"en": "The downloadable player is out of date or unavailable. You can keep editing, export checked JSON, or open a separate playtest. Ask the kit maintainer to refresh the player bundle, then try again.", "es": "El reproductor descargable está desactualizado o no está disponible. Puedes seguir editando, exportar el JSON verificado o abrir una prueba independiente. Pide a la persona responsable del kit que actualice el paquete del reproductor y vuelve a intentarlo."};
const engine = resolve(kit, 'lib/engine.mjs'), engineBytes = await readFile(engine);
let browser, server, web, offline, lastPage;
function observe(page) {
  lastPage = page; page.on('pageerror', e => receipt.pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') receipt.consoleErrors.push(m.text()); });
}
async function download(page, selector, name) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  const path = resolve(out, name); await d.saveAs(path); assert.equal(await d.failure(), null);
  const bytes = await readFile(path); receipt.downloads.push({ name, bytes: bytes.length, sha256: hash(bytes) });
  return { path, bytes };
}
const storage = p => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
try {
  const started = await startReceiver(); server = started.server;
  browser = await chromium.launch({ executablePath: process.env.LUDO_BROWSER || '/usr/bin/google-chrome-stable', headless: true, chromiumSandbox: true });
  web = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  web.setDefaultTimeout(10_000); web.setDefaultNavigationTimeout(10_000);
  const author = await web.newPage(); observe(author); await author.goto(started.url);
  await author.locator('#episode-title-input').waitFor(); await author.selectOption('#case-select', 'en-original'); await author.selectOption('#ui-language', 'en');
  await author.locator('#check-button').click(); await author.locator('#result .result-state.verified').waitFor();
  const before = await download(author, '#export-button', 'episode-before.json'), episodeExport = JSON.parse(before.bytes.toString());
  const stored = await storage(author), title = await author.locator('#episode-title-input').inputValue();
  const runtimeResponses = []; author.on('response', r => { if (r.url().endsWith('/web/portable-player-bundle.json')) runtimeResponses.push(r.status()); });
  const initial = await download(author, '#download-portable-player', 'initial-player.html');
  await writeFile(engine, Buffer.concat([engineBytes, Buffer.from('\n// isolated live source edit\n')]));
  let unexpected = 0; const onDownload = () => unexpected++; author.on('download', onDownload);
  const [refusal] = await Promise.all([author.waitForResponse(r => r.url().endsWith('/web/portable-player-bundle.json')), author.locator('#download-portable-player').click()]);
  assert.equal(refusal.status(), 503);
  assert.equal(refusal.headers()['cache-control'], 'no-store');
  await author.waitForFunction(() => document.getElementById('notice').textContent.includes('Cannot download playable file:'));
  receipt.refusalNotice = await author.locator('#notice').textContent();
  assert.equal(receipt.refusalNotice, 'Cannot download playable file: ' + recoveryGuidance.en);
  await author.selectOption('#ui-language', 'es');
  const expectedSpanish = 'No se puede descargar el archivo para jugar: ' + recoveryGuidance.es;
  await author.waitForFunction(text => document.getElementById('notice').textContent === text, expectedSpanish);
  receipt.switchedSpanishNotice = await author.locator('#notice').textContent();
  await author.locator('#download-portable-player').focus();
  const [spanishRefusal] = await Promise.all([
    author.waitForResponse(r => r.url().endsWith('/web/portable-player-bundle.json')),
    author.locator('#download-portable-player').press('Enter')
  ]);
  assert.equal(spanishRefusal.status(), 503);
  await author.waitForFunction(text => document.getElementById('notice').textContent === text, expectedSpanish);
  assert.equal(await author.locator('#download-portable-player').isEnabled(), true);
  receipt.spanishRefusalNotice = await author.locator('#notice').textContent();
  await author.screenshot({ path: resolve(out, 'portable-download-guidance-es.png'), fullPage: true });
  await author.selectOption('#ui-language', 'en');
  await author.waitForFunction(text => document.getElementById('notice').textContent === text, 'Cannot download playable file: ' + recoveryGuidance.en);
  receipt.checks.push('Actual English and Spanish HTTP503 refusals explain available alternatives and maintainer recovery; switching language translates the active notice and keyboard retry remains available');

  assert.equal(unexpected, 0); author.off('download', onDownload);
  assert.equal(await author.locator('#download-portable-player').isEnabled(), true);
  assert.equal(await author.locator('#episode-title-input').inputValue(), title); assert.deepEqual(await storage(author), stored);
  await author.screenshot({ path: resolve(out, 'portable-download-refused.png'), fullPage: true });
  const whileStale = await download(author, '#export-button', 'episode-while-stale.json'); assert.deepEqual(whileStale.bytes, before.bytes);
  receipt.checks.push('After a successful export, the same author page rechecks the runtime and refuses stale files with HTTP503; no stale HTML downloads and exact JSON/state remain available');
  await writeFile(engine, engineBytes);
  const [goodResponse, html] = await Promise.all([author.waitForResponse(r => r.url().endsWith('/web/portable-player-bundle.json')), download(author, '#download-portable-player', 'recovered-player.html')]);
  assert.equal(goodResponse.status(), 200);
  assert.deepEqual(html.bytes, initial.bytes); assert.deepEqual(runtimeResponses, [200, 503, 503, 200]); receipt.runtimeResponses = [...runtimeResponses];
  await author.waitForFunction(() => document.getElementById('notice').textContent.includes('playable HTML file'));
  const after = await download(author, '#export-button', 'episode-after.json'); assert.deepEqual(after.bytes, before.bytes);
  assert.deepEqual(await storage(author), stored); receipt.checks.push('Restoring exact source permits a fresh playable export on the same page and server without losing the episode');

  // Only these two cases intercept the browser request; the preceding503 cases use the real checker.
  const bundleRoute = '**/web/portable-player-bundle.json';
  let failedDownloads = 0; const onFailedDownload = () => failedDownloads++;
  author.on('download', onFailedDownload);
  await author.route(bundleRoute, route => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Untrusted replacement diagnostics</h1>' }));
  const [notFound] = await Promise.all([author.waitForResponse(r => r.url().endsWith('/web/portable-player-bundle.json')), author.locator('#download-portable-player').click()]);
  assert.equal(notFound.status(), 404);
  await author.waitForFunction(() => document.getElementById('notice').textContent === 'Cannot download playable file: The portable player runtime could not be loaded.');
  receipt.otherHttpNotice = await author.locator('#notice').textContent();
  assert.equal(await author.locator('#notice h1').count(), 0);
  assert.equal(await author.locator('#download-portable-player').isEnabled(), true);
  await author.unroute(bundleRoute);
  await author.route(bundleRoute, route => route.abort('failed'));
  await Promise.all([
    author.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/web/portable-player-bundle.json') }),
    author.locator('#download-portable-player').click()
  ]);
  await author.waitForFunction(() => document.getElementById('notice').textContent.startsWith('Cannot download playable file: ') && !document.getElementById('download-portable-player').disabled);
  receipt.networkFailureNotice = await author.locator('#notice').textContent();
  assert.equal(receipt.networkFailureNotice.includes(recoveryGuidance.en), false);
  assert.equal(receipt.networkFailureNotice.includes('Untrusted replacement'), false);
  assert.equal(failedDownloads, 0); author.off('download', onFailedDownload);
  assert.deepEqual(await storage(author), stored); assert.equal(await author.locator('#episode-title-input').inputValue(), title);
  await author.unroute(bundleRoute);
  const afterNetwork = await download(author, '#download-portable-player', 'after-network-player.html');
  assert.deepEqual(afterNetwork.bytes, initial.bytes);
  receipt.allRuntimeResponses = [...runtimeResponses];
  assert.deepEqual(runtimeResponses, [200, 503, 503, 200, 404, 200]);
  receipt.checks.push('Controlled404 and network failures retain accurate loading errors without injected body or maintainer guidance; no failed download or state change occurs and an actual fresh retry succeeds');

  await web.close(); web = null; await new Promise(done => { server.close(done); server.closeIdleConnections?.(); }); server = null;
  offline = await browser.newContext({ acceptDownloads: true }); await offline.setOffline(true);
  offline.setDefaultTimeout(10_000); offline.setDefaultNavigationTimeout(10_000);
  const player = await offline.newPage(); observe(player); player.on('request', r => receipt.offlineRequests.push(r.url()));
  await player.goto(pathToFileURL(html.path).href); await player.locator('#portable-status[data-state="ready"]').waitFor();
  await player.locator('#portable-start').click(); await player.locator('#playtest-session').waitFor({ state: 'visible' });
  const ids = episodeExport.episode.cards.map(c => c.id);
  for (let target = 0; target < ids.length; target++) {
    const order = await player.locator('#playtest-cards li').evaluateAll(ns => ns.map(n => n.dataset.cardId));
    for (let i = order.indexOf(ids[target]); i > target; i--) await player.locator('#playtest-cards li[data-card-id="' + ids[target] + '"] button[data-direction="up"]').click();
  }
  await player.fill('#playtest-answer', episodeExport.episode.action.expected); await player.locator('#playtest-answer').press('Enter');
  const downloaded = await download(player, '#playtest-download', 'recovered-record.json'), value = await readPlaytestRecord(downloaded.bytes.toString());
  assert.equal(value.validation.result.summary.attempts, 1); assert.equal(value.validation.result.summary.successfulAttempts, 1);
  assert.deepEqual(value.episode, episodeExport.episode); assert.equal(value.integrity.episodeSha256, episodeExport.validation.episodeSha256);
  assert.deepEqual(receipt.offlineRequests, [pathToFileURL(html.path).href]); assert.deepEqual(receipt.pageErrors, []);
  assert.equal(receipt.consoleErrors.length, 4);
  assert.equal(receipt.consoleErrors.filter(text => text.includes('503')).length, 2);
  assert.equal(receipt.consoleErrors.filter(text => text.includes('404')).length, 1);
  assert.equal(receipt.consoleErrors.filter(text => text.includes('ERR_FAILED')).length, 1);
  receipt.expectedResourceFailure = 'Four expected resource errors: two real checker503 refusals, one controlled404 response and one controlled network failure.';
  receipt.checks.push('Recovered HTML opens offline after actual server shutdown, solves and downloads a source-bound verified record');
  receipt.passed = true;
} catch (error) {
  receipt.failure = String(error.stack || error); process.exitCode = 1;
  if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await writeFile(engine, engineBytes).catch(() => {});
  await offline?.close(); await web?.close(); await browser?.close();
  if (server) await new Promise(done => { server.close(done); server.closeIdleConnections?.(); });
  await rm(temporary, { recursive: true, force: true });
  receipt.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'SERVING-BROWSER-RECEIPT.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
