import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {startReceiver} from '../serve.mjs';
import {readPlaytestRecord} from '../lib/playtest-export.mjs';
import {readComparisonExport} from '../lib/comparison-export.mjs';

if(!process.env.PLAYWRIGHT_PACKAGE||!process.env.LUDO_EVIDENCE_DIR)throw new Error('Set PLAYWRIGHT_PACKAGE and LUDO_EVIDENCE_DIR.');
const out=resolve(process.env.LUDO_EVIDENCE_DIR);await mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE,'index.mjs')).href);
const receipt={schema:'ludolingua.duplicate-name-receiving.v1',startedAt:new Date().toISOString(),passed:false,checks:[],errors:[],failedRequests:[],httpErrors:[],screenshots:[]};
let server,browser,page;
const expected={key:'Pine (key) [1]',bell:'Pine (bell)',moon:'Pine (key) [3]',star:'Nest'};
const ids=Object.keys(expected),raw=['Pine','Pine','Pine (key)','Nest'];
const success='The action works. Your order fits the clues and its initials match.';
const htmlText=s=>s.normalize('NFC').replace(/[ \t\r\n\f]+/g,' ').trim();
async function step(name,run){await run();receipt.checks.push(name);}
function observe(p){
 p.on('pageerror',e=>receipt.errors.push(String(e)));
 p.on('console',m=>{if(m.type()==='error')receipt.errors.push(m.text());});
 p.on('requestfailed',r=>receipt.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
 p.on('response',r=>{if(r.status()>=400)receipt.httpErrors.push({url:r.url(),status:r.status()});});
}
async function snapshot(p,name){const file=resolve(out,name+'.png');await p.screenshot({path:file,fullPage:true});receipt.screenshots.push(file);}
async function noOverflow(p){assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);}
async function download(p,selector,name){
 const waiting=p.waitForEvent('download');await p.locator(selector).click();const d=await waiting;
 assert.equal(await d.failure(),null);const file=resolve(out,name);await d.saveAs(file);return {file,bytes:await readFile(file)};
}
async function cards(p,selector){return p.locator(selector+' li[data-card-id]').evaluateAll(es=>es.map(e=>({id:e.dataset.cardId,label:e.querySelector('.keeper-label').textContent.trim()})));}
const byId=cs=>Object.fromEntries(cs.map(c=>[c.id,c.label]));
async function order(p,selector){return p.locator(selector+' li[data-card-id]').evaluateAll(es=>es.map(e=>e.dataset.cardId));}
async function arrange(p,selector){
 for(let target=0;target<ids.length;target++){
  const current=await order(p,selector);assert.deepEqual([...current].sort(),[...ids].sort());const index=current.indexOf(ids[target]);assert.ok(index>=target);
  for(let position=index;position>target;position--){await p.locator(selector+' li[data-card-id="'+ids[target]+'"] button[data-direction="up"]').click();const next=await order(p,selector);assert.equal(next[position-1],ids[target]);assert.deepEqual(next.slice(0,target),ids.slice(0,target));}
 }
 assert.deepEqual(await order(p,selector),ids);assert.deepEqual(byId(await cards(p,selector)),expected);
}
async function assertMoveNames(p,selector){
 for(const card of await cards(p,selector))for(const direction of ['up','down'])assert.equal(await p.locator(selector+' li[data-card-id="'+card.id+'"] button[data-direction="'+direction+'"]').getAttribute('aria-label'),'Move '+card.label+' '+direction);
}
async function metric(name,value){assert.equal((await page.locator('#comparison-result [data-metric="'+name+'"]').innerText()).trim(),String(value));}
try{
 const receiver=await startReceiver();server=receiver.server;receipt.url=receiver.url;
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--disable-dev-shm-usage','--enable-automation']});
 const cdp=await browser.newBrowserCDPSession(),cmd=await cdp.send('Browser.getBrowserCommandLine');
 assert.equal(cmd.arguments.some(x=>x==='--no-sandbox'||x==='--disable-setuid-sandbox'),false);
 const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
 page=await context.newPage();await page.goto('chrome://sandbox');receipt.sandbox=await page.locator('body').innerText();assert.match(receipt.sandbox,/Seccomp-BPF sandbox\s+Yes/i);
 observe(page);await page.goto(receipt.url);await page.locator('#case-select').selectOption('en-original');
 await step('Ordinary card names remain unchanged in the real player',async()=>{
  const ordinary={key:'Otter',bell:'Pine',moon:'Eagle',star:'Nest'};
  await page.locator('#player-tab').click();assert.deepEqual(byId(await cards(page,'#player-order')),ordinary);await page.locator('#author-tab').click();
 });
 for(let i=0;i<raw.length;i++)await page.locator('#label-'+i).fill(raw[i]);
 await page.locator('#required-action').fill('PPPN');await page.locator('#check-button').click();await page.locator('.result-state.verified').waitFor();
 const before=await download(page,'#export-button','duplicate-name-episode-before.json'),original=JSON.parse(before.bytes.toString());
 receipt.episodeSha256=original.validation.episodeSha256;
 await step('Author choices contain complete distinct names while values stay source IDs',async()=>{
  const selects=page.locator('#clue-editor select[data-field="left"],#clue-editor select[data-field="right"]');assert.ok(await selects.count()>0);
  for(let i=0;i<await selects.count();i++){const options=await selects.nth(i).locator('option').evaluateAll(es=>es.map(e=>({id:e.value,label:e.textContent})));assert.deepEqual(options.map(o=>o.id),ids);assert.equal(new Set(options.map(o=>htmlText(o.label))).size,4);}
 });
 await page.locator('#player-tab').click();
 await step('Suffix-shaped authored name and duplicate names remain distinct after movement and reset',async()=>{
  assert.deepEqual(await order(page,'#player-order'),['star','key','bell','moon']);assert.deepEqual(byId(await cards(page,'#player-order')),expected);await assertMoveNames(page,'#player-order');
  const clues=await page.locator('#player-clues').innerText();for(const label of Object.values(expected))assert.ok(clues.includes(label));
  await page.locator('#player-order li[data-card-id="key"] button[data-direction="up"]').click();assert.deepEqual(await order(page,'#player-order'),['key','star','bell','moon']);assert.deepEqual(byId(await cards(page,'#player-order')),expected);
  await page.locator('#reset-order').click();assert.deepEqual(byId(await cards(page,'#player-order')),expected);await assertMoveNames(page,'#player-order');
 });
 await step('Player solves through real controls and reveal uses the same names',async()=>{
  await arrange(page,'#player-order');await page.locator('#answer').fill('PPPN');await page.locator('#answer-button').click();assert.equal((await page.locator('#player-feedback').innerText()).trim(),success);
  await page.locator('#reveal-button').click();const reveal=await page.locator('#reveal').innerText();for(const label of Object.values(expected))assert.ok(reveal.includes(label));
 });
 await noOverflow(page);await snapshot(page,'duplicate-names-desktop');await page.setViewportSize({width:390,height:844});await noOverflow(page);await snapshot(page,'duplicate-names-narrow');await page.setViewportSize({width:1280,height:1000});
 await step('UI language, movement and source capture do not alter episode export bytes',async()=>{
  await page.locator('#ui-language').selectOption('es');assert.deepEqual(byId(await cards(page,'#player-order')),expected);
  for(const c of await cards(page,'#player-order'))assert.ok((await page.locator('#player-order li[data-card-id="'+c.id+'"] button[data-direction="up"]').getAttribute('aria-label')).includes(c.label));
  await page.locator('#ui-language').selectOption('en');await page.locator('#author-tab').click();
  for(let i=0;i<raw.length;i++)assert.equal(await page.locator('#label-'+i).inputValue(),raw[i]);
  const after=await download(page,'#export-button','duplicate-name-episode-after-display.json');assert.deepEqual(after.bytes,before.bytes);
  await page.locator('#use-current-as-source').click();const captured=await download(page,'#export-button','duplicate-name-episode-after-capture.json');assert.deepEqual(captured.bytes,before.bytes);
 });
 await step('Source summaries, mapping names and identity comparison stay coherent',async()=>{
  const summary=await page.locator('#source-summary').innerText();for(const label of Object.values(expected))assert.ok(summary.includes(label));
  for(const id of ids){
   const row=page.locator('#mapping-editor [data-source-id="'+id+'"]');assert.equal((await row.locator('label span').innerText()).trim(),expected[id]);const select=row.locator('select');assert.equal(await select.inputValue(),id);assert.equal(await select.getAttribute('aria-label'),'Adaptation role for '+expected[id]);
   const options=await select.locator('option').evaluateAll(es=>es.filter(e=>e.value).map(e=>({id:e.value,label:e.textContent})));assert.deepEqual(options.map(o=>o.id),ids);assert.equal(new Set(options.map(o=>htmlText(o.label))).size,4);
  }
  await page.locator('#compare-button').click();await page.locator('#comparison-status[data-preserved="true"]').waitFor();
  for(const [name,value]of [['source-orders',1],['target-orders',1],['source-only',0],['target-only',0]])await metric(name,value);
  const d=await download(page,'#comparison-export-button','duplicate-name-comparison.json'),received=await readComparisonExport(d.bytes.toString());assert.equal(received.integrity.verified,true);assert.deepEqual(received.source,original.episode);assert.deepEqual(received.target,original.episode);
 });
 await snapshot(page,'duplicate-names-comparison');
 await step('Separate player solves and its downloaded record preserves the historical episode and IDs',async()=>{
  const waiting=page.waitForEvent('popup');await page.locator('#launch-playtest').click();const popup=await waiting;observe(popup);
  try{
   await popup.locator('#playtest-status[data-state="ready"]').waitFor();assert.deepEqual(byId(await cards(popup,'#playtest-cards')),expected);await assertMoveNames(popup,'#playtest-cards');
   await arrange(popup,'#playtest-cards');await popup.locator('#playtest-answer').fill('PPPN');await popup.locator('#playtest-attempt').click();assert.equal((await popup.locator('#playtest-feedback').innerText()).trim(),success);
   await popup.locator('#playtest-reveal').click();assert.equal((await popup.locator('#playtest-solution .path').innerText()).trim(),ids.map(id=>expected[id]).join(' → ')+' → PPPN');
   await noOverflow(popup);await snapshot(popup,'duplicate-names-separate-player');
   const d=await download(popup,'#playtest-download','duplicate-name-play-record.json'),record=await readPlaytestRecord(d.bytes.toString());
   assert.equal(record.integrity.verified,true);assert.deepEqual(record.episode,original.episode);assert.equal(record.validation.result.summary.successfulAttempts,1);assert.equal(record.validation.result.summary.revealUsed,true);
   const moves=record.events.filter(e=>e.type==='move');assert.ok(moves.length>0);for(const move of moves){assert.ok(ids.includes(move.cardId));assert.ok(['up','down'].includes(move.direction));}
   receipt.recordBindingSha256=record.integrity.bindingSha256;
   await page.locator('#label-0').fill('Pear');await page.locator('#playtest-record-file').setInputFiles(d.file);
   await page.locator('#playtest-review-status').filter({hasText:'Record verified. Replayed'}).waitFor();assert.equal(await page.locator('#label-0').inputValue(),'Pear');
   await page.locator('#playtest-review .playtest-events summary').click();const actions=await page.locator('#playtest-review .playtest-events li').allTextContents();
   assert.equal(actions.length,record.events.length);for(let i=0;i<record.events.length;i++){const event=record.events[i];if(event.type==='move')assert.ok(actions[i].endsWith('Move '+expected[event.cardId]+' '+event.direction));}
   await snapshot(page,'duplicate-names-record-review');
  }finally{await popup.close();}
 });

 for(const [name,file]of [['downloaded-session',resolve(out,'duplicate-name-play-record.json')],['pre-display-repair-fixture',fileURLToPath(new URL('./fixtures/duplicate-name-before-display-repair.json',import.meta.url))]]){
  await step('Resumed '+name+' preserves names and history while appending a source-ID move',async()=>{
   const prior=await readPlaytestRecord(await readFile(file,'utf8')),resumed=await context.newPage();observe(resumed);
   try{
    await resumed.goto(new URL('/web/playtest.html',receipt.url).href);await resumed.locator('#playtest-resume-file').setInputFiles(file);await resumed.locator('#playtest-status[data-state="ready"]').waitFor();
    assert.deepEqual(byId(await cards(resumed,'#playtest-cards')),expected);await assertMoveNames(resumed,'#playtest-cards');
    const priorOrder=prior.validation.result.finalState.order;assert.deepEqual(await order(resumed,'#playtest-cards'),priorOrder);
    assert.equal(await resumed.locator('#playtest-solution').isVisible(),prior.validation.result.finalState.revealed);
    assert.equal(await resumed.locator('#playtest-hints p').count(),prior.validation.result.finalState.visibleHintCount);
    const index=priorOrder.indexOf('key');assert.ok(index>=0&&index<priorOrder.length-1);
    await resumed.locator('#playtest-cards li[data-card-id="key"] button[data-direction="down"]').click();
    const next=[...priorOrder];[next[index],next[index+1]]=[next[index+1],next[index]];assert.deepEqual(await order(resumed,'#playtest-cards'),next);assert.deepEqual(byId(await cards(resumed,'#playtest-cards')),expected);
    const d=await download(resumed,'#playtest-download','duplicate-name-resumed-'+name+'.json'),after=await readPlaytestRecord(d.bytes.toString());
    assert.deepEqual(after.episode,prior.episode);assert.equal(after.sessionId,prior.sessionId);assert.equal(after.events.length,prior.events.length+1);assert.deepEqual(after.events.slice(0,prior.events.length),prior.events);
    const event=after.events.at(-1);assert.equal(event.type,'move');assert.equal(event.cardId,'key');assert.equal(event.direction,'down');assert.ok(Number.isSafeInteger(event.elapsedMs)&&event.elapsedMs>=prior.validation.result.summary.elapsedMs);
    assert.equal(after.integrity.episodeSha256,prior.integrity.episodeSha256);await snapshot(resumed,'duplicate-names-resumed-'+name);
   }finally{await resumed.close();}
  });
 }

 await step('Downloaded episode reopens exact authored names and source bytes',async()=>{
  await page.locator('#import-file').setInputFiles(before.file);await page.locator('#notice').filter({hasText:'Source digest and mechanical result verified'}).waitFor();
  for(let i=0;i<raw.length;i++)assert.equal(await page.locator('#label-'+i).inputValue(),raw[i]);
  await page.locator('#check-button').click();await page.locator('.result-state.verified').waitFor();const reopened=await download(page,'#export-button','duplicate-name-episode-reopened.json');assert.deepEqual(reopened.bytes,before.bytes);
 });
 await step('Actual target-only comparison witness uses stable distinct names',async()=>{
  await page.locator('#use-current-as-source').click();await page.locator('#clue-editor .clue-row[data-clue-id="lead"] button[data-action="remove-clue"]').click();
  await page.locator('#compare-button').click();await page.locator('#comparison-status[data-preserved="false"]').waitFor();
  for(const [name,value]of [['source-orders',1],['target-orders',3],['source-only',0],['target-only',2]])await metric(name,value);
  const witness=page.locator('#comparison-result .witness');assert.equal(await witness.count(),1);assert.equal((await witness.locator('h4').innerText()).trim(),'Allowed only by the adaptation');
  const ps=witness.locator('p');assert.equal(await ps.count(),2);const source=(await ps.nth(0).innerText()).trim(),target=(await ps.nth(1).innerText()).trim();
  assert.ok(source.startsWith('Source roles: '));assert.ok(target.startsWith('Mapped adaptation: '));const names=source.slice('Source roles: '.length).split(' → ');assert.deepEqual([...names].sort(),Object.values(expected).sort());const allowed=[['bell','moon','key','star'],['bell','moon','star','key']].map(order=>order.map(id=>expected[id]));assert.ok(allowed.some(order=>JSON.stringify(order)===JSON.stringify(names)),'Witness must match an independently enumerated target-only order');assert.deepEqual(target.slice('Mapped adaptation: '.length).split(' → '),names);
 });
 await snapshot(page,'duplicate-names-target-only-witness');

 await step('Source-only witness resolves the captured source and newly named adaptation separately',async()=>{
  await page.locator('#use-current-as-source').click();await page.locator('#import-file').setInputFiles(before.file);await page.locator('#notice').filter({hasText:'Source digest and mechanical result verified'}).waitFor();
  const adaptedRaw=['Petal','Petal','Petal (key)','Nook'],adapted={key:'Petal (key) [1]',bell:'Petal (bell)',moon:'Petal (key) [3]',star:'Nook'};
  for(let i=0;i<adaptedRaw.length;i++)await page.locator('#label-'+i).fill(adaptedRaw[i]);
  await page.locator('#compare-button').click();await page.locator('#comparison-status[data-preserved="false"]').waitFor();
  for(const [name,value]of [['source-orders',3],['target-orders',1],['source-only',2],['target-only',0]])await metric(name,value);
  const witness=page.locator('#comparison-result .witness');assert.equal(await witness.count(),1);assert.equal((await witness.locator('h4').innerText()).trim(),'Allowed only by the source');
  const ps=witness.locator('p'),source=(await ps.nth(0).innerText()).trim(),target=(await ps.nth(1).innerText()).trim();assert.ok(source.startsWith('Source roles: '));assert.ok(target.startsWith('Mapped adaptation: '));
  const sourceNames=source.slice('Source roles: '.length).split(' → '),sourceIds=sourceNames.map(name=>ids.find(id=>expected[id]===name));
  assert.ok([['bell','moon','key','star'],['bell','moon','star','key']].some(order=>JSON.stringify(order)===JSON.stringify(sourceIds)));
  assert.deepEqual(target.slice('Mapped adaptation: '.length).split(' → '),sourceIds.map(id=>adapted[id]));
  const d=await download(page,'#comparison-export-button','duplicate-name-source-only-comparison.json'),received=await readComparisonExport(d.bytes.toString());
  assert.equal(received.integrity.verified,true);assert.deepEqual(received.source.cards.map(c=>c.label),raw);assert.deepEqual(received.target.cards.map(c=>c.label),adaptedRaw);
 });
 await snapshot(page,'duplicate-names-source-only-witness');


 await step('New original authoring hands off, solves and reopens colliding raw names without altering another workbench',async()=>{
  const parentLabels=await Promise.all(raw.map((_,i)=>page.locator('#label-'+i).inputValue()));
  const createdIds=['keeper-1','keeper-2','keeper-3','keeper-4'],createdRaw=['Pine','Pine','Pine (keeper-1)','Nest'];
  const createdNames={'keeper-1':'Pine (keeper-1) [1]','keeper-2':'Pine (keeper-2)','keeper-3':'Pine (keeper-1) [3]','keeper-4':'Nest'};
  let creator,workbench,reopened;
  try{
   const creating=context.waitForEvent('page');await page.locator('#create-episode-link').click();creator=await creating;observe(creator);
   await creator.locator('#new-episode-title').fill('Names with distinct roles');
   await creator.locator('#new-episode-story').fill('An authored receiver fixture with two identical names and one name shaped like a role cue.');
   await creator.locator('#new-episode-labels').fill(createdRaw.join('\n'));await creator.locator('#new-episode-action').fill('PPPN');
   await creator.locator('#create-starting-episode').click();await creator.locator('#created-episode').waitFor();
   await snapshot(creator,'new-original-colliding-names-form');
   const opening=context.waitForEvent('page');await creator.locator('#open-created-workbench').click();workbench=await opening;observe(workbench);
   await workbench.waitForFunction(()=>document.getElementById('episode-title-input')?.value==='Names with distinct roles'&&!document.querySelector('.workspace')?.inert);
   assert.equal(await workbench.locator('#clue-editor .clue-row').count(),0);
   assert.deepEqual(await Promise.all(raw.map((_,i)=>page.locator('#label-'+i).inputValue())),parentLabels);
   const definitions=[['keeper-1','before','keeper-2'],['keeper-2','immediately_before','keeper-3'],['keeper-4','after','keeper-3']];
   for(const [index,[left,kind,right]]of definitions.entries()){
    await workbench.locator('#add-clue').click();const row=workbench.locator('#clue-editor .clue-row').last();
    if(index===0)for(const field of ['left','right']){
     const options=await row.locator('select[data-field="'+field+'"] option').evaluateAll(es=>es.map(e=>({id:e.value,label:e.textContent})));
     assert.deepEqual(options.map(o=>o.id),createdIds);assert.deepEqual(Object.fromEntries(options.map(o=>[o.id,o.label])),createdNames);
    }
    await row.locator('select[data-field="left"]').selectOption(left);await row.locator('select[data-field="kind"]').selectOption(kind);await row.locator('select[data-field="right"]').selectOption(right);
   }
   const clueSelections=async()=>workbench.locator('#clue-editor .clue-row').evaluateAll(rows=>rows.map(row=>['left','kind','right'].map(field=>row.querySelector('select[data-field="'+field+'"]').value)));
   assert.deepEqual(await clueSelections(),definitions);
   await workbench.locator('#check-button').click();await workbench.locator('#result .result-state.verified').waitFor();
   await workbench.locator('#ui-language').selectOption('es');assert.deepEqual(await clueSelections(),definitions);await workbench.locator('#ui-language').selectOption('en');assert.deepEqual(await clueSelections(),definitions);
   for(const field of ['left','right'])assert.deepEqual(await workbench.locator('#clue-editor .clue-row').first().locator('select[data-field="'+field+'"] option').allTextContents(),createdIds.map(id=>createdNames[id]));
   async function solveCreated(p){
    await p.locator('#player-tab').click();assert.deepEqual(byId(await cards(p,'#player-order')),createdNames);await assertMoveNames(p,'#player-order');
    const clueText=await p.locator('#player-clues').innerText();for(const label of Object.values(createdNames))assert.ok(clueText.includes(label));
    assert.deepEqual(await order(p,'#player-order'),['keeper-4','keeper-1','keeper-2','keeper-3']);
    for(let i=0;i<3;i++)await p.locator('#player-order li[data-card-id="keeper-4"] button[data-direction="down"]').click();
    assert.deepEqual(await order(p,'#player-order'),createdIds);await p.locator('#answer').fill('PPPN');await p.locator('#answer-button').click();assert.equal((await p.locator('#player-feedback').innerText()).trim(),success);
   }
   await solveCreated(workbench);await noOverflow(workbench);await snapshot(workbench,'new-original-colliding-names-solved');await workbench.locator('#author-tab').click();
   const exported=await download(workbench,'#export-button','new-original-colliding-names.json'),value=JSON.parse(exported.bytes.toString());
   assert.deepEqual(value.episode.cards.map(c=>c.id),createdIds);assert.deepEqual(value.episode.cards.map(c=>c.label),createdRaw);
   assert.deepEqual(value.episode.clues.map(c=>[c.left,c.kind,c.right]),definitions);assert.equal(value.episode.action.expected,'PPPN');assert.equal(value.validation.result.mechanicalSuccess,true);
   reopened=await context.newPage();observe(reopened);await reopened.goto(receipt.url);await reopened.locator('#import-file').setInputFiles(exported.file);
   await reopened.locator('#notice').filter({hasText:'Source digest and mechanical result verified'}).waitFor();
   for(let i=0;i<createdRaw.length;i++)assert.equal(await reopened.locator('#label-'+i).inputValue(),createdRaw[i]);
   const again=await download(reopened,'#export-button','new-original-colliding-names-reopened.json');assert.deepEqual(again.bytes,exported.bytes);
   await solveCreated(reopened);
   assert.deepEqual(await Promise.all(raw.map((_,i)=>page.locator('#label-'+i).inputValue())),parentLabels);
  }finally{for(const p of [reopened,workbench,creator])if(p&&!p.isClosed())await p.close();}
 });

 await page.setViewportSize({width:390,height:844});await noOverflow(page);await snapshot(page,'duplicate-names-author-narrow');
 assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.failedRequests,[]);assert.deepEqual(receipt.httpErrors,[]);receipt.passed=true;
}catch(error){receipt.failure={message:error.message,stack:error.stack};process.exitCode=1;if(page)await snapshot(page,'duplicate-names-failure').catch(()=>{});}
finally{
 receipt.finishedAt=new Date().toISOString();if(browser)await browser.close();
 if(server)await new Promise(done=>{server.close(done);server.closeIdleConnections?.();});
 await writeFile(resolve(out,'duplicate-name-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
