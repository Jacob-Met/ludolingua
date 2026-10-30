import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startReceiver} from '../serve.mjs';
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE,'index.mjs')).href);
const dir=resolve(process.env.LUDO_EVIDENCE_DIR);await mkdir(dir,{recursive:true});
const receipt={checks:[],errors:[],passed:false};const {server,url}=await startReceiver({port:0});let browser;
const upload=(p,id,bytes)=>p.locator(id).setInputFiles({name:'work.json',mimeType:'application/json',buffer:bytes});
async function download(p,id,name){const event=p.waitForEvent('download');await p.click(id);const file=await event,path=join(dir,name);await file.saveAs(path);return readFile(path);}
async function fork(p){if(!await p.locator('#adaptation-start').getAttribute('open').then(v=>v!==null))await p.locator('#adaptation-start summary').click();await p.click('#start-adaptation');await p.waitForFunction(()=>!document.querySelector('#start-adaptation').disabled);}
async function hold(p){await p.evaluate(()=>{window.digestOriginal=crypto.subtle.digest.bind(crypto.subtle);window.heldDigest=null;crypto.subtle.digest=(...args)=>{crypto.subtle.digest=window.digestOriginal;return new Promise((resolve,reject)=>{window.heldDigest=()=>window.digestOriginal(...args).then(resolve,reject);});};});}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--enable-automation']});
 const cdp=await browser.newBrowserCDPSession();receipt.browserArguments=(await cdp.send('Browser.getBrowserCommandLine')).arguments;assert.equal(receipt.browserArguments.some(x=>['--no-sandbox','--disable-setuid-sandbox'].includes(x)),false);
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}});context.setDefaultTimeout(15000);context.on('page',p=>p.on('pageerror',e=>receipt.errors.push(String(e))));
 const c=await context.newPage();await c.goto(new URL('/web/create.html',url).href);
 for(const [id,text]of [['new-episode-title','My original garden'],['new-episode-story','Arrange the garden.'],['new-episode-labels','Apple\nSun\nTree'],['new-episode-action','AST']])await c.fill('#'+id,text);
 await c.click('#create-starting-episode');await c.waitForFunction(()=>!document.querySelector('#open-created-workbench').disabled);const popup=context.waitForEvent('page');await c.click('#open-created-workbench');const p=await popup;await p.waitForFunction(()=>document.querySelector('#episode-title-input')?.value==='My original garden');
 for(let i=0;i<2;i++){await p.click('#add-clue');const row=p.locator('.clue-row').nth(i);await row.locator('[data-field=left]').selectOption('keeper-'+(i+1));await row.locator('[data-field=right]').selectOption('keeper-'+(i+2));await row.locator('[data-field=kind]').selectOption('before');}
 await fork(p);assert.match(await p.locator('#adaptation-status').innerText(),/copied unchanged/);assert.equal(await p.inputValue('#episode-title-input'),'My original garden');assert.equal(await p.locator('#episode-title-input').getAttribute('lang'),'es');assert.equal(await p.inputValue('#source-select'),'custom-source');assert.equal(await p.isDisabled('#export-button'),true);assert.equal(await p.isDisabled('#comparison-export-button'),true);
 await p.locator('#adaptation-start').screenshot({path:join(dir,'adaptation-start-desktop.png')});
 for(let i=0;i<3;i++)assert.equal(await p.inputValue('#mapping-'+i),'keeper-'+(i+1));
 await p.fill('#episode-title-input','Mi jardín');await p.fill('#episode-story-input','Ordena el jardín.');for(const [i,v]of ['Agua','Sol','Tierra'].entries())await p.fill('#label-'+i,v);await p.fill('#required-action','AST');
 await p.click('#compare-button');await p.waitForFunction(()=>!document.querySelector('#comparison-export-button').disabled);assert.equal(await p.locator('#comparison-status').getAttribute('data-preserved'),'true');
 const pair=await download(p,'#comparison-export-button','garden-comparison.json');receipt.checks.push('custom original → copied Spanish target → authored wording → checked original/target comparison export');
 const fresh=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}});fresh.setDefaultTimeout(15000);const r=await fresh.newPage();r.on('pageerror',e=>receipt.errors.push(String(e)));await r.goto(url);await r.locator('#label-0').waitFor();await upload(r,'#comparison-import-file',pair);await r.waitForFunction(()=>document.querySelector('#episode-title-input').value==='Mi jardín');assert.match(await r.locator('#source-summary').innerText(),/My original garden/);assert.match(await r.locator('#target-summary').innerText(),/Mi jardín/);
 await r.click('#player-tab');for(let i=0;i<2;i++)await r.locator('[data-card-id=keeper-3] [data-direction=down]').click();await r.fill('#answer','AST');await r.locator('#answer-form button').click();assert.match(await r.locator('#player-feedback').innerText(),/The action works/);await r.click('#author-tab');receipt.checks.push('fresh comparison receiving preserves original source and playable edited target');
 await r.fill('#episode-title-input','');const draft=await download(r,'#download-draft-button','unfinished-target.json');const draftObject=JSON.parse(draft);assert.equal(draftObject.sourceEpisode.locale,'es');assert.match(JSON.stringify(draftObject.sourceEpisode.provenance),/My original garden|original-/);await r.selectOption('#case-select','en-original');await upload(r,'#draft-file',draft);await r.waitForFunction(()=>document.querySelector('#episode-title-input').value==='');assert.equal(await r.locator('#episode-title-input').getAttribute('lang'),'es');assert.equal(await r.isDisabled('#export-button'),true);receipt.checks.push('unfinished target draft remains usable with target locale baseline');
 await r.fill('#episode-title-input','Mi jardín');if(!await r.locator('#adaptation-start').getAttribute('open').then(v=>v!==null))await r.locator('#adaptation-start summary').click();await r.selectOption('#adaptation-language','es');await fork(r);assert.match(await r.locator('#adaptation-status').innerText(),/Cannot start/);assert.equal(await r.inputValue('#episode-title-input'),'Mi jardín');
 await r.selectOption('#adaptation-language','en');await fork(r);assert.equal(await r.locator('#episode-title-input').getAttribute('lang'),'en');assert.equal(await r.inputValue('#episode-title-input'),'Mi jardín');receipt.checks.push('same-language refusal preserves work; reverse fork keeps untranslated Spanish wording');
 for(const change of ['edit','source','locale','import']){
  if(!await r.locator('#adaptation-start').getAttribute('open').then(v=>v!==null))await r.locator('#adaptation-start summary').click();await r.selectOption('#adaptation-language','es');await hold(r);await r.click('#start-adaptation');await r.waitForFunction(()=>typeof window.heldDigest==='function');
  if(change==='edit')await r.fill('#episode-story-input','Newer author edit');
  if(change==='source')await r.selectOption('#source-select','en-original');
  if(change==='locale')await r.selectOption('#adaptation-language','en');
  if(change==='import'){await upload(r,'#comparison-import-file',pair);await r.waitForFunction(()=>document.querySelector('#episode-title-input').value==='Mi jardín'&&document.querySelector('#episode-title-input').lang==='es');}
  const before=await r.locator('#episode-title-input').getAttribute('lang');await r.evaluate(()=>window.heldDigest());await r.waitForFunction(()=>!document.querySelector('#start-adaptation').disabled);assert.equal(await r.locator('#episode-title-input').getAttribute('lang'),before);
  if(change==='edit')assert.equal(await r.inputValue('#episode-story-input'),'Newer author edit');
  if(change==='source')assert.equal(await r.inputValue('#source-select'),'en-original');
  if(change==='locale')assert.equal(await r.inputValue('#adaptation-language'),'en');
 }
 receipt.checks.push('pending fork is cancelled by newer field/source/language/import intent');
 await r.selectOption('#ui-language','es');assert.equal(await r.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await r.locator('#adaptation-start').screenshot({path:join(dir,'adaptation-start-es-mobile.png')});await r.screenshot({path:join(dir,'adaptation-es-mobile.png'),fullPage:true});assert.deepEqual(receipt.errors,[]);receipt.passed=true;await fresh.close();await context.close();
}catch(e){receipt.failure=String(e.stack);process.exitCode=1;}finally{await browser?.close();await new Promise(r=>server.close(r));await writeFile(join(dir,'independent-adaptation-receipt.json'),JSON.stringify(receipt,null,2));}console.log(JSON.stringify(receipt));
