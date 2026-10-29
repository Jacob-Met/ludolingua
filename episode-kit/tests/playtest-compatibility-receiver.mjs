import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startReceiver} from '../serve.mjs';
import {createPlaytestRecord} from '../lib/playtest-export.mjs';
if(!process.env.PLAYWRIGHT_PACKAGE||!process.env.LUDO_EVIDENCE_DIR)throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const evidenceDir=resolve(process.env.LUDO_EVIDENCE_DIR);await mkdir(evidenceDir,{recursive:true});
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE,'index.mjs')).href);
const {server,url}=await startReceiver();
const receipt={schema:'ludolingua.playtest-compatibility-receiving.v1',startedAt:new Date().toISOString(),checks:[],errors:[],failedRequests:[],passed:false};
let browser,page;
const check=name=>receipt.checks.push(name);
const fixturePath=name=>resolve('tests/fixtures/playtest-v0.1-'+name+'.json');
async function importRecord(path){const expected=JSON.parse(await readFile(path,'utf8'));await page.setInputFiles('#playtest-record-file',path);await page.locator('#playtest-review').filter({hasText:expected.sessionId}).waitFor();await page.locator('#playtest-review-status').filter({hasText:'Record verified'}).waitFor();}
async function authorPreserved(){assert.equal(await page.locator('#label-0').inputValue(),'Umbrella');}
try {
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
  receipt.browserVersion=browser.version();
  const cdp=await browser.newBrowserCDPSession(),cmd=await cdp.send('Browser.getBrowserCommandLine');
  assert.equal(cmd.arguments.some(x=>x==='--no-sandbox'||x==='--disable-setuid-sandbox'),false);
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  page=await context.newPage();await page.goto('chrome://sandbox');receipt.sandbox=await page.locator('body').innerText();
  assert.match(receipt.sandbox,/PID namespaces\s+Yes/);assert.match(receipt.sandbox,/Network namespaces\s+Yes/);assert.match(receipt.sandbox,/Seccomp-BPF sandbox\s+Yes/);
  page.on('pageerror',e=>receipt.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')receipt.errors.push(m.text());});
  page.on('requestfailed',r=>receipt.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  await page.goto(url);await page.locator('#case-select option').first().waitFor({state:'attached'});
  await page.selectOption('#ui-language','en');await page.selectOption('#case-select','en-original');await page.fill('#label-0','Umbrella');
  await importRecord(fixturePath('attempt'));await authorPreserved();
  assert.match(await page.locator('#playtest-review').innerText(),/legacy-attempt-v0.1.0/);
  assert.deepEqual(await page.locator('#playtest-review .metric strong').allTextContents(),['1','0','0','0','No','—']);
  await page.locator('#playtest-review details summary').click();
  assert.equal(await page.locator('#playtest-review li').count(),4);
  assert.match(await page.locator('#playtest-review li').last().innerText(),/Try action: CLOSE/);
  await page.locator('#playtest-review').screenshot({path:resolve(evidenceDir,'legacy-failed-attempt-desktop.png')});
  check('Authentic old file reopens through author entry; failed CLOSE and all4events retained while current authored Umbrella remains');
  await importRecord(fixturePath('history'));await authorPreserved();
  assert.deepEqual(await page.locator('#playtest-review .metric strong').allTextContents(),['4','1','1','2','Yes','0.0 s']);
  await page.locator('#playtest-review details summary').click();assert.equal(await page.locator('#playtest-review li').count(),11);
  const historyReview=await page.locator('#playtest-review').innerText();
  assert.match(historyReview,/legacy-history-v0.1.0/);assert.match(historyReview,/Reveal the solution/);assert.match(historyReview,/Reset the order/);
  check('Authentic old multi-attempt history retains recorded success, hint, reveal and resets without claiming final success or unaided play');
  const old=JSON.parse(await readFile(fixturePath('attempt'),'utf8'));
  const current=await createPlaytestRecord(old.episode,'current-compatibility-control',old.events);
  const currentPath=resolve(evidenceDir,'current-record.json');await writeFile(currentPath,JSON.stringify(current));
  await importRecord(currentPath);await authorPreserved();assert.match(await page.locator('#playtest-review').innerText(),/current-compatibility-control/);
  const accepted=await page.locator('#playtest-review').innerText();
  const tampered=structuredClone(current);tampered.validation.result.finalState.lastAttempt.tokenMatches=false;
  const badPath=resolve(evidenceDir,'current-record-tampered.json');await writeFile(badPath,JSON.stringify(tampered));
  await page.setInputFiles('#playtest-record-file',badPath);await page.locator('#playtest-review-status').filter({hasText:'Cannot reopen'}).waitFor();
  assert.equal(await page.locator('#playtest-review').innerText(),accepted);await authorPreserved();
  check('Current record still reopens and wrong supplied tokenMatches is rejected without replacing accepted review or authored episode');
  await importRecord(fixturePath('history'));await page.locator('#playtest-review details summary').click();
  await page.setViewportSize({width:390,height:844});await page.selectOption('#ui-language','es');
  assert.match(await page.locator('#playtest-review').innerText(),/legacy-history-v0.1.0/);
  assert.equal(await page.locator('#playtest-review li').count(),11);assert.equal(await page.locator('#playtest-review details').evaluate(e=>e.open),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);await authorPreserved();
  await page.locator('#playtest-review').screenshot({path:resolve(evidenceDir,'legacy-history-spanish-narrow.png')});
  await page.selectOption('#ui-language','en');assert.equal(await page.locator('#playtest-review').innerText(),historyReview);
  check('Accepted legacy journey remains complete through390px Spanish/English presentation changes');
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.failedRequests,[]);
  receipt.passed=true;
} catch(error) {
  receipt.error=String(error.stack||error);process.exitCode=1;
  if(page&&!page.isClosed())try{await page.screenshot({path:resolve(evidenceDir,'failure.png'),fullPage:true});}catch{}
} finally {
  if(browser)await browser.close();await new Promise(r=>server.close(r));
  receipt.finishedAt=new Date().toISOString();await writeFile(resolve(evidenceDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
