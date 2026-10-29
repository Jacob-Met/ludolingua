import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startReceiver} from '../serve.mjs';
import {readExport} from '../lib/export.mjs';
import {readComparisonExport} from '../lib/comparison-export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const evidenceDir = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidenceDir, {recursive:true});
const {chromium} = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE,'index.mjs')).href);
const {server,url} = await startReceiver();
let browser,page;
const receipt = {schema:'ludolingua.action-authoring-receiving.v1',startedAt:new Date().toISOString(),checks:[],errors:[],failedRequests:[],passed:false};
const checked = name => receipt.checks.push(name);
const revision = async () => Number((await page.locator('#revision').innerText()).match(/\d+/)[0]);
async function check(outcome) {
  await page.click('#check-button');
  await page.locator('.result-state.'+outcome).waitFor();
  if (outcome !== 'invalid') await page.locator('#digest').filter({hasText:'SHA-256'}).waitFor();
}
async function compare(preserved) {
  await page.click('#compare-button');
  await page.locator('#comparison-status[data-preserved="'+preserved+'"]').waitFor();
  await page.waitForFunction(() => !document.getElementById('comparison-export-button').disabled);
}
async function arrangePlay() {
  for (let i=0;i<3;i++) await page.getByRole('button',{name:'Move Yew down',exact:true}).click();
  assert.deepEqual(await page.locator('.keeper-label').allTextContents(),['Pine','Lily','Aspen','Yew']);
}
async function attempt(answer, success) {
  await page.fill('#answer',answer);
  await page.locator('#answer').press('Enter');
  const feedback = await page.locator('#player-feedback').innerText();
  assert.equal(feedback.includes('The action works'),success,feedback);
}
async function invalidated() {
  assert.equal(await page.locator('#export-button').isDisabled(),true);
  assert.equal(await page.locator('#digest').innerText(),'');
  assert.equal(await page.locator('#comparison-export-button').isDisabled(),true);
  assert.equal(await page.locator('#comparison-digest').innerText(),'');
  assert.equal(await page.locator('#comparison-status').getAttribute('data-preserved'),'unchecked');
  assert.equal(await page.locator('.result-state.verified').count(),0);
}
async function download(button,name) {
  const pending = page.waitForEvent('download');
  await page.click(button);
  const item = await pending,path = resolve(evidenceDir,name);
  await item.saveAs(path);
  return path;
}
async function holdDigests() {
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.actionDigestGate = {original,queue:[]};
    crypto.subtle.digest = (...args) => new Promise((resolve,reject) => window.actionDigestGate.queue.push({args,resolve,reject}));
  });
}
async function releaseDigests() {
  await page.evaluate(async () => {
    const gate=window.actionDigestGate;
    crypto.subtle.digest=gate.original;
    await Promise.all(gate.queue.map(async item => {
      try {item.resolve(await gate.original(...item.args));} catch(error) {item.reject(error);}
    }));
    delete window.actionDigestGate;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
try {
  browser = await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
  receipt.browserVersion = browser.version();
  const context = await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
  page = await context.newPage();
  const cdp = await browser.newBrowserCDPSession(),flags=(await cdp.send('Browser.getBrowserCommandLine')).arguments;
  assert.equal(flags.some(x => x==='--no-sandbox'||x==='--disable-setuid-sandbox'),false);
  await page.goto('chrome://sandbox');
  receipt.sandbox = await page.locator('body').innerText();
  assert.match(receipt.sandbox,/Seccomp-BPF sandbox\s+Yes/i);
  receipt.automationFlag = flags.includes('--enable-automation');
  page.on('pageerror',e => receipt.errors.push(String(e)));
  page.on('console',m => {if(m.type()==='error')receipt.errors.push(m.text());});
  page.on('requestfailed',r => receipt.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  await page.goto(url);
  await page.locator('#case-select option').first().waitFor({state:'attached'});
  assert.equal(await page.locator('#required-action').count(),1,'Author needs an explicit Required action control');
  assert.equal(await page.getByLabel('Required action',{exact:true}).inputValue(),'OPEN');
  checked('Explicit labeled author action control initializes from the current episode');

  await check('verified'); await compare('true');
  const oldRevision=await revision(),oldDigest=await page.locator('#digest').innerText();
  const baseline=await download('#export-button','action-original.json');
  for (const [i,label] of ['Pine','Lily','Aspen','Yew'].entries()) await page.fill('#label-'+i,label);
  await check('action-mismatch'); await compare('false');
  await page.click('#player-tab'); await arrangePlay();
  await attempt('PLAY',false); await attempt('OPEN',false);
  await page.click('#author-tab'); const beforeAction=await revision();
  await page.fill('#required-action','PLAY');
  assert.equal(await revision(),beforeAction+1); assert.ok(await revision()>oldRevision);
  await invalidated();
  assert.match(await page.locator('#hints-review-note').innerText(),/may make the existing hints misleading/);
  await page.click('#player-tab');
  assert.equal(await page.locator('#answer').inputValue(),'');
  assert.equal(await page.locator('#player-feedback').innerText(),'');
  assert.equal(await page.locator('#required-action').isVisible(),false);
  assert.equal(await page.getByRole('textbox',{name:'Required action',exact:true}).count(),0);
  assert.equal(await page.locator('#reveal').isVisible(),false);
  assert.doesNotMatch(await page.locator('body').innerText(),/\bPLAY\b/);
  assert.equal(await page.locator('#answer').getAttribute('placeholder'),null);
  await arrangePlay(); await attempt('OPEN',false); await attempt('play',true);
  await page.click('#author-tab'); await check('verified'); await compare('true');
  assert.notEqual(await page.locator('#digest').innerText(),oldDigest);
  checked('Coordinated labels require an explicit action edit; stale evidence and player state clear, all three success gates remain enforced');

  const episodePath=await download('#export-button','action-play.json');
  const comparisonPath=await download('#comparison-export-button','action-comparison-play.json');
  const received=await readExport(await readFile(episodePath,'utf8'));
  const pair=await readComparisonExport(await readFile(comparisonPath,'utf8'));
  assert.equal(received.episode.action.expected,'PLAY'); assert.equal(received.validation.result.mechanicalSuccess,true);
  assert.equal(pair.target.action.expected,'PLAY'); assert.equal(pair.source.action.expected,'OPEN');
  assert.equal(pair.validation.result.sameOrderSet,true); assert.equal(pair.validation.result.mechanicalPreserved,true);
  assert.equal((await readExport(await readFile(baseline,'utf8'))).episode.action.expected,'OPEN');
  receipt.episodeSha256=received.integrity.episodeSha256; receipt.bindingSha256=pair.integrity.bindingSha256;
  await page.selectOption('#case-select','es-adapted'); assert.equal(await page.locator('#required-action').inputValue(),'ABRE');
  await page.setInputFiles('#import-file',episodePath);
  await page.locator('#notice').filter({hasText:'Source digest and mechanical result verified'}).waitFor();
  assert.equal(await page.locator('#required-action').inputValue(),'PLAY');
  await page.selectOption('#case-select','en-original'); await page.setInputFiles('#comparison-import-file',comparisonPath);
  await page.locator('#notice').filter({hasText:'Reopened both revisions'}).waitFor();
  assert.equal(await page.locator('#required-action').inputValue(),'PLAY');
  assert.match(await page.locator('#source-summary').innerText(),/Required action: OPEN/);
  checked('Actual episode and comparison downloads bind the authored action; switching and both receiving paths restore it without changing the source');

  const localeRevision=await revision(),localeEpisode=received.episode;
  await page.locator('#required-action').focus();
  await page.locator('#required-action').evaluate(input=>input.setSelectionRange(1,3));
  await page.evaluate(()=>{const selector=document.getElementById('ui-language');selector.value='es';selector.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.getByLabel('Acción requerida',{exact:true}).inputValue(),'PLAY');
  assert.match(await page.locator('#required-action-help').innerText(),/iniciales ordenadas/);
  assert.equal(await page.locator('#required-action').getAttribute('lang'),'en');
  assert.deepEqual(await page.locator('#required-action').evaluate(input=>({focused:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd})),{focused:true,start:1,end:3});
  assert.equal(await revision(),localeRevision);
  assert.equal(await page.locator('#comparison-export-button').isDisabled(),false);
  const spanishPairPath=await download('#comparison-export-button','action-spanish-interface.json');
  assert.deepEqual((await readComparisonExport(await readFile(spanishPairPath,'utf8'))).target,localeEpisode);
  await page.selectOption('#ui-language','en');
  assert.equal(await page.getByLabel('Required action',{exact:true}).inputValue(),'PLAY');
  await page.fill('#required-action','   ');const blankRevision=await revision();
  await page.selectOption('#ui-language','es');
  assert.equal(await page.locator('#required-action').inputValue(),'   ');
  assert.equal(await revision(),blankRevision); await invalidated();
  await page.selectOption('#ui-language','en');
  checked('English/Spanish controls preserve authored action, blank edits, focus/caret, revision and comparison export bytes');


  await page.fill('#required-action','turn the silver key');
  await check('action-mismatch');
  await page.click('#player-tab'); await arrangePlay();
  await attempt('PLAY',false); await attempt('turn the silver key',false);
  assert.doesNotMatch(await page.locator('body').innerText(),/turn the silver key/);
  await page.click('#author-tab');
  for (const value of ['', '   ']) {
    await page.fill('#required-action',value); await check('invalid'); await invalidated();
    assert.equal(await page.locator('#required-action').inputValue(),value);
  }
  await page.fill('#required-action',' play '); await check('verified'); await compare('true');
  const normalizedPath=await download('#export-button','action-normalized.json');
  assert.equal((await readExport(await readFile(normalizedPath,'utf8'))).episode.action.expected,' play ');
  checked('Action-only mismatch cannot bypass extraction; blank actions stay invalid and exact typed case/spacing uses existing normalization');

  await page.fill('#required-action','');
  await page.locator('#required-action').focus();
  for (const [i,letter] of [...'PLAY'].entries()) {
    await page.keyboard.type(letter);
    assert.deepEqual(await page.locator('#required-action').evaluate(input => ({focused:document.activeElement===input,value:input.value,caret:input.selectionStart})),{focused:true,value:'PLAY'.slice(0,i+1),caret:i+1});
  }
  await check('verified'); await compare('true');
  for (const operation of ['check','comparison','export']) {
    let downloads=0; const onDownload=()=>downloads++; page.on('download',onDownload);
    await holdDigests();
    await page.click(operation==='check'?'#check-button':operation==='comparison'?'#compare-button':'#export-button');
    await page.waitForFunction(()=>window.actionDigestGate.queue.length>0);
    await page.fill('#required-action','CLOSE');
    await releaseDigests();
    await invalidated();
    assert.equal(downloads,0,'A stale export must not download');
    page.off('download',onDownload);
    await page.fill('#required-action','PLAY'); await check('verified'); await compare('true');
  }
  checked('Typing retains focus/caret and action edits defeat stale check, comparison and export digest completions');

  await page.evaluate(() => {
    const original=File.prototype.text;
    File.prototype.text=function(){const file=this;return new Promise(resolve => {window.releaseActionImport=()=>{File.prototype.text=original;original.call(file).then(resolve);};});};
  });
  await page.setInputFiles('#comparison-import-file',comparisonPath);
  await page.waitForFunction(()=>typeof window.releaseActionImport==='function');
  await page.fill('#required-action','CLOSE');
  await page.evaluate(()=>{window.releaseActionImport();delete window.releaseActionImport;});
  await page.locator('#notice.error').filter({hasText:'changed while this file was being verified'}).waitFor();
  assert.equal(await page.locator('#required-action').inputValue(),'CLOSE'); await invalidated();
  checked('Pending comparison import cannot overwrite an intervening required-action edit');

  await page.fill('#required-action','PLAY'); await check('verified'); await compare('true');
  await page.locator('.workbench-grid').screenshot({path:resolve(evidenceDir,'action-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await page.locator('#author .editor').screenshot({path:resolve(evidenceDir,'action-narrow.png')});
  await page.click('#player-tab');
  assert.equal(await page.locator('#required-action').isVisible(),false);
  assert.doesNotMatch(await page.locator('body').innerText(),/\bPLAY\b/);
  await page.screenshot({path:resolve(evidenceDir,'action-player-narrow.png'),fullPage:true});
  checked('Action authoring and concealed player view fit the 390px viewport');
  assert.deepEqual(receipt.errors,[]); assert.deepEqual(receipt.failedRequests,[]);
  receipt.passed=true;
} catch(error) {
  receipt.failure={message:error.message,stack:error.stack};
  if(page) await page.screenshot({path:resolve(evidenceDir,'action-failure.png'),fullPage:true}).catch(()=>{});
  process.exitCode=1;
} finally {
  receipt.finishedAt=new Date().toISOString();
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
  await writeFile(resolve(evidenceDir,'action-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}
