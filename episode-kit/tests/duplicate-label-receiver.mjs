import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const root = process.env.LUDO_KIT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.LUDO_EVIDENCE_DIR;
assert(dir && process.env.PLAYWRIGHT_PACKAGE, 'Set LUDO_EVIDENCE_DIR outside episode-kit and PLAYWRIGHT_PACKAGE.');
const relative = path.relative(root, path.resolve(dir));
assert(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Keep evidence outside episode-kit.');
const imp = p => import(pathToFileURL(path.join(root, p)).href);
const {createExport} = await imp('lib/export.mjs');
const {startReceiver} = await imp('serve.mjs');
const {EPISODES} = await imp('fixtures/episodes.mjs');
const {chromium} = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const episode = structuredClone(EPISODES.find(e => e.id === 'en-original'));
episode.id = 'duplicate-label-independent-test';
episode.title = 'Independent duplicate label browser course';
episode.cards = [
  {id:'key',label:'Pine'}, {id:'bell',label:'Pine'}, {id:'moon',label:'Pine  (key)'},
  {id:'star',label:'Pine (key) [1]'}, {id:'sun',label:'Pine (key) [1] [1]'},
];
episode.clues = episode.cards.slice(1).map((card, i) => ({id:'next-' + i,kind:'immediately_before',left:episode.cards[i].id,right:card.id}));
episode.action.expected = 'PPPPP'; episode.hints = [];
episode.provenance.semanticChanges.push('Test-only synthetic identity collision fixture; not a product episode.');
const authored = episode.cards.map(c => ({id:c.id,label:c.label}));
await fs.mkdir(dir, {recursive:true});
const input = path.join(dir, 'independent-episode.json');
await fs.writeFile(input, JSON.stringify(await createExport(episode)));
const norm = s => s.normalize('NFC').trim().replace(/\s+/gu, ' ');
const unique = (xs, what) => assert.equal(new Set(xs.map(norm)).size, xs.length, what + ': ' + JSON.stringify(xs));
const svc = await startReceiver({port:0});
const receipt = {schema:'ludolingua.duplicate-label-receiving.v1',startedAt:new Date().toISOString(),url:svc.url,checks:[],errors:[],failedRequests:[],httpErrors:[],passed:false};
const checked = name => receipt.checks.push(name);
const observe = p => {
  p.on('pageerror', e => receipt.errors.push(String(e)));
  p.on('console', m => {if (m.type() === 'error') receipt.errors.push(m.text());});
  p.on('requestfailed', r => receipt.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  p.on('response', r => {if (r.status() >= 400) receipt.httpErrors.push({url:r.url(),status:r.status()});});
};
let browser, page, player;
try {
  browser = await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
  const cdp = await browser.newBrowserCDPSession();
  const command = await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(v => v === '--no-sandbox' || v === '--disable-setuid-sandbox'), false);
  const context = await browser.newContext({viewport:{width:1280,height:1000},locale:'en-US',acceptDownloads:true});
  page = await context.newPage(); page.setDefaultTimeout(10_000);
  await page.goto('chrome://sandbox');
  receipt.sandbox = await page.locator('body').innerText();
  assert.match(receipt.sandbox, /Seccomp-BPF sandbox\s+Yes/i); checked('Chrome sandbox verified');
  observe(page); await page.goto(svc.url);
  await page.locator('#case-select option').first().waitFor({state:'attached'});
  await page.locator('#import-file').setInputFiles(input);
  await page.waitForFunction(t => document.querySelector('#episode-title')?.textContent.includes(t), episode.title);
  await page.locator('#check-button').click(); await page.locator('.result-state.verified').waitFor();
  checked('Synthetic five-card collision fixture passes encoded mechanics');
  await page.locator('#player-tab').click();
  const rows = (p, list) => p.locator(list + ' li[data-card-id]').evaluateAll(es => es.map(e => ({
    id:e.dataset.cardId,label:e.querySelector('.keeper-label').textContent,
    buttons:[...e.querySelectorAll('button[data-direction]')].map(b => ({direction:b.dataset.direction,name:b.getAttribute('aria-label') || b.textContent})),
  })));
  const check = async (p, list, expected) => {
    const rs = await rows(p, list); assert.equal(rs.length, 5);
    unique(rs.map(r => r.label), 'visible labels');
    unique(rs.flatMap(r => r.buttons.map(b => b.name)), 'move accessible names');
    if (expected) for (const r of rs) assert.equal(r.label, expected.get(r.id), 'stable labels');
    return new Map(rs.map(r => [r.id,r.label]));
  };
  const labels = await check(page, '#player-order'); receipt.labels = [...labels];
  checked('Authored names and multiple generated suffixes remain distinct');
  const move = async (p, list) => {
    const before = (await rows(p,list)).map(r => r.id);
    const button = p.locator(list + ' button[data-direction="down"]:enabled').first();
    const id = await button.evaluate(e => e.closest('li').dataset.cardId);
    await button.focus(); await p.keyboard.press('Enter');
    const after = (await rows(p,list)).map(r => r.id);
    assert.equal(after.indexOf(id), before.indexOf(id) + 1, 'keyboard move effect');
    assert.deepEqual([...after].sort(), [...before].sort(), 'same card IDs');
    assert.equal(await p.evaluate(() => document.activeElement?.closest('li')?.dataset.cardId), id, 'moved card focus');
    await check(p,list,labels);
    return id;
  };
  const locales = async (p, list, select) => {
    await p.locator(select).selectOption('en'); const en = await rows(p,list);
    const names = rs => rs.flatMap(r => r.buttons.map(b => [r.id + ':' + b.direction,b.name]));
    const english = new Map(names(en));
    await p.locator(select).selectOption('es'); await check(p,list,labels);
    assert(names(await rows(p,list)).some(([k,v]) => v !== english.get(k)), 'Spanish translation');
    await p.locator(select).selectOption('en'); await check(p,list,labels);
    assert.deepEqual(names(await rows(p,list)), names(en), 'English controls restored');
  };
  await move(page,'#player-order'); await locales(page,'#player-order','#ui-language');
  checked('Workbench keyboard movement, focus, translations and card identities verified');
  await page.locator('#author-tab').click();
  const download = page.waitForEvent('download'); await page.locator('#export-button').click();
  const exportedPath = path.join(dir,'raw-export.json'); await (await download).saveAs(exportedPath);
  const data = JSON.parse(await fs.readFile(exportedPath,'utf8'));
  assert.deepEqual(data.episode.cards.map(c => ({id:c.id,label:c.label})), authored);
  checked('Downloaded episode preserves exact authored labels and IDs');
  await page.click('#use-current-as-source'); await page.click('#compare-button');
  await page.locator('#comparison-status[data-preserved="true"]').waitFor();
  const mappingNames = await page.locator('select[aria-label^="Adaptation role for"]').evaluateAll(es => es.map(e => e.getAttribute('aria-label')));
  assert.equal(mappingNames.length,5); unique(mappingNames,'source mapping accessible names');
  const expectedNames = episode.cards.map(card => labels.get(card.id));
  const preview = await page.locator('#source-summary .comparison-words').innerText();
  assert.equal(norm(preview), norm(expectedNames.join(' / ')), 'captured source preview preserves each identity in authored card order');
  checked('Captured source preview and comparison role controls distinguish the same identities');
  const opened = page.waitForEvent('popup'); await page.locator('#launch-playtest').click(); player = await opened;
  player.setDefaultTimeout(10_000); observe(player);
  await player.locator('#playtest-status[data-state="ready"]').waitFor();
  await check(player,'#playtest-cards',labels);
  const movedId = await move(player,'#playtest-cards');
  await locales(player,'#playtest-cards','#playtest-ui-language');
  checked('Separate player preserves unique labels, translated controls and keyboard behavior');
  await player.locator('#playtest-reveal').click(); await player.locator('#playtest-solution').waitFor();
  const solutionPaths = await player.locator('#playtest-solution .path').allInnerTexts();
  assert.deepEqual(solutionPaths.map(norm), [norm(expectedNames.join(' → ') + ' → ' + episode.action.expected)], 'revealed path preserves each identity in the forced solution order');
  const recordDownload = player.waitForEvent('download'); await player.locator('#playtest-download').click();
  const recordPath = path.join(dir,'playtest-record.json'); await (await recordDownload).saveAs(recordPath);
  const record = JSON.parse(await fs.readFile(recordPath,'utf8'));
  assert.deepEqual(record.episode.cards.map(c => ({id:c.id,label:c.label})), authored);
  await page.locator('#playtest-record-file').setInputFiles(recordPath);
  await page.waitForFunction(() => document.querySelector('#playtest-review-status')?.textContent.includes('Record verified'));
  await page.locator('#playtest-review details summary').click();
  assert((await page.locator('#playtest-review li').allTextContents()).some(v => v.includes(labels.get(movedId))), 'recorded move has distinct card identity');
  checked('Downloaded record replays raw labels while reviewed moves and solution paths identify cards');
  await page.screenshot({path:path.join(dir,'duplicate-label-author-desktop.png'),fullPage:false});
  for (const p of [page,player]) {
    await p.setViewportSize({width:390,height:844});
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '390px horizontal overflow');
  }
  await player.screenshot({path:path.join(dir,'duplicate-label-player-mobile.png'),fullPage:false});
  checked('Author and player fit 390px without horizontal overflow');

  // Valid IDs are byte-distinct, even when they look the same after NFC.
  const unicode = structuredClone(EPISODES.find(e => e.id === 'en-original'));
  unicode.id = 'unicode-card-choice-test'; unicode.title = 'Distinct Unicode card choices';
  const ids = new Map([['key','café'],['bell','cafe\u0301']]);
  unicode.cards = unicode.cards.map(c => ({...c,id:ids.get(c.id) ?? c.id}));
  unicode.clues = unicode.clues.map(c => ({...c,left:ids.get(c.left) ?? c.left,right:ids.get(c.right) ?? c.right}));
  unicode.cards[0].label = unicode.cards[1].label = 'Pine';
  unicode.action.expected = 'PPEN'; unicode.hints = [];
  unicode.provenance.semanticChanges.push('Test-only NFC-equivalent ID choice fixture.');
  const unicodeInput = path.join(dir,'unicode-choice-episode.json');
  await fs.writeFile(unicodeInput,JSON.stringify(await createExport(unicode)));
  const unicodePage = await context.newPage(); observe(unicodePage); unicodePage.setDefaultTimeout(10_000);
  await unicodePage.goto(svc.url);
  await unicodePage.locator('#case-select option').first().waitFor({state:'attached'});
  await unicodePage.locator('#import-file').setInputFiles(unicodeInput);
  await unicodePage.waitForFunction(t => document.querySelector('#episode-title')?.textContent.includes(t),unicode.title);
  await unicodePage.locator('#check-button').click(); await unicodePage.locator('.result-state.verified').waitFor();
  const options = async selects => {
    assert(await selects.count() > 0,'card choice controls exist');
    for (const select of await selects.all()) {
      const choices = await select.locator('option').evaluateAll(es => es.filter(e => e.value).map(e => ({value:e.value,label:e.textContent})));
      assert.deepEqual(choices.map(c => c.value),unicode.cards.map(c => c.id),'raw card choice values');
      unique(choices.map(c => c.label),'normalized card choices');
    }
  };
  const clueSelects = unicodePage.locator('#clue-editor select[data-field="left"],#clue-editor select[data-field="right"]');
  await options(clueSelects);
  const firstClue = clueSelects.first();
  const originalClueValue = await firstClue.inputValue();
  await firstClue.selectOption('cafe\u0301'); assert.equal(await firstClue.inputValue(),'cafe\u0301','decomposed clue identity selection');
  await firstClue.selectOption('café'); assert.equal(await firstClue.inputValue(),'café','composed clue identity selection');
  await firstClue.selectOption(originalClueValue);
  await unicodePage.locator('#freeze-labels').uncheck();
  await unicodePage.locator('#label-0').fill('Pine ');
  await options(clueSelects);
  await unicodePage.locator('#label-0').fill('Pine');
  await unicodePage.locator('#use-current-as-source').click();
  const mappings = unicodePage.locator('#mapping-editor select');
  await options(mappings);
  const originalMappingValue = await mappings.first().inputValue();
  await mappings.first().selectOption('cafe\u0301'); assert.equal(await mappings.first().inputValue(),'cafe\u0301','decomposed mapping identity selection');
  await mappings.first().selectOption('café'); assert.equal(await mappings.first().inputValue(),'café','composed mapping identity selection');
  await mappings.first().selectOption(originalMappingValue);
  receipt.unicodeChoices = {originalClueValue,originalMappingValue};
  await unicodePage.locator('#compare-button').click();
  await unicodePage.locator('#comparison-status[data-preserved="true"]').waitFor();
  await unicodePage.close();
  checked('NFC-equivalent IDs stay distinct in clue and comparison choices, refreshes and exact value selection');

  assert.deepEqual(receipt.errors,[]); assert.deepEqual(receipt.failedRequests,[]); assert.deepEqual(receipt.httpErrors,[]);
  checked('No browser runtime or resource failures');
  receipt.passed = true;
} catch (error) {
  receipt.failure = {message:error.message,stack:error.stack}; process.exitCode = 1;
  for (const [name,p] of [['author',page],['playtest',player]]) if (p && !p.isClosed()) await p.screenshot({path:path.join(dir,'failure-' + name + '.png'),fullPage:false}).catch(() => {});
} finally {
  await browser?.close(); await new Promise(resolve => svc.server.close(resolve));
  receipt.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(dir,'duplicate-label-receipt.json'),JSON.stringify(receipt,null,2) + '\n');
  console.log(JSON.stringify(receipt));
}
