import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startReceiver } from '../serve.mjs';
import { readExport } from '../lib/export.mjs';
import { readComparisonExport } from '../lib/comparison-export.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const external = process.env.LUDO_BASE_URL;
if (external) {
  const endpoint = new URL(external);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Receiving URL must be the local application.');
}
const managed = external ? null : await startReceiver();
const url = external || managed.url;
const receipt = { schema: 'ludolingua.signal-panel-browser.v1', startedAt: new Date().toISOString(), url, checks: [], errors: [], failedRequests: [], httpErrors: [], sandbox: null, passed: false };
const check = name => { receipt.checks.push(name); console.log('PASS ' + name); };
let browser, page;
try {
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome-stable', chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--enable-automation'] });
  const cdp = await browser.newBrowserCDPSession();
  const command = await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(arg => ['--no-sandbox', '--disable-setuid-sandbox'].includes(arg)), false);
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  page = await context.newPage();
  await page.goto('chrome://sandbox');
  const status = await page.locator('body').innerText();
  assert.match(status, /Seccomp-BPF sandbox\s+Yes/i);
  receipt.sandbox = { launchFlags: command.arguments, status };
  receipt.browserVersion = browser.version();
  page.on('pageerror', error => receipt.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()); });
  page.on('requestfailed', request => receipt.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) receipt.httpErrors.push({ url: response.url(), status: response.status() }); });
  await page.goto(url);
  await page.locator('#case-select option[value="en-signal-original"]').waitFor({ state: 'attached' });
  for (const id of ['en-signal-original', 'es-signal-literal', 'es-signal-adapted', 'en-signal-ambiguous']) assert.equal(await page.locator('#case-select option[value="' + id + '"]').count(), 1);
  check('Maintained entry serves all four Signal Panel cases in sandboxed Chrome');

  const labels = () => page.locator('#player-order .keeper-label').allTextContents();
  const submit = async answer => { await page.fill('#answer', answer); await page.locator('#answer').press('Enter'); };
  const feedback = async () => (await page.locator('#player-feedback').innerText()).trim();
  const choose = async (id, locale = 'en') => {
    await page.selectOption('#ui-language', locale);
    await page.selectOption('#case-select', id);
    await page.click('#author-tab');
  };
  const analyze = async (outcome, expected) => {
    await page.click('#check-button');
    await page.locator('#result .result-state.' + outcome).waitFor();
    assert.deepEqual(await page.locator('#result .metric strong').allTextContents(), expected);
    await page.waitForFunction(() => document.getElementById('digest').textContent.includes('SHA-256'));
  };
  const moveLastCardDown = async name => {
    await page.getByRole('button', { name, exact: true }).focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
  };
  const exportEpisode = async filename => {
    const pending = page.waitForEvent('download');
    await page.click('#export-button');
    const download = await pending;
    const destination = resolve(evidenceDir, filename);
    await download.saveAs(destination);
    return { destination, value: await readExport(await readFile(destination, 'utf8')) };
  };

  await choose('en-signal-original');
  assert.equal(await page.locator('.intro .lede').innerText(), "Cards, clues and one hidden action. Explore what a translation preserves, what it breaks, and what an adaptation changes.");
  await analyze('verified', ['1', '1', '120']);
  await page.click('#player-tab');
  assert.equal(await page.locator('#result').isVisible(), false);
  assert.equal(await page.locator('#player-clues li').count(), 5);
  assert.equal(await page.locator('#player-order li').count(), 5);
  assert.doesNotMatch(await page.locator('body').innerText(), /\bPRESS\b/);
  await submit('PRESS');
  assert.equal(await feedback(), 'This order does not yet satisfy all the clues.');
  await moveLastCardDown('Move Star down');
  assert.deepEqual(await labels(), ['Pine', 'River', 'Ember', 'Stone', 'Star']);
  await submit('OTHER');
  assert.equal(await feedback(), 'The order fits the clues. Try the action again using its initials.');
  assert.doesNotMatch(await page.locator('body').innerText(), /\bPRESS\b/);
  await submit(' press ');
  assert.equal(await feedback(), 'The action works. Your order fits the clues and its initials match.');
  await page.click('#hint-button'); await page.click('#hint-button'); await page.click('#hint-button');
  assert.equal(await page.locator('#hints p').count(), 3);
  assert.match(await page.locator('#hints').innerText(), /Stone and Star share an initial/);
  await page.screenshot({ path: resolve(evidenceDir, 'signal-source-player-desktop.png'), fullPage: true });
  await page.click('#reset-order');
  assert.deepEqual(await labels(), ['Star', 'Pine', 'River', 'Ember', 'Stone']);
  assert.equal(await page.locator('#answer').inputValue(), '');
  assert.equal(await page.locator('#hints p').count(), 0);
  assert.equal(await feedback(), '');
  check('Five-card English play uses all clues, preserves keyboard moves, retries, hints and reset');

  await choose('es-signal-adapted', 'es');
  assert.equal(await page.locator('.intro .lede').innerText(), "Tarjetas, pistas y una acción oculta. Explora qué conserva una traducción, qué rompe y qué cambia una adaptación.");
  await page.selectOption('#ui-language', 'en');
  assert.equal(await page.locator('.intro .lede').innerText(), "Cards, clues and one hidden action. Explore what a translation preserves, what it breaks, and what an adaptation changes.");
  await page.selectOption('#ui-language', 'es');
  assert.equal(await page.locator('.intro .lede').innerText(), "Tarjetas, pistas y una acción oculta. Explora qué conserva una traducción, qué rompe y qué cambia una adaptación.");
  await analyze('verified', ['1', '1', '120']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#player-tab');
  assert.equal(await page.locator('#player-order li').count(), 5);
  assert.equal(await page.locator('#player-clues li').count(), 5);
  await moveLastCardDown('Bajar Ancla');
  assert.deepEqual(await labels(), ['Pulpo', 'Uva', 'Luna', 'Sol', 'Ancla']);
  await submit(' pulsa ');
  assert.equal(await feedback(), 'La acción funciona. El orden cumple las pistas y sus iniciales coinciden.');
  await page.click('#hint-button'); await page.click('#hint-button'); await page.click('#hint-button');
  assert.match(await page.locator('#hints').innerText(), /Sol y Ancla no son intercambiables/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.screenshot({ path: resolve(evidenceDir, 'signal-spanish-player-mobile.png'), fullPage: true });
  check('Five-card Spanish player and hints remain usable at 390px without horizontal overflow');

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.click('#author-tab');
  await page.selectOption('#source-select', 'en-signal-original');
  assert.equal(await page.locator('#mapping-editor .mapping-row').count(), 5);
  await page.click('#compare-button');
  await page.locator('#comparison-status[data-preserved="true"]').waitFor();
  const comparisonDownload = page.waitForEvent('download');
  await page.click('#comparison-export-button');
  const comparison = await comparisonDownload;
  const comparisonPath = resolve(evidenceDir, 'signal-comparison.json');
  await comparison.saveAs(comparisonPath);
  const compared = await readComparisonExport(await readFile(comparisonPath, 'utf8'));
  assert.equal(compared.validation.result.mechanicalPreserved, true);
  assert.equal(compared.validation.result.roleChanges.length, 5);
  assert.equal(compared.source.id, 'en-signal-original');
  assert.equal(compared.target.id, 'es-signal-adapted');
  check('Actual five-role comparison and downloaded export preserve source/adaptation evidence');

  await choose('es-signal-literal', 'es');
  await analyze('action-mismatch', ['1', '0', '120']);
  await page.click('#player-tab');
  assert.match(await page.locator('#episode-story').innerText(), /caso de contraste/);
  await moveLastCardDown('Bajar Estrella');
  assert.deepEqual(await labels(), ['Pino', 'Río', 'Brasa', 'Piedra', 'Estrella']);
  for (const answer of ['PULSA', 'PRBPE']) {
    await submit(answer);
    assert.equal(await feedback(), 'El orden cumple las pistas, pero la acción no coincide. Esta adaptación puede necesitar cambios.');
  }
  check('Intentional literal translation remains a failed action despite a valid order');

  await choose('en-signal-ambiguous');
  await analyze('ambiguous', ['2', '2', '120']);
  assert.equal(await page.locator('#clue-conflict').count(), 0);
  assert.equal(await page.locator('#result .path').count(), 2);
  assert.deepEqual(await page.locator('#result .token').allTextContents(), ['PRESS', 'PRESS']);
  await page.screenshot({ path: resolve(evidenceDir, 'signal-ambiguity-author-desktop.png'), fullPage: true });
  const exported = await exportEpisode('signal-ambiguous.json');
  assert.equal(exported.value.validation.result.mechanicalSuccess, false);
  assert.equal(exported.value.validation.result.outcome, 'ambiguous');
  assert.equal(exported.value.validation.result.clueOrderCount, 2);
  await page.click('#player-tab');
  await moveLastCardDown('Move Star down');
  await submit('PRESS');
  assert.equal(await feedback(), 'The action works. Your order fits the clues and its initials match.');
  await page.getByRole('button', { name: 'Move Star up', exact: true }).click();
  assert.deepEqual(await labels(), ['Pine', 'River', 'Ember', 'Star', 'Stone']);
  await submit('PRESS');
  assert.equal(await feedback(), 'The action works. Your order fits the clues and its initials match.');
  await page.click('#hint-button'); await page.click('#hint-button'); await page.click('#hint-button');
  assert.match(await page.locator('#hints').innerText(), /No remaining clue orders Stone and Star/);
  check('Both same-word layouts are valid attempts while author analysis reports two distinct orders');

  await choose('en-original');
  await page.setInputFiles('#import-file', exported.destination);
  await page.locator('#case-select').filter({ has: page.locator('option[value="imported"]') }).waitFor();
  await page.waitForFunction(() => document.getElementById('case-select').value === 'imported');
  await page.locator('#result .result-state.ambiguous').waitFor();
  assert.deepEqual(await page.locator('#result .metric strong').allTextContents(), ['2', '2', '120']);
  assert.equal(await page.locator('#result .path').count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(evidenceDir, 'signal-ambiguity-reopened-mobile.png'), fullPage: true });
  check('Actual downloaded negative evidence reopens with both layouts and no upgraded success claim');

  await page.setViewportSize({ width: 1280, height: 1000 });
  await choose('en-original');
  await analyze('verified', ['1', '1', '24']);
  assert.equal(await page.locator('#cards-editor input').count(), 4);
  check('Existing four-card source remains reachable with its original result');


  for (const [id, locale, answer, successCount] of [
    ['en-signal-original', 'en', 'PRESS', 1],
    ['es-signal-literal', 'es', 'PULSA', 0],
    ['es-signal-adapted', 'es', 'PULSA', 1],
    ['en-signal-ambiguous', 'en', 'PRESS', 2]
  ]) {
    await choose(id, locale);
    const popup = page.waitForEvent('popup');
    await page.click('#launch-playtest');
    const player = await popup;
    player.on('pageerror', error => receipt.errors.push(String(error)));
    player.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()); });
    player.on('requestfailed', request => receipt.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    player.on('response', response => { if (response.status() >= 400) receipt.httpErrors.push({ url: response.url(), status: response.status() }); });
    await player.locator('#playtest-status[data-state="ready"]').waitFor();
    assert.equal(await player.locator('#playtest-cards li').count(), 5);
    assert.equal(await player.locator('#case-select, #author-tab, #compare-button').count(), 0);
    assert.equal(await player.locator('#playtest-ui-language').inputValue(), locale);
    const down = player.locator('#playtest-cards li[data-card-id="star"] button[data-direction="down"]');
    await down.focus();
    for (let i = 0; i < 4; i++) await player.keyboard.press('Space');
    assert.deepEqual(await player.locator('#playtest-cards li').evaluateAll(rows => rows.map(row => row.dataset.cardId)), ['pine', 'river', 'ember', 'stone', 'star']);
    await player.fill('#playtest-answer', answer);
    await player.locator('#playtest-answer').press('Enter');
    const expectedFeedback = successCount === 0
      ? 'El orden cumple las pistas, pero la acción no coincide. Puede que el episodio necesite cambios.'
      : locale === 'es'
        ? 'La acción funciona. Las pistas y las iniciales coinciden.'
        : 'The action works. Your order fits the clues and its initials match.';
    assert.equal((await player.locator('#playtest-feedback').innerText()).trim(), expectedFeedback);
    if (id === 'en-signal-ambiguous') {
      await player.locator('#playtest-cards li[data-card-id="star"] button[data-direction="up"]').click();
      assert.deepEqual(await player.locator('#playtest-cards li').evaluateAll(rows => rows.map(row => row.dataset.cardId)), ['pine', 'river', 'ember', 'star', 'stone']);
      await player.locator('#playtest-answer').press('Enter');
      assert.equal((await player.locator('#playtest-feedback').innerText()).trim(), expectedFeedback);
    }
    if (id === 'es-signal-adapted') {
      await player.setViewportSize({ width: 390, height: 844 });
      assert.equal(await player.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await player.screenshot({ path: resolve(evidenceDir, 'signal-standalone-spanish-mobile.png'), fullPage: true });
    }
    const pending = player.waitForEvent('download');
    await player.click('#playtest-download');
    const download = await pending;
    const destination = resolve(evidenceDir, id + '-play-record.json');
    await download.saveAs(destination);
    const record = await readPlaytestRecord(await readFile(destination, 'utf8'));
    assert.equal(record.integrity.verified, true);
    assert.equal(record.episode.id, id);
    assert.equal(record.validation.result.summary.attempts, id === 'en-signal-ambiguous' ? 2 : 1);
    assert.equal(record.validation.result.summary.successfulAttempts, successCount);
    assert.equal(record.evidence.humanIdentityAttested, false);
    assert.equal(record.evidence.modelContributionVerified, false);
    await page.selectOption('#ui-language', 'en');
    await page.setInputFiles('#playtest-record-file', destination);
    await page.locator('#playtest-review').filter({ hasText: record.sessionId }).waitFor();
    const reviewStatus = page.locator('#playtest-review-status');
    await reviewStatus.filter({ hasText: 'Record verified.' }).waitFor();
    assert.equal((await reviewStatus.textContent()).startsWith('Record verified.'), true);
    const reviewTitle = page.locator('#playtest-review h4');
    await reviewTitle.filter({ hasText: record.episode.title }).waitFor();
    assert.equal((await reviewTitle.textContent()).startsWith(record.episode.title), true);
    const reviewMetrics = page.locator('#playtest-review .metric strong');
    await reviewMetrics.nth(0).filter({ hasText: new RegExp('^' + String(id === 'en-signal-ambiguous' ? 2 : 1) + '$') }).waitFor();
    await reviewMetrics.nth(1).filter({ hasText: new RegExp('^' + String(successCount) + '$') }).waitFor();
    assert.equal(await page.locator('#case-select').inputValue(), id);
    assert.deepEqual((await page.locator('#playtest-review .metric strong').allTextContents()).slice(0, 2), [String(id === 'en-signal-ambiguous' ? 2 : 1), String(successCount)]);
    await player.close();
  }
  check('All four new variants launch in the separate player and their actual downloaded journals reopen with bounded replay evidence');

  assert.deepEqual(receipt.errors, []);
  assert.deepEqual(receipt.failedRequests, []);
  assert.deepEqual(receipt.httpErrors, []);
  receipt.passed = true;
} catch (error) {
  receipt.failure = { message: String(error), stack: error.stack };
  throw error;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await writeFile(resolve(evidenceDir, 'signal-panel-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  await browser?.close();
  if (managed) await new Promise(resolveClose => managed.server.close(resolveClose));
}
