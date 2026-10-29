import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {startReceiver} from '../../episode-kit/serve.mjs';
import {readExport} from '../../episode-kit/lib/export.mjs';
import {readComparisonExport} from '../../episode-kit/lib/comparison-export.mjs';
import {readPlaytestRecord} from '../../episode-kit/lib/playtest-export.mjs';
import {CASES} from './cases.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const out=process.argv[2];
if(!out)throw new Error('Pass a new absolute evidence directory.');
await fs.mkdir(out,{recursive:false});
const modulePath=process.env.PLAYWRIGHT_MODULE;
if(!modulePath)throw new Error('Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs.');
const {chromium}=await import(pathToFileURL(modulePath));
const receipt={schema:'ludolingua.coastal-browser-receiving.v1',checks:[],cases:[],comparisons:[],errors:[],
 limitations:['Automated known-order checks; not an attested human or unaided solving session.','Mechanical receiving does not establish native-language quality or equal difficulty.']};
const record=(name,detail={})=>receipt.checks.push({name,...detail});
const sha=b=>createHash('sha256').update(b).digest('hex');
const order=p=>p.locator('#playtest-cards li[data-card-id]').evaluateAll(es=>es.map(e=>e.dataset.cardId));
const expected=['nest','sea','river','tower','landing'];
function observe(p){p.on('pageerror',e=>receipt.errors.push({type:'pageerror',message:e.message}));p.on('console',m=>{if(m.type()==='error')receipt.errors.push({type:'console',message:m.text()});});p.on('requestfailed',r=>receipt.errors.push({type:'requestfailed',url:r.url(),failure:r.failure()}));p.on('response',r=>{if(r.status()>=400)receipt.errors.push({type:'http',status:r.status(),url:r.url()});});}
async function download(p,selector,name){const pending=p.waitForEvent('download');await p.locator(selector).click();const d=await pending;assert.equal(await d.failure(),null);const target=path.join(out,name);await d.saveAs(target);return {target,data:await fs.readFile(target)};}
async function keyboardOrder(p){
 let moves=0;
 for(let target=0;target<expected.length;target++){
  const id=expected[target];
  while((await order(p)).indexOf(id)>target){
   const before=await order(p),index=before.indexOf(id);
   const button=p.locator('#playtest-cards li[data-card-id="'+id+'"] button[data-direction="up"]');
   assert(await button.isEnabled());await button.focus();await p.keyboard.press('Enter');
   const after=await order(p),wanted=[...before];[wanted[index-1],wanted[index]]=[wanted[index],wanted[index-1]];
   assert.deepEqual(after,wanted);
   assert.equal(await p.evaluate(()=>document.activeElement?.closest('li')?.dataset.cardId),id);
   assert(++moves<=20);
  }
 }
 assert.deepEqual(await order(p),expected);return moves;
}
let receiver,browser,context;
try{
 receiver=await startReceiver({port:0});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
 context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
 context.on('page',observe);
 const sandbox=await context.newPage();await sandbox.goto('chrome://sandbox');receipt.sandbox=await sandbox.locator('body').innerText();
 assert.match(receipt.sandbox,/Seccomp-BPF sandbox\s+Yes/i);await sandbox.goto('chrome://version');const version=await sandbox.locator('body').innerText();
 assert(!version.includes('--no-sandbox'));assert(!version.includes('--disable-setuid-sandbox'));
 receipt.browserVersion=browser.version();record('actual Chromium sandbox enabled');await sandbox.close();
 const names=['01-en-source.json','02-es-literal-contrast.json','03-es-adapted.json'];
 for(let i=0;i<CASES.length;i++){
  const episode=CASES[i],positive=i!==1,page=await context.newPage();
  await page.goto(receiver.url);await page.locator('#case-select option').first().waitFor({state:'attached'});
  const exported=JSON.parse(await fs.readFile(path.join(here,'exports/episodes',names[i]),'utf8'));
  await page.locator('#import-file').setInputFiles(path.join(here,'exports/episodes',names[i]));
  await page.waitForFunction(hash=>document.querySelector('#digest').textContent.includes(hash),exported.validation.episodeSha256);
  assert.equal(await page.locator('#episode-title').innerText(),episode.title);
  assert.deepEqual(await page.locator('#clue-editor select[data-field="left"]').evaluateAll(es=>es.map(e=>e.value)),episode.clues.map(c=>c.left));
  assert.deepEqual(await page.locator('#clue-editor select[data-field="right"]').evaluateAll(es=>es.map(e=>e.value)),episode.clues.map(c=>c.right));
  const copied=await download(page,'#export-button',episode.id+'-episode.json');
  const copiedRaw=JSON.parse(copied.data);const read=await readExport(copiedRaw);
  assert(read.integrity.verified);assert.deepEqual(copiedRaw,exported);assert.deepEqual(read.episode,episode);
  record(episode.id+' exact browser import and checked export',{sha256:sha(copied.data),mechanicalSuccess:read.validation.result.mechanicalSuccess});
  if(episode.locale==='es')await page.locator('#ui-language').selectOption('es');
  const popup=page.waitForEvent('popup');await page.locator('#launch-playtest').click();const player=await popup;
  await player.locator('#playtest-status[data-state="ready"]').waitFor();
  assert.equal(await player.locator('#playtest-ui-language').inputValue(),episode.locale);
  assert.deepEqual((await player.locator('#playtest-cards li[data-card-id]').evaluateAll(es=>es.map(e=>({id:e.dataset.cardId,label:e.querySelector('.keeper-label').textContent})))).sort((a,b)=>a.id.localeCompare(b.id)),episode.cards.map(c=>({...c})).sort((a,b)=>a.id.localeCompare(b.id)));
  const moves=await keyboardOrder(player);record(episode.id+' keyboard reorder retains focus',{moves,order:await order(player)});
  const answers=positive?[episode.action.expected]:['NORTP','NORTE'];
  for(const answer of answers){
   await player.locator('#playtest-answer').fill(answer);await player.locator('#playtest-answer').press('Enter');
   await player.waitForFunction(()=>document.querySelector('#playtest-feedback').textContent.length>0);
   const feedback=await player.locator('#playtest-feedback').innerText();
   if(positive)assert.match(feedback,episode.locale==='es'?/La acción funciona/:/The action works/);
   else assert.match(feedback,/La acción no coincide|la acción no coincide/);
  }
  const journal=await download(player,'#playtest-download',episode.id+'-play-record.json');
  const rawRecord=JSON.parse(journal.data);const verified=await readPlaytestRecord(rawRecord);
  assert(verified.integrity.verified);assert.deepEqual(verified.episode,episode);
  const {finalState,summary}=verified.validation.result;
  assert.deepEqual(finalState.order,expected);assert.equal(finalState.lastAttempt.success,positive);
  assert.equal(summary.moves,moves);assert.equal(summary.attempts,answers.length);assert.equal(summary.successfulAttempts,positive?1:0);
  assert.equal(summary.hintsShown,0);assert.equal(summary.revealUsed,false);assert.equal(summary.resets,0);
  assert.deepEqual(rawRecord.events.filter(e=>e.type==='attempt').map(e=>e.answer),answers);
  assert(rawRecord.events.every(e=>['move','attempt'].includes(e.type)));
  for(const key of ['humanIdentityAttested','nativeLanguageAttested','humanQualityVerified','modelContributionVerified'])assert.equal(verified.evidence[key],false);
  record(episode.id+' actual record export and deterministic replay',{summary,sha256:sha(journal.data)});
  await page.locator('#ui-language').selectOption('en');
  await page.locator('#playtest-record-file').setInputFiles(journal.target);
  await page.waitForFunction(hash=>document.querySelector('#playtest-review').textContent.includes(hash),verified.integrity.bindingSha256);
  assert.match(await page.locator('#playtest-review-status').innerText(),/Record verified/);
  const afterReview=await download(page,'#export-button',episode.id+'-after-record-review.json');
  assert.deepEqual(JSON.parse(afterReview.data),exported);
  record(episode.id+' record reopened without changing authored episode');
  if(i===2){
   await player.evaluate(()=>window.scrollTo(0,0));
   await player.screenshot({path:path.join(out,'coastal-bearing-desktop.png'),fullPage:false});
   await player.setViewportSize({width:390,height:844});
   assert(await player.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await player.screenshot({path:path.join(out,'coastal-bearing-mobile.png'),fullPage:false});
   record('Spanish adaptation fits 390px mobile viewport');
   receipt.playRecordControl=await player.locator('#playtest-download').innerText();
  }
  receipt.cases.push({id:episode.id,mechanicalSuccess:positive,moves,answers,summary,episodeSha256:verified.integrity.episodeSha256,recordSha256:sha(journal.data)});
  await player.close();await page.close();
 }
 for(const [name,preserved] of [['source-vs-literal.json',false],['source-vs-adapted.json',true]]){
  const page=await context.newPage();await page.goto(receiver.url);await page.locator('#case-select option').first().waitFor({state:'attached'});
  const input=path.join(here,'exports/comparisons',name),raw=JSON.parse(await fs.readFile(input,'utf8'));
  await page.locator('#comparison-import-file').setInputFiles(input);
  await page.waitForFunction(hash=>document.querySelector('#comparison-digest').textContent.includes(hash),raw.validation.bindingSha256);
  assert.equal(await page.locator('#comparison-status').getAttribute('data-preserved'),String(preserved));
  assert.deepEqual(await page.locator('#mapping-editor select').evaluateAll(es=>es.map(e=>e.value)),expected);
  const copied=await download(page,'#comparison-export-button',name);
  const read=await readComparisonExport(JSON.parse(copied.data));
  assert(read.integrity.verified);assert.deepEqual(JSON.parse(copied.data),raw);assert.deepEqual(read.source,CASES[0]);assert.deepEqual(read.target,CASES[preserved?2:1]);
  record(name+' actual comparison import/export',{mechanicalPreserved:preserved,sha256:sha(copied.data)});
  receipt.comparisons.push({file:name,mechanicalPreserved:preserved,bindingSha256:read.integrity.bindingSha256});
  await page.close();
 }
 assert.deepEqual(receipt.errors,[]);record('zero browser runtime, request or HTTP errors');
 receipt.status='passed';
}catch(error){receipt.status='failed';receipt.failure=error.stack;throw error;}
finally{
 if(context)await context.close();if(browser)await browser.close();if(receiver)await new Promise(resolve=>receiver.server.close(resolve));
 await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(receipt));
}
