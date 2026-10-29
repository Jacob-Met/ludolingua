import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startReceiver } from '../serve.mjs';
import { readExport, sourceDigest } from '../lib/export.mjs';
import { readComparisonExport } from '../lib/comparison-export.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';
import { EPISODES } from '../fixtures/episodes.mjs';
import { captureDraft, draftKey } from '../lib/drafts.mjs';

assert.ok(process.env.PLAYWRIGHT_PACKAGE, 'PLAYWRIGHT_PACKAGE is required');
assert.ok(process.env.LUDO_EVIDENCE_DIR, 'LUDO_EVIDENCE_DIR is required');
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir, { recursive: true });
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const source = EPISODES.find(episode => episode.id === 'en-original');
assert.ok(source, 'Expected en-original fixture');
const sourceSha256 = await sourceDigest(source), storageKey = draftKey(source.id);
const selectionKey = 'ludolingua.author-draft-selection';
const receipt = {schema:'ludolingua.wording-receiver-evidence.v1',startedAt:new Date().toISOString(),finishedAt:null,browserVersion:null,checks:[],errors:[],consoleErrors:[],failedRequests:[],passed:false};
const { server, url } = await startReceiver();
let browser, page;
function observe(observedPage) {
  observedPage.on('pageerror', error => receipt.errors.push(String(error)));
  observedPage.on('console', message => { if(message.type()==='error') receipt.consoleErrors.push(message.text()); });
  observedPage.on('requestfailed', request => receipt.failedRequests.push({url:request.url(),error:request.failure()?.errorText??'Unknown request failure'}));
}
async function check(name, operation) {
  const startedAt=new Date().toISOString();await operation();
  receipt.checks.push({name,passed:true,startedAt,finishedAt:new Date().toISOString()});
}
async function download(targetPage,selector,filename) {
  const pending=targetPage.waitForEvent('download');await targetPage.locator(selector).click();
  const item=await pending,path=resolve(evidenceDir,filename);await item.saveAs(path);return path;
}
async function readArtifact(path,reader) { return await reader(await readFile(path,'utf8')); }
function assertEpisodeWording(episode,title,story) { assert.equal(episode.title,title);assert.equal(episode.story,story); }
async function assertWording(title,story) {
  assert.equal(await page.locator('#episode-title-input').inputValue(),title);
  assert.equal(await page.locator('#episode-story-input').inputValue(),story);
  assert.equal(await page.locator('#episode-title').textContent(),title);
  assert.equal(await page.locator('#episode-story').textContent(),story);
}
async function editWording(title,story) {
  await page.locator('#episode-title-input').fill(title);await page.locator('#episode-story-input').fill(story);await assertWording(title,story);
}
async function savedWording(title,story) {
  await page.waitForFunction(({key,title,story})=>{
    try{const record=JSON.parse(localStorage.getItem(key));return record?.title===title&&record?.story===story;}catch{return false;}
  },{key:storageKey,title,story});
  await page.locator('#draft-status[data-state="saved"]').waitFor();
}
async function freshCheck(valid) {
  await page.locator('#check-button').click();await page.locator(valid?'.result-state.verified':'.result-state.invalid').waitFor();
}
async function launchPlayer() {
  const pending=page.waitForEvent('popup');await page.locator('#launch-playtest').click();
  const popup=await pending;observe(popup);await popup.locator('#playtest-session').waitFor({state:'visible'});return popup;
}
async function assertPlayerWording(popup,title,story) {
  assert.equal(await popup.locator('#playtest-title').textContent(),title);
  assert.equal(await popup.locator('#playtest-story').textContent(),story);
}
async function assertContentLanguages() {
  for(const selector of ['#episode-title-input','#episode-story-input'])
    assert.equal(await page.locator(selector).getAttribute('lang'),source.locale);
}
try {
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
  receipt.browserVersion=browser.version();
  const cdp=await browser.newBrowserCDPSession(),flags=(await cdp.send('Browser.getBrowserCommandLine')).arguments;
  assert.equal(flags.some(flag=>flag==='--no-sandbox'||flag==='--disable-setuid-sandbox'),false);
  const context=await browser.newContext({viewport:{width:1280,height:1000},locale:'en-US',acceptDownloads:true});
  page=await context.newPage();observe(page);await page.goto(url);await page.locator('#case-select').selectOption(source.id);
  const firstTitle='  The gardener’s signal — café 🌱\nA new beginning  ';
  const firstStory='  Four labels mark the garden gate.\nRead their initials in the clue-consistent order.  ';
  const secondTitle='A second scene: café 🌱';
  const secondStory='A new scene keeps the same puzzle mechanics.\nIts wording belongs only to the next player session.';
  let firstExport,firstEpisode;
  await check('Exact wording updates headings, saves, and exports',async()=>{
    await editWording(firstTitle,firstStory);await savedWording(firstTitle,firstStory);await assertContentLanguages();await freshCheck(true);
    firstExport=await download(page,'#export-button','wording-first.episode.json');
    const verified=await readArtifact(firstExport,readExport);firstEpisode=verified.episode;
    assertEpisodeWording(firstEpisode,firstTitle,firstStory);assert.ok(firstEpisode.revision>source.revision);assert.equal(firstEpisode.action.expected,source.action.expected);
    const raw=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
    assert.equal(raw.hintReview.reason,'Episode title or story changed.');
    await page.locator('.scene-editor').screenshot({path:resolve(evidenceDir,'wording-desktop-scene.png')});
  });
  await check('Reload restores exact v2 wording and captures comparison source',async()=>{
    await page.reload();await page.locator('#draft-status[data-state="restored"]').waitFor();await assertWording(firstTitle,firstStory);await freshCheck(true);
    const path=await download(page,'#export-button','wording-restored.episode.json'),verified=await readArtifact(path,readExport);
    assertEpisodeWording(verified.episode,firstTitle,firstStory);assert.equal(verified.episode.revision,firstEpisode.revision);
    await page.locator('#use-current-as-source').click();
  });
  await check('Existing player stays frozen; new player captures new wording',async()=>{
    const originalPlayer=await launchPlayer();await assertPlayerWording(originalPlayer,firstTitle,firstStory);
    await editWording(secondTitle,secondStory);assert.equal(await page.locator('#export-button').isDisabled(),true);
    assert.equal((await page.locator('#digest').textContent()).trim(),'');assert.equal(await page.locator('.result-state.verified').count(),0);
    assert.equal(await page.locator('#comparison-export-button').isDisabled(),true);
    await assertPlayerWording(originalPlayer,firstTitle,firstStory);
    const oldPath=await download(originalPlayer,'#playtest-download','wording-frozen.playtest.json'),oldRecord=await readArtifact(oldPath,readPlaytestRecord);
    assertEpisodeWording(oldRecord.episode,firstTitle,firstStory);assert.equal(oldRecord.episode.revision,firstEpisode.revision);
    const newPlayer=await launchPlayer();await assertPlayerWording(newPlayer,secondTitle,secondStory);
    const newPath=await download(newPlayer,'#playtest-download','wording-new.playtest.json'),newRecord=await readArtifact(newPath,readPlaytestRecord);
    assertEpisodeWording(newRecord.episode,secondTitle,secondStory);assert.ok(newRecord.episode.revision>oldRecord.episode.revision);
    assert.equal(newRecord.episode.action.expected,oldRecord.episode.action.expected);
    await originalPlayer.close();await newPlayer.close();
  });
  await check('Comparison preserves captured source and current target wording',async()=>{
    await page.locator('#compare-button').click();await page.waitForFunction(()=>!document.getElementById('comparison-export-button').disabled);
    const path=await download(page,'#comparison-export-button','wording-pair.comparison.json'),verified=await readArtifact(path,readComparisonExport);
    assertEpisodeWording(verified.source,firstTitle,firstStory);assertEpisodeWording(verified.target,secondTitle,secondStory);
    assert.equal(verified.validation.result.sameOrderSet,true);assert.equal(verified.validation.result.mechanicalPreserved,true);
  });
  await check('Same-value input events preserve revision and digest',async()=>{
    await freshCheck(true);const beforePath=await download(page,'#export-button','wording-noop-before.episode.json'),before=await readArtifact(beforePath,readExport);
    const digestBefore=await page.locator('#digest').textContent();assert.ok(digestBefore.trim());
    for(const selector of ['#episode-title-input','#episode-story-input'])
      await page.locator(selector).evaluate(input=>input.dispatchEvent(new Event('input',{bubbles:true})));
    assert.equal(await page.locator('#digest').textContent(),digestBefore);assert.equal(await page.locator('#export-button').isDisabled(),false);
    assert.equal(await page.locator('.result-state.verified').count(),1);
    const afterPath=await download(page,'#export-button','wording-noop-after.episode.json'),after=await readArtifact(afterPath,readExport);
    assert.equal(after.episode.revision,before.episode.revision);assert.deepEqual(after.episode,before.episode);assert.deepEqual(after.validation,before.validation);
  });
  await check('Interface translation preserves content language, focus, and caret',async()=>{
    const labels=['label[for="episode-title-input"]','label[for="episode-story-input"]'];
    const english=await Promise.all(labels.map(selector=>page.locator(selector).textContent()));
    const revisionBefore=await page.locator('#revision').textContent(),digestBefore=await page.locator('#digest').textContent();
    await page.locator('#episode-story-input').focus();
    await page.locator('#episode-story-input').evaluate(input=>{input.setSelectionRange(5,14);input.dataset.wordingReceiverIdentity='retained';});
    await page.locator('#ui-language').evaluate(select=>{select.value='es';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>document.documentElement.lang==='es');await assertWording(secondTitle,secondStory);await assertContentLanguages();
    for(let i=0;i<labels.length;i++){const spanish=await page.locator(labels[i]).textContent();assert.ok(spanish.trim());assert.notEqual(spanish,english[i]);}
    const selection=await page.locator('#episode-story-input').evaluate(input=>({active:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd,retained:input.dataset.wordingReceiverIdentity}));
    assert.deepEqual(selection,{active:true,start:5,end:14,retained:'retained'});
    await page.locator('#ui-language').evaluate(select=>{select.value='en';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>document.documentElement.lang==='en');await assertWording(secondTitle,secondStory);await assertContentLanguages();
    for(let i=0;i<labels.length;i++)assert.equal(await page.locator(labels[i]).textContent(),english[i]);
    assert.equal(await page.locator('#revision').textContent(),revisionBefore);assert.equal(await page.locator('#digest').textContent(),digestBefore);
  });
  await check('Empty title survives draft recovery but fails validation',async()=>{
    await editWording('',secondStory);await savedWording('',secondStory);await freshCheck(false);assert.equal(await page.locator('#export-button').isDisabled(),true);
    await page.reload();await page.locator('#draft-status[data-state="restored"]').waitFor();await assertWording('',secondStory);await freshCheck(false);
  });
  await check('Whitespace story survives exactly but fails validation',async()=>{
    const whitespace=' \n  \n ';await editWording(secondTitle,whitespace);await savedWording(secondTitle,whitespace);
    await freshCheck(false);assert.equal(await page.locator('#export-button').isDisabled(),true);
    await page.reload();await page.locator('#draft-status[data-state="restored"]').waitFor();await assertWording(secondTitle,whitespace);await freshCheck(false);
  });
  await check('Legacy v1 restores unchanged bytes; next edit writes v2',async()=>{
    const edited=structuredClone(source);edited.revision=source.revision+7;edited.action.expected='PLAY';
    const legacy=captureDraft(source,sourceSha256,edited,'wording-receiver-legacy-v1');delete legacy.title;delete legacy.story;legacy.schema='ludolingua.author-draft.v1';
    const legacyRaw=JSON.stringify(legacy);
    await page.evaluate(({key,selectionKey,id,raw})=>{localStorage.setItem(key,raw);localStorage.setItem(selectionKey,id);},{key:storageKey,selectionKey,id:source.id,raw:legacyRaw});
    await page.reload();await page.locator('#draft-status[data-state="restored"]').waitFor();await assertWording(source.title,source.story);
    assert.equal(await page.locator('#required-action').inputValue(),'PLAY');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),legacyRaw);
    const migratedTitle='Legacy draft, explicitly edited';await page.locator('#episode-title-input').fill(migratedTitle);await savedWording(migratedTitle,source.story);
    const migrated=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
    assert.equal(migrated.schema,'ludolingua.author-draft.v2');assert.equal(migrated.title,migratedTitle);assert.equal(migrated.story,source.story);
    assert.equal(migrated.actionExpected,'PLAY');assert.equal(await page.locator('#required-action').inputValue(),'PLAY');
  });
  await check('Imported episode restores wording and remains detached',async()=>{
    await page.locator('#import-file').setInputFiles(firstExport);
    await page.waitForFunction(({title,story})=>document.getElementById('episode-title-input').value===title&&document.getElementById('episode-story-input').value===story,{title:firstTitle,story:firstStory});
    await page.locator('#draft-status[data-state="detached"]').waitFor();await assertWording(firstTitle,firstStory);await freshCheck(true);
  });
  await check('Detached wording edits work at 390px and export faithfully',async()=>{
    const storedBefore=await page.evaluate(key=>localStorage.getItem(key),storageKey);await page.setViewportSize({width:390,height:844});
    const title='A small-screen scene',story='The author can edit this scene on a narrow screen.\nExact wording stays intact.';
    await editWording(title,story);await page.locator('#draft-status[data-state="detached"]').waitFor();await freshCheck(true);
    const path=await download(page,'#export-button','wording-narrow.episode.json'),verified=await readArtifact(path,readExport);
    assertEpisodeWording(verified.episode,title,story);assert.ok(verified.episode.revision>firstEpisode.revision);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),storedBefore);
    for(const selector of ['#episode-title-input','#episode-story-input']){
      const d=await page.locator(selector).evaluate(input=>{const r=input.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,viewport:document.documentElement.clientWidth};});
      assert.ok(d.width>0);assert.ok(d.left>=0);assert.ok(d.right<=d.viewport+1);
    }
    const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    assert.ok(widths.scroll<=widths.viewport+1);
    await page.locator('.scene-editor').screenshot({path:resolve(evidenceDir,'wording-narrow-panel.png')});
  });

  await check('Spanish five-card scene edits survive draft recovery and export',async()=>{
    const signal=EPISODES.find(episode=>episode.id==='es-signal-adapted');
    assert.ok(signal);assert.equal(signal.cards.length,5);assert.equal(signal.clues.length,5);assert.equal(signal.action.expected,'PULSA');
    const key=draftKey(signal.id),title='  Una nueva señal — jardín 🌱  ',story='Cinco señales esperan junto a la puerta.\nSigue las pistas y descubre la acción indicada.  ';
    await page.setViewportSize({width:1280,height:1000});await page.locator('#case-select').selectOption(signal.id);await editWording(title,story);
    await page.waitForFunction(({key,title,story})=>{try{const r=JSON.parse(localStorage.getItem(key));return r?.title===title&&r?.story===story;}catch{return false;}},{key,title,story});
    await page.locator('#draft-status[data-state="saved"]').waitFor();await page.reload();await page.locator('#draft-status[data-state="restored"]').waitFor();
    assert.equal(await page.locator('#case-select').inputValue(),signal.id);await assertWording(title,story);
    assert.ok(await page.evaluate(()=>document.documentElement.lang.startsWith('en')));
    for(const selector of ['#episode-title-input','#episode-story-input'])assert.equal(await page.locator(selector).getAttribute('lang'),'es');
    await freshCheck(true);
    const path=await download(page,'#export-button','wording-spanish-five-card.episode.json'),verified=await readArtifact(path,readExport),restored=verified.episode;
    assertEpisodeWording(restored,title,story);assert.equal(restored.id,signal.id);assert.equal(restored.locale,'es');assert.equal(restored.cards.length,5);assert.equal(restored.clues.length,5);assert.ok(restored.revision>signal.revision);
    for(const field of ['constraints','extraction','cards','clues','action','hints','provenance'])assert.deepEqual(restored[field],signal[field],'Scene edits must preserve '+field);
    assert.deepEqual(restored.hintReview,{status:'needs-author-review',kind:'author-self-declaration',reason:'Episode title or story changed.'});
  });
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.consoleErrors,[]);assert.deepEqual(receipt.failedRequests,[]);receipt.passed=true;
} catch(error) {
  receipt.failure=error?.stack??String(error);process.exitCode=1;
  if(page&&!page.isClosed())await page.screenshot({path:resolve(evidenceDir,'wording-failure.png'),fullPage:false}).catch(()=>{});
} finally {
  try{await browser?.close();}finally{
    await new Promise(done=>server.close(done));receipt.finishedAt=new Date().toISOString();
    const text=JSON.stringify(receipt,null,2)+'\n';await writeFile(resolve(evidenceDir,'wording-receipt.json'),text);console.log(text);
  }
}
