import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startReceiver} from '../serve.mjs';
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE,'index.mjs')).href);
const evidence=resolve(process.env.LUDO_EVIDENCE_DIR);await mkdir(evidence,{recursive:true});
const receipt={checks:[],errors:[],passed:false};
const {server,url}=await startReceiver({port:0});let browser;
async function unchecked(p){assert.equal(await p.isDisabled('#export-button'),true);assert.equal(await p.locator('#digest').textContent(),'');}
async function snapshot(p){return p.evaluate(()=>Object.fromEntries(['episode-title-input','episode-story-input','required-action','hint-editor','label-0','label-1'].map(id=>[id,document.getElementById(id).value])));}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
 const cdp=await browser.newBrowserCDPSession();const args=(await cdp.send('Browser.getBrowserCommandLine')).arguments;assert.equal(args.some(a=>['--no-sandbox','--disable-setuid-sandbox'].includes(a)),false);receipt.sandboxArguments=args;
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}});context.setDefaultTimeout(15000);
 context.on('page',p=>p.on('pageerror',e=>receipt.errors.push(String(e))));
 const creator=await context.newPage();await creator.goto(new URL('/web/create.html',url).href);
 await creator.fill('#new-episode-title','Original garden');await creator.fill('#new-episode-story','Arrange the garden.');await creator.fill('#new-episode-labels','Apple\nSun');await creator.fill('#new-episode-action','AS');await creator.click('#create-starting-episode');
 await creator.waitForFunction(()=>!document.querySelector('#open-created-workbench').disabled);
 const popup=context.waitForEvent('page');await creator.click('#open-created-workbench');const author=await popup;await author.waitForFunction(()=>document.querySelector('#episode-title-input')?.value==='Original garden');
 await author.fill('#episode-title-input','');await author.fill('#episode-story-input','\n My unfinished scene \n');await author.fill('#label-0','');await author.fill('#required-action','');
 await author.locator('details.hint-editing summary').click();await author.fill('#hint-editor','\n First hint \n\n Second hint \n');
 await author.click('#check-button');await author.locator('.result-state.invalid').waitFor();await unchecked(author);const expected=await snapshot(author);
 const download=author.waitForEvent('download');await author.click('#download-draft-button');const file=await download;const filePath=join(evidence,'unfinished-original.json');await file.saveAs(filePath);const bytes=await readFile(filePath);receipt.checks.push('original form → invalid unfinished inputs → actual download');
 await context.close();
 const fresh=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}});fresh.setDefaultTimeout(15000);const p=await fresh.newPage();p.on('pageerror',e=>receipt.errors.push(String(e)));await p.goto(url);await p.locator('#label-0').waitFor();
 await p.locator('#draft-file').setInputFiles({name:'unfinished.json',mimeType:'application/json',buffer:bytes});await p.waitForFunction(()=>document.querySelector('#episode-story-input').value.includes('My unfinished scene'));
 assert.deepEqual(await snapshot(p),expected);await unchecked(p);await p.click('#check-button');await p.locator('.result-state.invalid').waitFor();await unchecked(p);receipt.checks.push('fresh browser storage recovers exact incomplete work without checked export');
 const before=await snapshot(p);await p.locator('#draft-file').setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await p.waitForFunction(()=>document.querySelector('#draft-file').value==='');assert.deepEqual(await snapshot(p),before);await unchecked(p);receipt.checks.push('corrupt import preserves current inputs');
 await p.evaluate(()=>{const real=File.prototype.text;window.originalFileText=real;File.prototype.text=function(){return new Promise((resolve,reject)=>{window.releaseDraftRead=()=>real.call(this).then(resolve,reject);});};});
 await p.locator('#draft-file').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:bytes});await p.waitForFunction(()=>typeof window.releaseDraftRead==='function');await p.fill('#episode-story-input','Newer edit must survive');await p.evaluate(()=>window.releaseDraftRead());await p.waitForFunction(()=>document.querySelector('#draft-file').value==='');assert.equal(await p.inputValue('#episode-story-input'),'Newer edit must survive');receipt.checks.push('delayed import cannot replace newer edit');

 await p.evaluate(()=>{File.prototype.text=window.originalFileText;});
 await p.selectOption('#case-select','es-adapted');await p.selectOption('#case-select','imported');assert.equal(await p.inputValue('#episode-story-input'),'Newer edit must survive');
 const secondDownload=p.waitForEvent('download');await p.click('#download-draft-button');const second=await secondDownload;const secondPath=join(evidence,'second-generation.json');await second.saveAs(secondPath);
 const secondEnvelope=JSON.parse(await readFile(secondPath,'utf8')),firstEnvelope=JSON.parse(bytes.toString());assert.deepEqual(secondEnvelope.sourceEpisode,firstEnvelope.sourceEpisode);assert.equal(secondEnvelope.draft.story,'Newer edit must survive');receipt.checks.push('fixture switch preserves imported draft and original source on second download');
 await p.evaluate(()=>{File.prototype.text=function(){return new Promise((resolve,reject)=>{window.releaseSelectionRead=()=>window.originalFileText.call(this).then(resolve,reject);});};});
 await p.locator('#draft-file').setInputFiles({name:'selection-race.json',mimeType:'application/json',buffer:bytes});await p.waitForFunction(()=>typeof window.releaseSelectionRead==='function');await p.selectOption('#case-select','es-adapted');const fixtureBefore=await snapshot(p);await p.evaluate(()=>window.releaseSelectionRead());await p.waitForFunction(()=>document.querySelector('#draft-file').value==='');assert.deepEqual(await snapshot(p),fixtureBefore);receipt.checks.push('delayed draft import cannot replace newer episode selection');
 await p.evaluate(()=>{File.prototype.text=window.originalFileText;});
 const {createExport}=await import('../lib/export.mjs');const checked=await createExport(firstEnvelope.sourceEpisode);
 for(const draftFirst of [true,false]){
  await p.evaluate(()=>{window.pendingReads=[];File.prototype.text=function(){return new Promise((resolve,reject)=>{window.pendingReads.push(()=>window.originalFileText.call(this).then(resolve,reject));});};});
  const first=draftFirst?'#draft-file':'#import-file',last=draftFirst?'#import-file':'#draft-file';
  const checkedBytes=Buffer.from(JSON.stringify(checked));
  await p.locator(first).setInputFiles({name:'older.json',mimeType:'application/json',buffer:draftFirst?bytes:checkedBytes});await p.waitForFunction(()=>window.pendingReads.length===1);
  await p.locator(last).setInputFiles({name:'newer.json',mimeType:'application/json',buffer:draftFirst?checkedBytes:bytes});await p.waitForFunction(()=>window.pendingReads.length===2);
  await p.evaluate(()=>window.pendingReads[1]());await p.waitForFunction(({draftFirst})=>document.querySelector('#episode-title-input').value===(draftFirst?'Original garden':''),{draftFirst});const winning=await snapshot(p);
  await p.evaluate(()=>window.pendingReads[0]());await p.waitForFunction(()=>document.querySelector('#draft-file').value===''&&document.querySelector('#import-file').value==='');assert.deepEqual(await snapshot(p),winning);
  await p.evaluate(()=>{File.prototype.text=window.originalFileText;});
 }
 receipt.checks.push('later checked/draft file selection wins in both completion orders');
 await p.fill('#episode-story-input','Temporary edit before same-file retry');await p.locator('#draft-file').setInputFiles({name:'newer.json',mimeType:'application/json',buffer:bytes});await p.waitForFunction(()=>document.querySelector('#episode-story-input').value.includes('My unfinished scene'));assert.deepEqual(await snapshot(p),expected);receipt.checks.push('same draft file can be selected again after competing imports');
 await p.selectOption('#ui-language','es');assert.match(await p.locator('#download-draft-button').innerText(),/borrador/i);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.locator('#download-draft-button').focus();const keyboardDownload=p.waitForEvent('download');await p.keyboard.press('Enter');await (await keyboardDownload).saveAs(join(evidence,'keyboard-draft.json'));
 await p.screenshot({path:join(evidence,'unfinished-draft-es-mobile.png'),fullPage:true});receipt.checks.push('Spanish narrow layout and keyboard download');assert.deepEqual(receipt.errors,[]);receipt.passed=true;await fresh.close();
}catch(e){receipt.failure=String(e.stack);process.exitCode=1;}finally{await browser?.close();await new Promise(r=>server.close(r));await writeFile(join(evidence,'independent-draft-receipt.json'),JSON.stringify(receipt,null,2));}
console.log(JSON.stringify(receipt));
