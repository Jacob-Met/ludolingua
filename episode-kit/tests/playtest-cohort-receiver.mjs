import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startReceiver } from '../serve.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';

if(!process.env.PLAYWRIGHT_PACKAGE||!process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const evidenceDir=resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir,{recursive:true});
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE,'index.mjs')).href);
const {server,url}=await startReceiver();
const root=fileURLToPath(new URL('../',import.meta.url));
let browser,player;
const receipt={schema:'ludolingua.playtest-cohort-receiving.v1',startedAt:new Date().toISOString(),
  checks:[],errors:[],failedRequests:[],httpErrors:[],inputs:[],passed:false};
const check=name=>receipt.checks.push(name);
function observe(page) {
  page.on('pageerror',error=>receipt.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')receipt.errors.push(message.text());});
  page.on('requestfailed',request=>receipt.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)receipt.httpErrors.push({url:response.url(),status:response.status()});});
}
async function launch(author) {
  const pending=author.waitForEvent('popup');
  await author.click('#launch-playtest');
  const page=await pending;observe(page);
  await page.locator('#playtest-status[data-state="ready"]').waitFor();
  return page;
}
async function download(page,name) {
  const pending=page.waitForEvent('download');
  await page.click('#playtest-download');
  const downloaded=await pending,path=resolve(evidenceDir,name);
  await downloaded.saveAs(path);
  assert.equal(await downloaded.failure(),null);
  const bytes=await readFile(path);
  receipt.inputs.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  return {path,bytes,record:await readPlaytestRecord(bytes.toString('utf8'))};
}
function cohort(paths,expectedStatus) {
  const child=spawnSync(process.execPath,['cli.mjs','playtest-cohort',...paths],{
    cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2_000_000
  });
  assert.equal(child.error,undefined);assert.equal(child.signal,null);
  assert.equal(child.status,expectedStatus);assert.equal(child.stderr,'');
  return JSON.parse(child.stdout);
}
try {
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',
    chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
  const cdp=await browser.newBrowserCDPSession(),command=await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(arg=>arg==='--no-sandbox'||arg==='--disable-setuid-sandbox'),false);
  const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
  const author=await context.newPage();
  await author.goto('chrome://sandbox');receipt.sandbox=await author.locator('body').innerText();
  assert.match(receipt.sandbox,/Seccomp-BPF sandbox\s+Yes/i);
  observe(author);await author.goto(url);
  await author.locator('#case-select option').first().waitFor({state:'attached'});
  await author.selectOption('#case-select','en-original');
  player=await launch(author);
  const empty=await download(player,'cohort-session-a-empty.json');
  assert.equal(empty.record.events.length,0);
  await player.fill('#playtest-answer','OPEN');await player.locator('#playtest-answer').press('Enter');
  const partial=await download(player,'cohort-session-a-partial.json');
  assert.equal(partial.record.events.length,1);
  assert.equal(partial.record.validation.result.summary.successfulAttempts,0);
  for(let index=0;index<3;index++) await player.locator('#playtest-cards li[data-card-id="star"] button[data-direction="down"]').click();
  assert.deepEqual(await player.locator('#playtest-cards li').evaluateAll(rows=>rows.map(row=>row.dataset.cardId)),['key','bell','moon','star']);
  await player.fill('#playtest-answer',' open ');await player.locator('#playtest-answer').press('Enter');
  const complete=await download(player,'cohort-session-a-complete.json');
  assert.equal(complete.record.sessionId,empty.record.sessionId);
  assert.equal(partial.record.sessionId,empty.record.sessionId);
  assert.deepEqual(complete.record.events.slice(0,partial.record.events.length),partial.record.events);
  assert.equal(complete.record.validation.result.summary.attempts,2);
  assert.equal(complete.record.validation.result.summary.successfulAttempts,1);
  check('Actual player downloads empty, failed-attempt and successful longer snapshots of one fixed episode session');

  await player.selectOption('#playtest-ui-language','es');
  assert.equal(await player.locator('html').getAttribute('lang'),'es');
  assert.equal(await player.locator('#playtest-attempt').innerText(),'Probar acción');
  const duplicate=await download(player,'cohort-session-a-spanish-ui-duplicate.json');
  assert.deepEqual(duplicate.bytes,complete.bytes,'UI-only language change must preserve the exact downloaded journal');
  await player.screenshot({path:resolve(evidenceDir,'cohort-player-spanish-controls.png'),fullPage:true});
  check('Spanish player controls retain identical English episode and journal bytes, producing a true repeated download');

  const second=await launch(author);
  await second.fill('#playtest-answer','WRONG');await second.locator('#playtest-answer').press('Enter');
  const other=await download(second,'cohort-session-b-failed.json');
  assert.notEqual(other.record.sessionId,complete.record.sessionId);
  assert.equal(other.record.integrity.episodeSha256,complete.record.integrity.episodeSha256);
  assert.equal(other.record.validation.result.summary.successfulAttempts,0);
  const records=[empty,partial,complete,duplicate,other],paths=records.map(record=>record.path);
  const result=cohort(paths,0);
  assert.equal(result.integrity.allInputRecordsRecomputed,true);
  assert.deepEqual(result.inputs,{verifiedFiles:5,uniqueSessions:2,duplicateFiles:1,supersededSnapshots:2});
  assert.equal(result.episodes.length,1);
  assert.equal(result.episodes[0].episode.sha256,complete.record.integrity.episodeSha256);
  assert.deepEqual(result.episodes[0].recorded,{sessions:2,sessionsWithSuccess:1,sessionsWithHints:0,
    sessionsWithReveal:0,attempts:3,successfulAttempts:1,moves:3,hintsShown:0,resets:0});
  assert.deepEqual(cohort([...paths].reverse(),0),result);
  receipt.cohort=result;
  await writeFile(resolve(evidenceDir,'cohort-from-browser-downloads.json'),JSON.stringify(result,null,2)+'\n');
  check('Maintained CLI receives actual browser files with exact literal totals, deduplication and order-independent supersession');

  const corrupted=JSON.parse(other.bytes.toString('utf8'));
  corrupted.validation.result.summary.successfulAttempts=1;
  const corruptPath=resolve(evidenceDir,'cohort-session-b-corrupted.json');
  await writeFile(corruptPath,JSON.stringify(corrupted));
  const rejected=cohort([...paths,corruptPath],1);
  assert.equal(rejected.ok,false);assert.equal(typeof rejected.error,'string');
  assert.equal(Object.hasOwn(rejected,'episodes'),false);assert.equal(Object.hasOwn(rejected,'integrity'),false);
  receipt.negativeControl=rejected;
  for(const record of records) assert.deepEqual(await readFile(record.path),record.bytes);
  check('A corrupted downloaded result fails closed without a partial report; all original downloaded bytes remain unchanged');
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.failedRequests,[]);assert.deepEqual(receipt.httpErrors,[]);
  receipt.passed=true;
} catch(error) {
  receipt.failure={message:error.message,stack:error.stack};process.exitCode=1;
  if(player) await player.screenshot({path:resolve(evidenceDir,'cohort-receiver-failure.png'),fullPage:true}).catch(()=>{});
} finally {
  receipt.finishedAt=new Date().toISOString();
  if(browser) await browser.close();
  await new Promise(done=>server.close(done));
  await writeFile(resolve(evidenceDir,'cohort-browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
