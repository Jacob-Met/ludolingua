import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startReceiver } from '../serve.mjs';
import { EPISODES } from '../fixtures/episodes.mjs';
import { createExport,readExport } from '../lib/export.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';
import { analyzeEpisode } from '../lib/engine.mjs';
if(!process.env.PLAYWRIGHT_PACKAGE||!process.env.LUDO_EVIDENCE_DIR)throw Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE,'index.mjs')).href);
const out=resolve(process.env.LUDO_EVIDENCE_DIR);await mkdir(out,{recursive:true});
const receipt={schema:'ludolingua.clue-conflict-receiving.v1',startedAt:new Date().toISOString(),checks:[],errors:[],passed:false};
const {server,url}=await startReceiver({port:0});let browser,context,page;
const checked=name=>receipt.checks.push({name,passed:true});
async function save(){await page.locator('#draft-status[data-state="saved"]').waitFor();}
async function check(){await page.click('#check-button');await page.locator('#result .inconsistent').waitFor();await page.waitForFunction(()=>document.getElementById('digest').textContent.includes('SHA-256'));}
async function load(ep){
 const data=await createExport(ep);await page.locator('#import-file').setInputFiles({name:'diagnostic-case.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await page.locator('#draft-status[data-state="detached"]').waitFor();await page.locator('#episode-title').filter({hasText:ep.title}).waitFor();assert.equal(await page.locator('#episode-title').textContent(),ep.title);
}
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
 const cdp=await browser.newBrowserCDPSession(),flags=(await cdp.send('Browser.getBrowserCommandLine')).arguments;assert(!flags.includes('--no-sandbox')&&!flags.includes('--disable-setuid-sandbox'));
 context=await browser.newContext({viewport:{width:1280,height:1000},locale:'en-US',acceptDownloads:true});context.setDefaultTimeout(15000);
 context.on('page',p=>{p.on('pageerror',e=>receipt.errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')receipt.errors.push(m.text());});p.on('requestfailed',r=>receipt.errors.push(r.url()+': '+r.failure()?.errorText));p.on('response',r=>{if(r.status()>=400)receipt.errors.push(r.status()+' '+r.url());});});
 page=await context.newPage();await page.goto('chrome://sandbox');receipt.sandbox={flags,status:await page.locator('body').innerText()};assert.match(receipt.sandbox.status,/Seccomp-BPF sandbox\s+Yes/i);assert.match(receipt.sandbox.status,/Layer 1 Sandbox\s+Namespace/i);
 
 await page.goto(url);await page.locator('#label-0').waitFor();await page.selectOption('#case-select','es-adapted');await page.selectOption('#ui-language','es');
 await page.fill('#label-1','Barco azul');await save();await page.click('#add-clue');
 const added=page.locator('#clue-editor .clue-row').last();await added.locator('select[data-field="left"]').selectOption('moon');await added.locator('select[data-field="right"]').selectOption('bell');await save();await check();
 assert.match(await page.locator('#clue-conflict').innerText(),/Estas pistas se contradicen al aplicarse juntas/i);
 assert.match(await page.locator('#clue-conflict').innerText(),/Barco azul va inmediatamente antes de Roca/);
 const ids=await page.locator('#clue-conflict button').evaluateAll(buttons=>buttons.map(b=>b.dataset.conflictClueId).sort());assert.deepEqual(ids,['authored-1','pair']);
 assert.equal(await page.locator('.clue-row.in-conflict').count(),2);assert.equal(await page.locator('.clue-conflict-badge').count(),2);
 await page.locator('#clue-conflict button').last().click();
 assert.equal(await page.evaluate(()=>document.activeElement.closest('.clue-row').dataset.clueId),'authored-1');assert.equal(await page.evaluate(()=>document.activeElement.dataset.field),'left');
 assert.match(await page.evaluate(()=>document.activeElement.getAttribute('aria-describedby')),/clue-conflict-help/);
 checked('demonstrated Spanish contradiction names current labels and focuses participating rows');
 const pending=page.waitForEvent('download');await page.click('#export-button');const download=await pending,path=join(out,'negative-with-guidance.json');await download.saveAs(path);const rawExport=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(Object.keys(rawExport).sort(),['schema','episode','validation','evidence'].sort());assert.deepEqual(Object.keys(rawExport.validation).sort(),['engineVersion','episodeSha256','result'].sort());const received=await readExport(rawExport);
 assert.equal(received.validation.result.outcome,'inconsistent');assert.equal(received.validation.result.mechanicalSuccess,false);assert(!Object.hasOwn(received.validation.result,'clueIds'));assert(!Object.hasOwn(received.episode,'conflictExplanation'));
 await page.selectOption('#case-select','en-original');await page.locator('#import-file').setInputFiles(path);await page.locator('#clue-conflict').waitFor();assert.match(await page.locator('#clue-conflict').innerText(),/Barco azul/);
 checked('negative export and actual reopen keep analysis contract unchanged and recompute guidance');
 await page.selectOption('#ui-language','en');assert.match(await page.locator('#clue-conflict').innerText(),/These clues conflict when used together/i);
 assert.match(await page.locator('#clue-conflict').innerText(),/Barco azul va inmediatamente antes de Roca/);
 await page.click('#player-tab');assert.equal(await page.locator('#clue-conflict').isVisible(),false);await page.click('#author-tab');
 await page.setViewportSize({width:390,height:844});await page.selectOption('#ui-language','es');await page.locator('#clue-conflict').screenshot({path:join(out,'clue-conflict-mobile.png')});
 await page.locator('.clue-row.in-conflict').first().screenshot({path:join(out,'clue-conflict-row-mobile.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1280,height:1000});await page.locator('#clue-conflict').screenshot({path:join(out,'clue-conflict-desktop.png')});
 checked('guidance localizes without changing authored clues, stays author-only, and fits 390px');
 await page.evaluate(()=>{
  const original=crypto.subtle.digest.bind(crypto.subtle);
  window.__heldDigest=0;
  crypto.subtle.digest=async(...args)=>{window.__heldDigest++;await new Promise(r=>window.__releaseDiagnosticDigest=r);const value=await original(...args);window.__diagnosticDigestFinished=true;return value;};
  window.__restoreDiagnosticDigest=()=>{crypto.subtle.digest=original;};
 });
 await page.click('#check-button');await page.waitForFunction(()=>window.__heldDigest===1);
 await page.fill('#label-1','Barco revisado');assert.equal(await page.locator('#clue-conflict').count(),0);assert.equal(await page.locator('.clue-row.in-conflict').count(),0);assert.equal(await page.locator('[aria-describedby~="clue-conflict-help"]').count(),0);
 await page.evaluate(()=>{window.__restoreDiagnosticDigest();window.__releaseDiagnosticDigest();});
 await page.waitForFunction(()=>window.__diagnosticDigestFinished===true);
 assert.equal(await page.locator('#digest').textContent(),'');
 assert.equal(await page.locator('#clue-conflict').count(),0);assert(await page.isDisabled('#export-button'));checked('editing clears explanation and accessibility marks during pending digest');
 const negativePopup=page.waitForEvent('popup');await page.click('#launch-playtest');const captured=await negativePopup;await captured.locator('#playtest-status[data-state="ready"]').waitFor();assert.equal(await captured.locator('#clue-conflict').count(),0);
 await page.locator('#clue-editor .clue-row[data-clue-id="authored-1"] [data-action="remove-clue"]').click();await page.click('#check-button');await page.locator('#result .verified').waitFor();assert.equal(await page.locator('#clue-conflict').count(),0);
 checked('removing the introduced clue repairs the lesson without stale conflict marks');
 for(let i=0;i<3;i++)await captured.locator('#playtest-cards li[data-card-id="star"] button[data-direction="down"]').click();
 await captured.fill('#playtest-answer','ABRE');await captured.locator('#playtest-answer').press('Enter');
 const oldRecordEvent=captured.waitForEvent('download');await captured.click('#playtest-download');const oldDownload=await oldRecordEvent,oldPath=join(out,'captured-before-clue-repair.json');await oldDownload.saveAs(oldPath);
 const oldRecord=await readPlaytestRecord(await readFile(oldPath,'utf8'));assert.equal(analyzeEpisode(oldRecord.episode).outcome,'inconsistent');assert.equal(oldRecord.episode.clues.length,4);assert.equal(oldRecord.validation.result.summary.successfulAttempts,0);await captured.close();
 const beforeAuthorEvent=page.waitForEvent('download');await page.click('#export-button');const beforeAuthorDownload=await beforeAuthorEvent,beforeAuthorPath=join(out,'author-before-record-reopen.json');await beforeAuthorDownload.saveAs(beforeAuthorPath);const beforeAuthor=await readExport(await readFile(beforeAuthorPath,'utf8'));const rawHintsBefore=await page.inputValue('#hint-editor');
 const newPopup=page.waitForEvent('popup');await page.click('#launch-playtest');const repairedPlayer=await newPopup;await repairedPlayer.locator('#playtest-status[data-state="ready"]').waitFor();
 for(let i=0;i<3;i++)await repairedPlayer.locator('#playtest-cards li[data-card-id="star"] button[data-direction="down"]').click();
 await repairedPlayer.fill('#playtest-answer','ABRE');await repairedPlayer.locator('#playtest-answer').press('Enter');
 const newRecordEvent=repairedPlayer.waitForEvent('download');await repairedPlayer.click('#playtest-download');const newDownload=await newRecordEvent,newPath=join(out,'played-after-clue-repair.json');await newDownload.saveAs(newPath);
 const newRecord=await readPlaytestRecord(await readFile(newPath,'utf8'));assert.equal(newRecord.episode.clues.length,3);assert.deepEqual(newRecord.episode,beforeAuthor.episode);assert.notEqual(oldRecord.integrity.episodeSha256,newRecord.integrity.episodeSha256);assert.equal(newRecord.validation.result.summary.successfulAttempts,1);await repairedPlayer.close();
 await page.locator('#playtest-record-file').setInputFiles(newPath);await page.locator('#playtest-review').waitFor();assert.equal(await page.inputValue('#label-1'),'Barco revisado');assert.equal(await page.locator('#clue-conflict').count(),0);assert(await page.locator('#result .verified').isVisible());
 const afterAuthorEvent=page.waitForEvent('download');await page.click('#export-button');const afterAuthorDownload=await afterAuthorEvent,afterAuthorPath=join(out,'author-after-record-reopen.json');await afterAuthorDownload.saveAs(afterAuthorPath);const afterAuthor=await readExport(await readFile(afterAuthorPath,'utf8'));assert.deepEqual(afterAuthor.episode,beforeAuthor.episode);assert.equal(await page.inputValue('#hint-editor'),rawHintsBefore);
 receipt.captureSnapshots={beforeRepairSha256:oldRecord.integrity.episodeSha256,repairedSha256:newRecord.integrity.episodeSha256,authorSha256:beforeAuthor.integrity.episodeSha256,authorUnchangedAfterRecordReopen:true};
 checked('guided repair preserves a captured negative playtest and a new play record verifies the corrected lesson');

 const three=structuredClone(EPISODES[0]);three.id='adjacency-diagnostic';three.title='Three clues, one adjacency obstruction';three.clues=[{id:'adjacent',kind:'immediately_before',left:'key',right:'moon'},{id:'middle-left',kind:'before',left:'key',right:'bell'},{id:'middle-right',kind:'before',left:'bell',right:'moon'}];
 await load(three);assert.equal(await page.locator('#clue-conflict button').count(),3);assert.equal(await page.locator('.clue-row.in-conflict').count(),3);
 await page.locator('#clue-conflict').screenshot({path:join(out,'clue-conflict-three-way.png')});checked('three-way adjacency conflict is explained without inventing a pair');
 const large=structuredClone(EPISODES[0]);large.id='bounded-diagnostic';large.title='Bounded eight-card explanation';large.cards=Array.from({length:8},(_,i)=>({id:'card-'+i,label:'Label '+i}));large.action.expected='LLLLLLLL';large.clues=[{id:'forward',kind:'before',left:'card-0',right:'card-1'},{id:'reverse',kind:'before',left:'card-1',right:'card-0'}];
 const timing=await page.evaluate(async e=>{const {explainClueConflict}=await import('/lib/clue-conflict.mjs');const started=performance.now();const value=explainClueConflict(e);return {milliseconds:performance.now()-started,value};},large);
 receipt.boundedEightCard=timing;assert(['conflict','budget-exhausted'].includes(timing.value.state));assert(timing.milliseconds<1000,'Bounded diagnostic unexpectedly blocked browser for more than one second');
 for(let left=0;left<8&&large.clues.length<65;left++)for(let right=0;right<8&&large.clues.length<65;right++)if(left!==right)for(const kind of ['immediately_before','after']){if(large.clues.length===65)break;large.clues.push({id:'extra-'+large.clues.length,kind,left:'card-'+left,right:'card-'+right});}
 await load(large);assert.equal(await page.locator('#clue-conflict').count(),0);assert.equal(await page.locator('.clue-row.in-conflict').count(),0);
 assert.match(await page.locator('#result').innerText(),/No hay una explicación detallada/);assert(await page.locator('#result .inconsistent').isVisible());
 checked('bounded diagnostic measures eight-card path and oversized input retains accurate generic result');
 assert.deepEqual(receipt.errors,[]);receipt.passed=true;
}catch(error){receipt.failure=String(error.stack);process.exitCode=1;if(page)await page.screenshot({path:join(out,'clue-conflict-failure.png'),fullPage:true}).catch(()=>{});
}finally{
 if(browser)await browser.close();await new Promise(done=>server.close(done));receipt.finishedAt=new Date().toISOString();await writeFile(join(out,'clue-conflict-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
