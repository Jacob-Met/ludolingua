import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startReceiver } from '../serve.mjs';
import { EPISODES } from '../fixtures/episodes.mjs';
import { createExport } from '../lib/export.mjs';

if (!process.env.PLAYWRIGHT_PACKAGE || !process.env.LUDO_EVIDENCE_DIR) throw Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE, 'index.mjs')).href);
const evidence = resolve(process.env.LUDO_EVIDENCE_DIR);
await mkdir(evidence, { recursive: true });
const KEY='ludolingua.author-draft:en-original', LOCK='ludolingua-draft-lock:'+KEY;
const receipt={schema:'ludolingua.draft-receiving.v1',startedAt:new Date().toISOString(),checks:[],errors:[],passed:false};
const {server,url}=await startReceiver({port:0});
let browser;
const state=(page,name)=>page.locator('#draft-status[data-state="'+name+'"]').waitFor();
const raw=(page,key=KEY)=>page.evaluate(k=>localStorage.getItem(k),key);
const edit=(page,index,label)=>page.locator('#label-'+index).fill(label);
async function saved(page,key=KEY){await state(page,'saved');return JSON.parse(await raw(page,key));}
async function open(context){const page=await context.newPage();await page.goto(url);await page.locator('#label-0').waitFor();return page;}
async function hold(page){
  await page.evaluate(async name=>{
    let announce;const acquired=new Promise(resolve=>{announce=resolve;});
    window.__draftLockDone=navigator.locks.request(name,async()=>{announce();await new Promise(resolve=>{window.__releaseDraftLock=resolve;});});await acquired;
  },LOCK);
}
async function queued(page,count=1){
  await page.waitForFunction(async({name,count})=>{const q=await navigator.locks.query();return q.held.some(l=>l.name===name)&&q.pending.filter(l=>l.name===name).length>=count;},{name:LOCK,count});
}
async function release(page){await page.evaluate(async()=>{window.__releaseDraftLock();await window.__draftLockDone;});}
async function settle(page){await page.waitForFunction(async name=>{const q=await navigator.locks.query();return !q.held.some(l=>l.name===name)&&!q.pending.some(l=>l.name===name);},LOCK);}
async function group(name,fn,init){
  const context=await browser.newContext({viewport:{width:1280,height:1000},locale:'en-US',acceptDownloads:true});
  context.setDefaultTimeout(15000);
  context.on('page',page=>{
    page.on('pageerror',e=>receipt.errors.push({group:name,kind:'pageerror',message:String(e)}));
    page.on('console',m=>{if(m.type()==='error')receipt.errors.push({group:name,kind:'console',message:m.text()});});
    page.on('requestfailed',r=>receipt.errors.push({group:name,kind:'requestfailed',url:r.url(),message:r.failure()?.errorText}));
    page.on('response',r=>{if(r.status()>=400)receipt.errors.push({group:name,kind:'http',status:r.status(),url:r.url()});});
  });
  try{
    if(init)await context.addInitScript(init);
    await fn(context);
    assert.equal(receipt.errors.filter(e=>e.group===name).length,0,'Browser errors in '+name);
    receipt.checks.push({name,passed:true});
  }catch(error){
    receipt.checks.push({name,passed:false,error:String(error.stack)});
    for(const [index,page]of context.pages().entries())await page.screenshot({path:join(evidence,name+'-'+index+'-failure.png'),fullPage:true}).catch(()=>{});
    throw error;
  }finally{await context.close();}
}
try{
  browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
  const session=await browser.newBrowserCDPSession(),command=await session.send('Browser.getBrowserCommandLine');
  assert.equal(command.arguments.some(a=>['--no-sandbox','--disable-setuid-sandbox'].includes(a)),false);
  await group('sandbox',async context=>{
    const page=await context.newPage();await page.goto('chrome://sandbox');const text=await page.locator('body').innerText();
    receipt.sandbox={flags:command.arguments,status:text};
    assert.match(text,/Layer 1 Sandbox\s+Namespace/i);assert.match(text,/PID namespaces\s+Yes/i);assert.match(text,/Network namespaces\s+Yes/i);assert.match(text,/Seccomp-BPF sandbox\s+Yes/i);
  });
  await group('unfinished-restoration-and-isolation',async context=>{
    const page=await open(context);
    await edit(page,0,'');await saved(page);await edit(page,1,'   ');await saved(page);
    await page.locator('#freeze-labels').check();const stored=await saved(page);
    assert.equal(stored.cards[0].label,'');assert.equal(stored.cards[1].label,'   ');assert.equal(stored.labelsFrozen,true);
    await page.selectOption('#case-select','es-adapted');assert.equal(await page.inputValue('#label-0'),'Agua');
    await edit(page,0,'Agua custom');await saved(page,'ludolingua.author-draft:es-adapted');
    await page.selectOption('#case-select','en-original');
    assert.equal(await page.inputValue('#label-0'),'');assert.equal(await page.inputValue('#label-1'),'   ');assert.equal(await page.isDisabled('#export-button'),true);
    await page.reload();await state(page,'restored');
    assert.equal(await page.inputValue('#label-1'),'   ');assert.equal(await page.isChecked('#freeze-labels'),true);assert.equal(JSON.parse(await raw(page)).revision,stored.revision);
    assert.equal(await page.locator('#digest').textContent(),'');assert.equal(await page.isDisabled('#export-button'),true);assert.equal(await page.isDisabled('#comparison-export-button'),true);
    await page.click('#player-tab');assert.equal(await page.isVisible('.draft-strip'),false);await page.click('#author-tab');
    await page.screenshot({path:join(evidence,'draft-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(evidence,'draft-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
  await group('discard-and-detached-import',async context=>{
    const page=await open(context);await edit(page,0,'Disposable');await saved(page);
    await page.click('#discard-draft');await state(page,'discarded');assert.equal(await raw(page),null);assert.equal(await page.evaluate(()=>document.activeElement.id),'editor-heading');
    await page.reload();await page.locator('#label-0').waitFor();assert.equal(await page.inputValue('#label-0'),'Otter');assert.equal(await raw(page),null);
    await edit(page,0,'Fixture draft');await saved(page);const before=await raw(page);
    const imported=structuredClone(EPISODES.find(e=>e.id==='en-original'));imported.cards[0].label='Orchid imported';imported.revision++;
    const envelope=await createExport(imported);
    await page.locator('#import-file').setInputFiles({name:'same-id.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(envelope))});
    await state(page,'detached');assert.equal(await page.inputValue('#label-0'),'Orchid imported');assert.equal(await page.isDisabled('#export-button'),false);
    await edit(page,0,'Imported local edit');assert.equal(await raw(page),before);assert.equal(await page.isDisabled('#export-button'),true);
    await page.selectOption('#case-select','en-original');assert.equal(await page.inputValue('#label-0'),'Fixture draft');
    await page.selectOption('#case-select','imported');assert.equal(await page.inputValue('#label-0'),'Imported local edit');assert.equal(await page.isDisabled('#export-button'),true);
  });
  for(const mode of ['denied','quota','no-locks']){
    const init={denied:()=>{Storage.prototype.getItem=function(){throw new DOMException('Test denied','SecurityError');};},quota:()=>{Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError');};},'no-locks':()=>{Object.defineProperty(navigator,'locks',{value:undefined});}}[mode];
    await group('memory-'+mode,async context=>{
      const page=await open(context);await edit(page,0,'Memory only');await state(page,'unavailable');
      assert.match(await page.locator('#draft-status').textContent(),/tab only/);
      await page.selectOption('#case-select','es-adapted');await page.selectOption('#case-select','en-original');assert.equal(await page.inputValue('#label-0'),'Memory only');
      await page.reload();await page.locator('#label-0').waitFor();assert.equal(await page.inputValue('#label-0'),'Otter');
    },init);
  }
  for(const kind of ['invalid','incompatible']){
    await group('preserve-'+kind,async context=>{
      const page=await open(context);await edit(page,0,'Seed');const record=await saved(page);
      if(kind==='invalid')record.verification={approved:true};else record.source.sha256='b'.repeat(64);
      const hostile=JSON.stringify(record);await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:KEY,value:hostile});
      await page.reload();await state(page,kind);await edit(page,0,'Explicit replacement');assert.equal(await raw(page),hostile);
      await page.click('#keep-draft');await saved(page);assert.equal(JSON.parse(await raw(page)).cards[0].label,'Explicit replacement');
    });
  }
  await group('real-contended-tabs-and-stale-event',async context=>{
    const a=await open(context),b=await open(context);await hold(a);
    await edit(a,0,'Tab A');await queued(a);
    await b.locator('.clue-row').first().locator('select[data-field=kind]').selectOption('after');await queued(a,2);
    receipt.lockContention=await a.evaluate(()=>navigator.locks.query());await release(a);await settle(a);
    await a.waitForFunction(()=>['saved','conflict'].includes(document.querySelector('#draft-status').dataset.state));
    await b.waitForFunction(()=>['saved','conflict'].includes(document.querySelector('#draft-status').dataset.state));
    const states=await Promise.all([a,b].map(p=>p.locator('#draft-status').getAttribute('data-state')));
    assert.deepEqual([...states].sort(),['conflict','saved']);
    const winner=states[0]==='saved'?a:b,loser=states[0]==='saved'?b:a,winningRaw=await raw(winner);
    await loser.setViewportSize({width:390,height:844});
    assert.equal(await loser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await loser.locator('.draft-strip').screenshot({path:join(evidence,'draft-conflict-mobile.png')});
    assert.equal(await a.inputValue('#label-0'),'Tab A');assert.equal(await b.locator('.clue-row').first().locator('select[data-field=kind]').inputValue(),'after');
    await loser.evaluate(key=>window.dispatchEvent(new StorageEvent('storage',{key,oldValue:null,newValue:'{"stale":true}',storageArea:localStorage,url:location.href})),KEY);
    assert.equal(await raw(winner),winningRaw);
    await loser.click('#keep-draft');await state(loser,'saved');const resolved=JSON.parse(await raw(loser));
    if(loser===a)assert.equal(resolved.cards[0].label,'Tab A');else assert.equal(resolved.clues[0].kind,'after');
    await winner.locator('#load-draft').waitFor();await winner.click('#load-draft');await state(winner,'restored');
    assert.equal(await winner.isDisabled('#export-button'),true);assert.equal(await winner.locator('#digest').textContent(),'');
  });
  await group('queued-discard-fences-and-fixture-target',async context=>{
    const page=await open(context);await edit(page,0,'Saved before queue');await saved(page);
    await hold(page);await page.click('#discard-draft');await queued(page);await edit(page,0,'Newer than discard');
    await release(page);await settle(page);await state(page,'saved');assert.equal(JSON.parse(await raw(page)).cards[0].label,'Newer than discard');assert.equal(await page.inputValue('#label-0'),'Newer than discard');
    await hold(page);await edit(page,0,'Queued source edit');await queued(page);await page.click('#discard-draft');await release(page);await settle(page);await state(page,'discarded');assert.equal(await raw(page),null);
    await hold(page);await edit(page,0,'Source only');await queued(page);await page.selectOption('#case-select','es-adapted');
    await edit(page,0,'Target independent');await state(page,'saved');await release(page);await settle(page);
    assert.equal(await page.inputValue('#label-0'),'Target independent');assert.equal(JSON.parse(await raw(page)).cards[0].label,'Source only');
    assert.equal(JSON.parse(await raw(page,'ludolingua.author-draft:es-adapted')).cards[0].label,'Target independent');
  });
  await group('clues-hints-review-and-locale',async context=>{
    const page=await open(context);await page.click('#check-button');await page.waitForFunction(()=>document.querySelector('#digest').textContent.includes('SHA-256'));
    await page.locator('.clue-row').first().locator('select[data-field=right]').selectOption('bell');
    await page.locator('details.hint-editing summary').click();const hintText='\nFirst hint\n\n  Second hint  \n\n';
    await page.fill('#hint-editor',hintText);await saved(page);await page.click('#review-hints');const reviewed=await saved(page);
    assert.equal(reviewed.hintReview.status,'author-reviewed');assert.equal(reviewed.hintText,hintText);
    await page.locator('#freeze-labels').check();await saved(page);assert.equal(await page.inputValue('#hint-editor'),hintText);
    const before=await raw(page);await page.selectOption('#ui-language','es');
    assert.match(await page.locator('#draft-status').textContent(),/guardado/);assert.equal(await raw(page),before);
    await page.reload();await state(page,'restored');assert.equal(await page.inputValue('#hint-editor'),hintText);
    assert.equal(await page.locator('.clue-row').first().locator('select[data-field=right]').inputValue(),'bell');
    assert.equal(await page.isDisabled('#export-button'),true);assert.equal(await page.isDisabled('#comparison-export-button'),true);
    await page.click('#check-button');await page.locator('.result-state.invalid').waitFor();assert.match(await page.locator('#result').innerText(),/distinct existing card IDs/);assert.equal(await page.isDisabled('#export-button'),true);
    await page.locator('#freeze-labels').uncheck();await edit(page,0,'Orange');const changed=await saved(page);assert.equal(changed.hintReview.status,'needs-author-review');
    await page.locator('#label-0').focus();await page.locator('#label-0').evaluate(e=>e.setSelectionRange(2,2));await page.keyboard.type('x');await saved(page);
    assert.deepEqual(await page.locator('#label-0').evaluate(e=>[document.activeElement===e,e.selectionStart,e.selectionEnd]),[true,3,3]);
  });
  await group('required-action-restores-with-fresh-check',async context=>{
    const page=await open(context);
    await page.fill('#required-action','');await saved(page);
    await page.selectOption('#case-select','es-adapted');await page.selectOption('#case-select','en-original');
    assert.equal(await page.inputValue('#required-action'),'');assert.equal(await page.isDisabled('#export-button'),true);
    await page.click('#check-button');await page.locator('.result-state.invalid').waitFor();
    await page.fill('#required-action','  PLAY  ');const record=await saved(page);
    assert.equal(record.actionExpected,'  PLAY  ');assert.equal(record.hintReview.reason,'Labels, required action, ordering clues or hints changed.');
    await page.reload();await state(page,'restored');assert.equal(await page.inputValue('#required-action'),'  PLAY  ');assert.equal(await page.isDisabled('#export-button'),true);
    await page.click('#check-button');await page.locator('.result-state.action-mismatch').waitFor();assert.equal(await page.isDisabled('#export-button'),false);
  });
  await group('stale-check-after-draft-discard',async context=>{
    const page=await open(context);await edit(page,0,'Orange');await saved(page);
    await page.evaluate(()=>{
      const original=crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest=(...args)=>new Promise((resolve,reject)=>{window.__releaseDigest=()=>original(...args).then(resolve,reject);window.__digestStarted=true;});
    });
    await page.click('#check-button');await page.waitForFunction(()=>window.__digestStarted);
    await page.click('#discard-draft');await state(page,'discarded');await page.evaluate(()=>window.__releaseDigest());
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#digest').textContent(),'');assert.equal(await page.isDisabled('#export-button'),true);assert.equal(await page.inputValue('#label-0'),'Otter');
  });
  receipt.passed=true;
}catch(error){receipt.failure=String(error.stack);process.exitCode=1;}
finally{
  receipt.finishedAt=new Date().toISOString();await writeFile(join(evidence,'draft-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  await browser?.close();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
console.log(JSON.stringify(receipt));
