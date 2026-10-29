import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalJSON, readExport } from '../../../episode-kit/lib/export.mjs';
import { readComparisonExport } from '../../../episode-kit/lib/comparison-export.mjs';
import { readPlaytestRecord } from '../../../episode-kit/lib/playtest-export.mjs';
import { replayPlaytest } from '../../../episode-kit/lib/playtest.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const caseRoot=fileURLToPath(new URL('../',import.meta.url));
const output=process.argv[2]&&resolve(process.argv[2]);
assert(output&&process.argv.length===3,'Usage: node scripts/receive-browser.mjs NEW_EVIDENCE_DIRECTORY');
assert(relative(root,output).startsWith('..'),'Keep receiving output outside the source bundle');
assert(process.env.PLAYWRIGHT_MODULE,'Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
await mkdir(output);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(predicate,label) { const deadline=performance.now()+10000; while(performance.now()<deadline) {if(await predicate()) return; await delay(25);} throw new Error('Timed out: '+label); }
const checks=[],browserErrors=[],unexpectedRequests=[];
const record=(name,details={})=>{checks.push({name,...details});};
const server=spawn(process.execPath,[resolve(root,'episode-kit/serve.mjs')],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
let serverText='',serverError='',browser,url;
server.stdout.on('data',b=>serverText+=b);server.stderr.on('data',b=>serverError+=b);
const exit=new Promise(r=>server.once('exit',(code,signal)=>r({code,signal})));
const episodes={},exports={};
for(const name of ['en-source','es-literal','es-repaired','es-meaning-control']){
 exports[name]=JSON.parse(await readFile(resolve(caseRoot,'exports/'+name+'.export.json'),'utf8'));
 episodes[name]=(await readExport(exports[name])).episode;
}
async function download(page,selector,name) {
 const waiting=page.waitForEvent('download'); await page.locator(selector).click();
 const item=await waiting,path=resolve(output,name);await item.saveAs(path);
 return JSON.parse(await readFile(path,'utf8'));
}
function observe(context) {
 context.on('page',page=>{
  page.on('pageerror',e=>browserErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')browserErrors.push(m.text());});
  page.on('requestfailed',r=>browserErrors.push(r.url()+': '+r.failure()?.errorText));
  page.on('request',r=>{if(!r.url().startsWith(url+'/')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))unexpectedRequests.push(r.url());});
 });
}
const desired=['bread','raisin','ivy','daffodil','topaz','emerald'];
const order=page=>page.locator('#playtest-cards > li').evaluateAll(rows=>rows.map(r=>r.dataset.cardId));
async function arrange(page) {
 for(let i=0;i<desired.length;i++) {
  let current=await order(page);
  while(current.indexOf(desired[i])>i) {
   const prior=current.indexOf(desired[i]);
   await page.locator('#playtest-cards > li[data-card-id="'+desired[i]+'"] button[data-direction="up"]').click();
   await wait(async()=> (await order(page)).indexOf(desired[i])===prior-1,'card move');
   current=await order(page);
  }
 }
 assert.deepEqual(await order(page),desired);
}
try {
 await wait(()=>/http:\/\/127\.0\.0\.1:\d+/.test(serverText),'maintained server startup');
 url=serverText.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
 browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'/usr/bin/google-chrome',headless:true,chromiumSandbox:true});
 const cdp=await browser.newBrowserCDPSession();const commandLine=(await cdp.send('Browser.getBrowserCommandLine')).arguments;
 assert(!commandLine.includes('--no-sandbox'));record('maintained launch and sandbox',{url,browserVersion:browser.version(),sandbox:true});
 const playerReceipts=[];
 for(const name of ['en-source','es-literal','es-repaired','es-meaning-control']) {
  const narrow=name==='es-repaired',spanish=name!=='en-source';
  const context=await browser.newContext({viewport:narrow?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:1,locale:'en-US'});
  observe(context);const page=await context.newPage();page.setDefaultTimeout(10000);
  await page.goto(url+'/web/playtest.html');
  if(spanish)await page.locator('#playtest-ui-language').selectOption('es');
  await page.locator('#playtest-file').setInputFiles(resolve(caseRoot,'exports/'+name+'.export.json'));
  await page.locator('#playtest-session').waitFor({state:'visible'});
  assert.equal(await page.locator('#playtest-title').innerText(),episodes[name].title);
  assert.deepEqual(await page.locator('#playtest-cards .keeper-label').allTextContents(),(await order(page)).map(id=>episodes[name].cards.find(c=>c.id===id).label));
  assert.equal(await page.locator('#playtest-clues li').count(),5);
  const startingText=await page.locator('body').innerText();
  assert(!/\b(BRIDGE|PUENTE)\b/.test(startingText),'No answer exposed on initial player');
  assert.notDeepEqual(await order(page),desired);
  await page.locator('#playtest-answer').fill(episodes[name].action.expected);
  await page.locator('#playtest-attempt').click();
  await wait(async()=>/not yet|todavía/.test(await page.locator('#playtest-feedback').innerText()),'wrong-order feedback');
  if(narrow) {
   const before=(await order(page)).indexOf('bread');
   const button=page.locator('#playtest-cards > li[data-card-id="bread"] button[data-direction="up"]');
   await button.focus();await page.keyboard.press('Enter');
   await wait(async()=>(await order(page)).indexOf('bread')===before-1,'keyboard card move');
   assert.equal(await page.evaluate(()=>document.activeElement.closest('li')?.dataset.cardId),'bread');
   for(let i=0;i<3;i++)await page.locator('#playtest-hint').click();
   assert.equal(await page.locator('#playtest-hints p').count(),3);
   assert((await page.locator('#playtest-hints').innerText()).includes('varias palabras'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No narrow horizontal page overflow');
   record('Spanish narrow keyboard move, focus and all hints',{viewport:390});
  }
  await arrange(page);
  await page.locator('#playtest-answer').fill(episodes[name].action.expected);await page.locator('#playtest-attempt').click();
  if(name==='es-literal') {
   await wait(async()=>/no coincide/.test(await page.locator('#playtest-feedback').innerText()),'literal mismatch');
   await page.locator('#playtest-answer').fill('PPHNTE');await page.locator('#playtest-attempt').click();
   assert((await page.locator('#playtest-feedback').innerText()).includes('no coincide'));
  } else {
   await wait(async()=>/action works|acción funciona/.test(await page.locator('#playtest-feedback').innerText()),'successful attempt');
  }
  await page.screenshot({path:resolve(output,name+(narrow?'-mobile':'-desktop')+'.png'),fullPage:true});
  const raw=await download(page,'#playtest-download',name+'.play-record.json');
  const received=await readPlaytestRecord(raw),replay=replayPlaytest(received.episode,received.events);
  assert.equal(canonicalJSON(received.episode),canonicalJSON(episodes[name]));assert.equal(replay.valid,true);
  assert.equal(replay.summary.successfulAttempts,name==='es-literal'?0:1);assert.equal(replay.finalState.lastAttempt.success,name!=='es-literal');
  assert.deepEqual(replay.finalState.order,desired);
  playerReceipts.push({name,summary:replay.summary,finalAttempt:replay.finalState.lastAttempt,events:received.events.length});
  record(name+' actual player and downloaded record',{success:replay.finalState.lastAttempt.success,token:replay.finalState.lastAttempt.token});
  if(narrow) {
   const continued=await context.newPage();await continued.goto(url+'/web/playtest.html');
   await continued.locator('#playtest-ui-language').selectOption('es');
   await continued.locator('#playtest-resume-file').setInputFiles(resolve(output,name+'.play-record.json'));
   await continued.locator('#playtest-session').waitFor({state:'visible'});
   assert.deepEqual(await order(continued),desired);assert.equal(await continued.locator('#playtest-hints p').count(),3);
   const again=await download(continued,'#playtest-download','es-repaired.continued-record.json');
   assert.equal(again.sessionId,raw.sessionId);assert.equal(canonicalJSON(again.events),canonicalJSON(raw.events));
   record('Spanish saved record continues with exact episode and event prefix');
  }
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});observe(context);
 const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(url+'/web/index.html');
 async function reopen(name) {
  await page.locator('#import-file').setInputFiles(resolve(caseRoot,'exports/'+name+'.export.json'));
  await wait(async()=>(await page.locator('#digest').innerText()).includes(exports[name].validation.episodeSha256),'author import '+name);
  assert.equal(await page.locator('#required-action').inputValue(),episodes[name].action.expected);
 }
 await reopen('en-source');await page.locator('#use-current-as-source').click();
 const comparisonReceipts=[];
 for(const name of ['es-literal','es-repaired','es-meaning-control']) {
  await reopen(name);
  await page.locator('#compare-button').click();
  const expected=name!=='es-literal';
  await wait(async()=>(await page.locator('#comparison-status').getAttribute('data-preserved'))===String(expected),'comparison result');
  await wait(async()=>!(await page.locator('#comparison-export-button').isDisabled()),'checked comparison export');
  const downloaded=await download(page,'#comparison-export-button',name+'.ui-comparison.json');
  const checked=await readComparisonExport(downloaded);
  assert.equal(canonicalJSON(checked.source),canonicalJSON(episodes['en-source']));
  assert.equal(canonicalJSON(checked.target),canonicalJSON(episodes[name]));
  assert.equal(checked.validation.result.mechanicalPreserved,expected);assert.equal(checked.validation.result.sameOrderSet,true);
  comparisonReceipts.push({name,mechanicalPreserved:expected,bindingSha256:checked.integrity.bindingSha256});
  record(name+' workbench comparison and actual download',{mechanicalPreserved:expected});
  if(name==='es-meaning-control') {
   await page.locator('#comparison-result details summary').click();
   assert((await page.locator('#comparison-result').innerText()).includes('Uva fresca'));
   assert((await page.locator('#semantic-changes').textContent()).includes('fresh grape'));
   await page.locator('#comparison-result').screenshot({path:resolve(output,'meaning-control-comparison.png')});
  }
 }
 await reopen('es-repaired');await page.locator('#ui-language').selectOption('es');
 const episodeDownload=await download(page,'#export-button','es-repaired.ui-export.json');
 assert.equal(canonicalJSON(episodeDownload),canonicalJSON(exports['es-repaired']));
 const receiving=await context.newPage();await receiving.goto(url+'/web/index.html');
 await receiving.locator('#comparison-import-file').setInputFiles(resolve(output,'es-meaning-control.ui-comparison.json'));
 await wait(async()=>(await receiving.locator('#comparison-status').getAttribute('data-preserved'))==='true','reopened comparison');
 assert((await receiving.locator('#target-summary').innerText()).includes('Uva fresca'));
 record('Actual episode re-export exact after UI language switch; downloaded comparison reopens');
 await context.close();
 assert.deepEqual(browserErrors,[]);assert.deepEqual(unexpectedRequests,[]);
 const files=[];
 const {readdir}=await import('node:fs/promises');
 for(const name of await readdir(output)) {const b=await readFile(resolve(output,name));files.push({path:name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
 const receipt={schema:'ludolingua.courier-browser-receiving.v1',checks,players:playerReceipts,comparisons:comparisonReceipts,browserErrors,unexpectedRequests,serverCommand:[process.execPath,'episode-kit/serve.mjs'],serverEnvironment:{PORT:'0'},files,limits:['Automated sandboxed Linux Chrome receiving with real UI actions/downloads; narrow desktop viewport, not a physical mobile device.','No human, native-language, comparable difficulty or provider-model benefit claim.']};
 await writeFile(resolve(output,'browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(receipt));
} finally {
 if(browser)await browser.close();
 server.kill('SIGINT');const closed=await Promise.race([exit,delay(5000).then(()=>({timeout:true}))]);
 if(closed.timeout) {server.kill('SIGTERM');throw new Error('Owned receiving server did not close');}
 await writeFile(resolve(output,'server-receipt.json'),JSON.stringify({stdout:serverText,stderr:serverError,exit:closed},null,2)+'\n');
}
