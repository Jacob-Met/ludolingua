import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { startReceiver } from '../serve.mjs';
import { readExport } from '../lib/export.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const { server, url } = await startReceiver();
const indexURL = new URL('/web/index.html', url).href;
const receipt = { schema: 'ludolingua.original-authoring-receiving.v1', startedAt: new Date().toISOString(), checks: [], errors: [], failedRequests: [], httpErrors: [], inputs: [], passed: false };
let browser, lastPage;
const check = name => receipt.checks.push(name);
const observe = page => {
  lastPage = page;
  page.on('pageerror', error => receipt.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') receipt.errors.push(message.text()); });
  page.on('requestfailed', request => receipt.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) receipt.httpErrors.push({ url: response.url(), status: response.status() }); });
};
async function download(page, selector, name) {
  const pending = page.waitForEvent('download'); await page.click(selector);
  const item = await pending, path = resolve(evidenceDir, name);
  await item.saveAs(path); assert.equal(await item.failure(), null);
  const bytes = await readFile(path);
  receipt.inputs.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  return { path, bytes, value: JSON.parse(bytes.toString('utf8')) };
}
const storage = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
async function prepare(creator, title, labels = 'Sun\nApple\nYarn', action = 'SAY') {
  await creator.fill('#new-episode-title', title);
  await creator.fill('#new-episode-story', 'Three messengers leave a word in their ordered initials.');
  await creator.fill('#new-episode-labels', labels);
  await creator.fill('#new-episode-action', action);
  await creator.locator('#new-episode-action').press('Enter');
  await creator.locator('#created-episode').waitFor({ state: 'visible' });
}
async function openCreated(context, creator, title) {
  const pending = context.waitForEvent('page');
  await creator.click('#open-created-workbench');
  const page = await pending;
  await page.waitForFunction(title => document.getElementById('episode-title-input')?.value === title && !document.querySelector('.workspace').inert, title);
  assert.equal(await page.locator('#export-button').isDisabled(), true);
  assert.equal(await page.locator('#draft-status').getAttribute('data-state'), 'detached');
  return page;
}
async function checkOrders(page, count, outcome) {
  await page.click('#check-button');
  await page.locator('#result .result-state.' + outcome).waitFor();
  assert.equal(await page.locator('#result .metric strong').first().innerText(), String(count));
}
async function protocolChecks(episodeExport) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  context.on('page', observe);
  await context.addInitScript(() => {
    const realNow = Date.now.bind(Date); window.__handoffTimeOffset = 0;
    Date.now = () => realNow() + window.__handoffTimeOffset;
  });
  const opener = await context.newPage(); await opener.goto(indexURL);
  await opener.locator('#episode-title-input').waitFor();
  let sequence = 0;
  async function receiver() {
    const token = 'browser-proof-' + (++sequence) + '-' + randomUUID();
    const target = new URL(indexURL); target.searchParams.set('author-handoff', token); target.searchParams.set('author-ui', 'en');
    const pending = context.waitForEvent('page');
    await opener.evaluate(target => { window.__testReceiver = window.open(target, '_blank'); }, target.href);
    const page = await pending;
    await page.waitForFunction(() => document.querySelector('.workspace')?.inert === true);
    assert.equal(new URL(page.url()).searchParams.has('author-handoff'), false);
    return { page, token };
  }
  const packet = token => ({ type: 'ludolingua.author.episode', token, uiLocale: 'en', episodeExport });
  const send = value => opener.evaluate(value => window.__testReceiver.postMessage(value, location.origin), value);
  const title = page => page.locator('#episode-title-input').inputValue();
  async function pendingUnchanged(page, before) {
    await settle(page); assert.equal(await page.locator('.workspace').evaluate(e => e.inert), true); assert.equal(await title(page), before);
  }
  {
    const { page, token } = await receiver(), before = await title(page);
    await page.evaluate(value => window.postMessage(value, location.origin), packet(token));
    await pendingUnchanged(page, before);
    await send(packet(token + '-wrong')); await pendingUnchanged(page, before);
    await send(packet(token));
    await page.waitForFunction(() => !document.querySelector('.workspace').inert);
    assert.equal(await title(page), episodeExport.episode.title);
    await page.fill('#episode-title-input', 'Receiver edited after acceptance');
    await send(packet(token)); await settle(page);
    assert.equal(await title(page), 'Receiver edited after acceptance');
    await page.close();
    check('Real same-origin wrong-source and wrong-token messages are ignored; accepted handoff is one-shot after edits');
  }
  {
    const { page, token } = await receiver(), before = await title(page);
    await page.evaluate(() => { window.__handoffTimeOffset = 61000; });
    await send(packet(token));
    await page.waitForFunction(() => !document.querySelector('.workspace').inert);
    assert.equal(await title(page), before);
    await page.fill('#episode-title-input', 'Edited after expiration');
    await send(packet(token)); await settle(page);
    assert.equal(await title(page), 'Edited after expiration');
    await page.close();
    check('Expired receiver unlocks without importing and a late valid payload cannot overwrite subsequent edits');
  }
  {
    const { page, token } = await receiver(), before = await title(page);
    const malformed = packet(token); malformed.episodeExport = { schema: 'invalid' };
    await send(malformed);
    await page.waitForFunction(() => !document.querySelector('.workspace').inert);
    assert.equal(await title(page), before);
    await send(packet(token)); await settle(page); assert.equal(await title(page), before);
    await page.close();
    check('Authenticated malformed payload consumes the attempt without a partial import or later retry');
  }
  {
    const { page, token } = await receiver(), before = await title(page);
    await page.evaluate(() => {
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = async (...args) => {
        const value = await digest(...args);
        await new Promise(done => { window.__releaseAuthorDigest = done; });
        return value;
      };
    });
    await send(packet(token));
    await page.waitForFunction(() => typeof window.__releaseAuthorDigest === 'function');
    await send(packet(token)); // Cannot start a second validation while consuming.
    await page.evaluate(() => { window.__handoffTimeOffset = 61000; window.__releaseAuthorDigest(); });
    await page.waitForFunction(() => !document.querySelector('.workspace').inert);
    assert.equal(await title(page), before);
    await send(packet(token)); await settle(page); assert.equal(await title(page), before);
    await page.close();
    check('Validation completing after the deadline cannot commit; a duplicate cannot restart validation');
  }
  await context.close();
}
try {
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome-stable', chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--enable-automation'] });
  const cdp = await browser.newBrowserCDPSession(), command = await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(arg => arg === '--no-sandbox' || arg === '--disable-setuid-sandbox'), false);
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true });
  const author = await context.newPage();
  await author.goto('chrome://sandbox'); receipt.sandbox = await author.locator('body').innerText();
  assert.match(receipt.sandbox, /Seccomp-BPF sandbox\s+Yes/i);
  observe(author); context.on('page', observe);
  await author.goto(indexURL); await author.locator('#episode-title-input').waitFor();
  await author.selectOption('#case-select', 'en-original');
  await author.fill('#episode-title-input', 'Fixture draft to preserve');
  await author.locator('#draft-status[data-state="saved"]').waitFor();
  const beforeStorage = await storage(author), beforeURL = author.url();
  const pendingCreator = context.waitForEvent('page'); await author.click('#create-episode-link');
  const creator = await pendingCreator; await creator.locator('#new-episode-title').waitFor();
  await creator.selectOption('#creator-ui-language', 'es');
  await prepare(creator, 'The three messengers');
  const starting = await download(creator, '#download-starting-episode', 'original-starting.json');
  const receivedStart = await readExport(starting.value);
  assert.equal(receivedStart.validation.result.clueOrderCount, 6);
  assert.equal(receivedStart.validation.result.mechanicalSuccess, false);
  assert.deepEqual(receivedStart.episode.clues, []); assert.deepEqual(receivedStart.episode.hints, []);
  assert.equal(receivedStart.episode.locale, 'en');
  await creator.screenshot({ path: resolve(evidenceDir, 'original-creator-desktop.png'), fullPage: true });
  const workbench = await openCreated(context, creator, 'The three messengers');
  assert.equal(await workbench.locator('#ui-language').inputValue(), 'es');
  assert.equal(await workbench.locator('#episode-title-input').getAttribute('lang'), 'en');
  assert.deepEqual(await storage(author), beforeStorage);
  await creator.fill('#new-episode-title', 'A later creator edit');
  assert.equal(await workbench.locator('#episode-title-input').inputValue(), 'The three messengers');
  assert.equal(await creator.locator('#download-starting-episode').isDisabled(), true);
  check('Creator keyboard submission produces a verified ambiguous starting export; separate Spanish workbench receives exact English content without stale check approval');

  await prepare(creator, 'A second original');
  const secondStart = await download(creator, '#download-starting-episode', 'second-starting.json');
  assert.notEqual(secondStart.value.episode.id, starting.value.episode.id);
  const secondWorkbench = await openCreated(context, creator, 'A second original');
  assert.equal(await workbench.locator('#episode-title-input').inputValue(), 'The three messengers');
  await secondWorkbench.close();
  assert.equal(await author.locator('#episode-title-input').inputValue(), 'Fixture draft to preserve');
  assert.equal(author.url(), beforeURL); assert.deepEqual(await storage(author), beforeStorage);
  check('Two original episodes have distinct identities and independent windows; originating draft content, selection and stored bytes remain unchanged');

  await workbench.selectOption('#ui-language', 'en');
  await checkOrders(workbench, 6, 'ambiguous');
  await workbench.click('#add-clue'); await checkOrders(workbench, 3, 'ambiguous');
  await workbench.click('#add-clue');
  const second = workbench.locator('#clue-editor .clue-row').nth(1);
  await second.locator('select[data-field="right"]').selectOption('keeper-3');
  await second.locator('select[data-field="left"]').selectOption('keeper-2');
  await checkOrders(workbench, 1, 'verified');
  const solved = await download(workbench, '#export-button', 'original-solved.json');
  const receivedSolved = await readExport(solved.value);
  assert.equal(receivedSolved.episode.id, starting.value.episode.id);
  assert.deepEqual(receivedSolved.validation.result.solutions, [{ order: ['keeper-1', 'keeper-2', 'keeper-3'], token: 'SAY', actionMatches: true }]);
  await second.locator('[data-action="remove-clue"]').click();
  assert.equal(await workbench.locator('#export-button').isDisabled(), true);
  await checkOrders(workbench, 3, 'ambiguous');
  check('Actual clue controls narrow 6→3→1 and remove-clue invalidates the solved result before returning to 3');

  const reopened = await context.newPage(); await reopened.goto(indexURL);
  await reopened.locator('#episode-title-input').waitFor();
  await reopened.setInputFiles('#import-file', solved.path);
  await reopened.locator('#result .result-state.verified').waitFor();
  assert.equal(await reopened.locator('#episode-title-input').inputValue(), receivedSolved.episode.title);
  assert.equal(await reopened.locator('#clue-editor .clue-row').count(), 2);
  const roundtrip = await download(reopened, '#export-button', 'original-reopened.json');
  assert.deepEqual(roundtrip.value, solved.value);
  await reopened.click('#player-tab'); await reopened.fill('#answer', 'SAY'); await reopened.locator('#answer').press('Enter');
  assert.match(await reopened.locator('#player-feedback').innerText(), /does not yet satisfy/);
  for (let i = 0; i < 2; i++) await reopened.locator('#player-order li[data-card-id="keeper-3"] button[data-direction="down"]').click();
  await reopened.fill('#answer', ' say '); await reopened.locator('#answer').press('Enter');
  assert.match(await reopened.locator('#player-feedback').innerText(), /The action works/);
  await reopened.screenshot({ path: resolve(evidenceDir, 'original-solved-player.png'), fullPage: true });
  check('Downloaded authored export reopens and re-exports exactly; real player rejects a wrong order and accepts SAY in the clue-consistent order');

  await reopened.click('#author-tab');
  const pendingPlayer = context.waitForEvent('page'); await reopened.click('#launch-playtest');
  const player = await pendingPlayer; await player.locator('#playtest-status[data-state="ready"]').waitFor();
  await player.fill('#playtest-answer', 'SAY'); await player.locator('#playtest-answer').press('Enter');
  for (let i = 0; i < 2; i++) await player.locator('#playtest-cards li[data-card-id="keeper-3"] button[data-direction="down"]').click();
  await player.fill('#playtest-answer', 'say'); await player.locator('#playtest-answer').press('Enter');
  const journal = await download(player, '#playtest-download', 'original-play-record.json');
  const checkedRecord = await readPlaytestRecord(journal.value);
  assert.equal(checkedRecord.validation.result.summary.attempts, 2);
  assert.equal(checkedRecord.validation.result.summary.successfulAttempts, 1);
  await player.close();
  check('Existing separate playtest accepts the original episode and downloads a recomputable two-attempt journal without claiming human participation');

  await creator.evaluate(() => { window.open = () => null; });
  await creator.click('#open-created-workbench');
  assert.match(await creator.locator('#creator-status').innerText(), /bloqueó/);
  const fallback = await download(creator, '#download-starting-episode', 'original-popup-fallback.json');
  assert.deepEqual(fallback.value, secondStart.value);
  await reopened.setInputFiles('#import-file', fallback.path);
  await reopened.waitForFunction(() => document.getElementById('episode-title-input').value === 'A second original');
  assert.equal(await reopened.locator('#result .result-state.ambiguous').count(), 1);
  check('Blocked popup exposes a real download fallback that reopens the same second starting episode');

  await creator.setViewportSize({ width: 390, height: 844 });
  await creator.selectOption('#creator-ui-language', 'en');
  await creator.selectOption('#new-episode-locale', 'es');
  await prepare(creator, 'Árbol y letras', 'Árbol\nÑandú\nLuz', 'ÁÑL');
  const spanish = await download(creator, '#download-starting-episode', 'original-spanish.json');
  assert.deepEqual(spanish.value.episode.cards.map(card => card.label), ['Árbol', 'Ñandú', 'Luz']);
  assert.equal(spanish.value.episode.locale, 'es');
  await creator.selectOption('#creator-ui-language', 'es');
  assert.equal(await creator.locator('#new-episode-title').inputValue(), 'Árbol y letras');
  assert.equal(await creator.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await creator.screenshot({ path: resolve(evidenceDir, 'original-creator-mobile-spanish.png'), fullPage: true });
  check('390px Spanish interface preserves explicitly Spanish Unicode content and has no horizontal overflow');

  await prepare(creator, 'Two cards', 'Alpha\nBeta', 'AB');
  const two = await download(creator, '#download-starting-episode', 'original-two-cards.json');
  assert.equal(two.value.validation.result.clueOrderCount, 2);
  await prepare(creator, 'Eight cards', 'Alpha\nBeta\nCedar\nDune\nElm\nFern\nGrove\nHazel', 'ABCDEFGH');
  const eight = await download(creator, '#download-starting-episode', 'original-eight-cards.json');
  assert.equal(eight.value.validation.result.clueOrderCount, 40320);
  for (const labels of ['Alone', 'A\nB\nC\nD\nE\nF\nG\nH\nI']) {
    await creator.fill('#new-episode-labels', labels); await creator.click('#create-starting-episode');
    assert.equal(await creator.locator('#created-episode').isHidden(), true);
    assert.match(await creator.locator('#creator-status').innerText(), /2\.\.8|2.*8/);
  }
  check('Real form retains all 2 and 40320 orders at supported boundaries and rejects one or nine cards');

  await creator.fill('#new-episode-labels', 'Sun\nApple\nYarn');
  await creator.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => {
      const result = await digest(...args);
      await new Promise(done => { window.__releaseCreateDigest = done; });
      return result;
    };
  });
  await creator.click('#create-starting-episode');
  await creator.waitForFunction(() => typeof window.__releaseCreateDigest === 'function');
  await creator.fill('#new-episode-title', 'Edited while creating');
  await creator.evaluate(() => window.__releaseCreateDigest()); await settle(creator);
  assert.equal(await creator.locator('#created-episode').isHidden(), true);
  assert.equal(await creator.locator('#download-starting-episode').isDisabled(), true);
  check('An async starting export cannot revive a prepared snapshot after the form is edited');
  assert.equal(await author.locator('#episode-title-input').inputValue(), 'Fixture draft to preserve');
  assert.deepEqual(await storage(author), beforeStorage);
  await context.close();
  await protocolChecks(starting.value);
  assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.failedRequests, []); assert.deepEqual(receipt.httpErrors, []);
  receipt.passed = true;
} catch (error) {
  receipt.failure = { message: error.message, stack: error.stack }; process.exitCode = 1;
  if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: resolve(evidenceDir, 'original-receiver-failure.png'), fullPage: true }).catch(() => {});
} finally {
  receipt.finishedAt = new Date().toISOString();
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
  await writeFile(resolve(evidenceDir, 'original-authoring-browser-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
