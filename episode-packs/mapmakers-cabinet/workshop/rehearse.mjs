import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [runtimeArg,packArg,outArg,notesArg]=process.argv.slice(2);
if(!runtimeArg||!packArg||!outArg||!notesArg)throw new Error('Usage: node rehearse.mjs RUNTIME_ROOT PACK_ROOT NEW_OUTPUT_DIRECTORY AUTHOR_NOTES_TEXT_FILE');
const runtime=path.resolve(runtimeArg),pack=path.resolve(packArg),out=path.resolve(outArg);
await fs.mkdir(out,{recursive:false});
const fromRuntime=p=>import(pathToFileURL(path.join(runtime,p)).href);
const [{startReceiver},{readExport,sourceDigest},{readComparisonExport},{readLocalizationNotes},{readPlaytestRecord},{CASES,SOLUTION_ORDER}]=await Promise.all([
 fromRuntime('serve.mjs'),fromRuntime('lib/export.mjs'),fromRuntime('lib/comparison-export.mjs'),fromRuntime('lib/localization-notes.mjs'),fromRuntime('lib/playtest-export.mjs'),import(pathToFileURL(path.join(pack,'cases.mjs')).href)
]);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const input=path.join(pack,'exports/episodes/01-en-source.json'),sourceRaw=JSON.parse(await fs.readFile(input,'utf8'));
const source=(await readExport(sourceRaw)).episode,reference=CASES[2],sourceHash=await sourceDigest(source);
assert.deepEqual(source,CASES[0]);
const notesText=await fs.readFile(notesArg,'utf8'),sha=b=>createHash('sha256').update(b).digest('hex');
const receipt={schema:'ludolingua.mapmakers-workshop-rehearsal.v1',checks:[],errors:[],downloads:[],
 source:{id:source.id,revision:source.revision,episodeSha256:sourceHash,inputFileSha256:sha(await fs.readFile(input))},
 limitations:['Automated known-answer authoring rehearsal, not human or native-language playtesting.','Author hint review and localization notes are author self-declarations.','The new target identity and provenance are preserved; they are not normalized to the preauthored reference.']};
const check=(name,details={})=>receipt.checks.push({name,...details});
function observe(p){p.on('pageerror',e=>receipt.errors.push({type:'pageerror',message:e.message}));p.on('console',m=>{if(m.type()==='error')receipt.errors.push({type:'console',message:m.text()});});}
async function download(p,selector,name){
 const pending=p.waitForEvent('download');await p.locator(selector).click();const d=await pending;assert.equal(await d.failure(),null);
 const destination=path.join(out,name);await d.saveAs(destination);const data=await fs.readFile(destination);
 receipt.downloads.push({name,bytes:data.length,sha256:sha(data)});return{destination,data};
}
async function workbench(context){const p=await context.newPage();observe(p);await p.goto(receiver.url);await p.locator('#label-0').waitFor();return p;}
async function comparisonReady(p){await p.locator('#compare-button').click();await p.waitForFunction(()=>!document.querySelector('#comparison-export-button').disabled);}
async function episodeReady(p){await p.locator('#check-button').click();await p.waitForFunction(()=>!document.querySelector('#export-button').disabled);}
async function openComparison(p,file,binding){await p.locator('#comparison-import-file').setInputFiles(file);await p.waitForFunction(h=>document.querySelector('#comparison-digest').textContent.includes(h),binding);}
async function arrange(p,wanted){
 for(let target=0;target<wanted.length;target++){
  const id=wanted[target];
  while((await p.locator('#playtest-cards li[data-card-id]').evaluateAll(es=>es.map(e=>e.dataset.cardId))).indexOf(id)>target){
   const button=p.locator('#playtest-cards li[data-card-id="'+id+'"] button[data-direction="up"]');await button.focus();await p.keyboard.press('Enter');
   assert.equal(await p.evaluate(()=>document.activeElement.closest('li')?.dataset.cardId),id);
  }
 }
 assert.deepEqual(await p.locator('#playtest-cards li[data-card-id]').evaluateAll(es=>es.map(e=>e.dataset.cardId)),wanted);
}
let receiver,browser;
try{
 receiver=await startReceiver({port:0});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome-stable',chromiumSandbox:true,args:['--enable-automation']});
 const cdp=await browser.newBrowserCDPSession(),args=(await cdp.send('Browser.getBrowserCommandLine')).arguments;
 assert(!args.some(a=>['--no-sandbox','--disable-setuid-sandbox'].includes(a)));
 const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});context.setDefaultTimeout(15000);
 const sandbox=await context.newPage();await sandbox.goto('chrome://sandbox');receipt.sandbox=await sandbox.locator('body').innerText();assert.match(receipt.sandbox,/Seccomp-BPF sandbox\s+Yes/i);await sandbox.close();
 receipt.browserVersion=browser.version();
 const page=await workbench(context);await page.locator('#import-file').setInputFiles(input);
 await page.waitForFunction(h=>document.querySelector('#digest').textContent.includes(h),sourceRaw.validation.episodeSha256);
 await page.locator('#adaptation-start summary').click();await page.locator('#adaptation-language').selectOption('es');await page.locator('#start-adaptation').click();
 await page.waitForFunction(()=>!document.querySelector('#start-adaptation').disabled);
 assert.match(await page.locator('#adaptation-status').innerText(),/copied unchanged/);
 assert.equal(await page.locator('#episode-title-input').getAttribute('lang'),'es');assert.equal(await page.locator('#episode-title-input').inputValue(),source.title);
 assert(await page.locator('#freeze-labels').isChecked());
 for(const c of source.cards)assert(await page.locator('input[data-card-id="'+c.id+'"]').isDisabled());
 await page.locator('#adaptation-start').screenshot({path:path.join(out,'01-start-adaptation.png')});
 check('Original English import becomes a distinct Spanish target with copied wording and explicit label lock');
 await page.locator('#freeze-labels').uncheck();
 for(const card of reference.cards)await page.locator('input[data-card-id="'+card.id+'"]').fill(card.label);
 await page.locator('#freeze-labels').check();await page.locator('#required-action').fill(reference.action.expected);
 await page.locator('#episode-title-input').fill(reference.title);await page.locator('#episode-story-input').fill(reference.story);
 await page.locator('.hint-editing summary').click();await page.locator('#hint-editor').fill(reference.hints.join('\n'));
 assert.match(await page.locator('#hints-review-note').innerText(),/Review their wording/);
 await page.locator('#review-hints').click();assert.match(await page.locator('#hints-review-note').innerText(),/Author-declared hint review/);
 const renderedClues=await page.locator('#author-clues').innerText();
 assert(renderedClues.includes('Útil náutico va después de Reloj.'));assert(renderedClues.includes('Útil náutico va inmediatamente antes de Jarra.'));
 await episodeReady(page);
 const targetFile=await download(page,'#export-button','target.es.json'),targetRaw=JSON.parse(targetFile.data),readTarget=await readExport(targetRaw),target=readTarget.episode;
 for(const key of ['locale','title','story','cards','clues','extraction','action','constraints','hints'])assert.deepEqual(target[key],reference[key],key);
 assert.notEqual(target.id,source.id);assert.notEqual(target.id,reference.id);assert(target.revision>1);
 assert.equal(target.hintReview.status,'author-reviewed');assert.equal(target.hintReview.kind,'author-self-declaration');assert.equal(target.hintReview.revision,target.revision);
 assert.equal(target.provenance.humanPlaytest,null);assert.equal(target.provenance.modelRun,null);assert(target.provenance.source.includes(sourceHash));
 assert.deepEqual(target.cards.map(c=>c.id),source.cards.map(c=>c.id));assert.deepEqual(target.clues,source.clues);assert.equal(readTarget.validation.result.mechanicalSuccess,true);
 receipt.target={id:target.id,revision:target.revision,episodeSha256:targetRaw.validation.episodeSha256,hintReview:target.hintReview};
 check('All intended Spanish content authored through visible controls; labels refrozen, six clues and seven displayed role identities unchanged');
 await comparisonReady(page);assert.equal(await page.locator('#comparison-status').getAttribute('data-preserved'),'true');
 const pairFile=await download(page,'#comparison-export-button','comparison.en-es.json'),pairRaw=JSON.parse(pairFile.data),pair=await readComparisonExport(pairRaw);
 assert.deepEqual(pair.source,source);assert.deepEqual(pair.target,target);assert.deepEqual(pair.mapping,source.cards.map(c=>({sourceId:c.id,targetId:c.id})));
 assert.equal(pairRaw.validation.result.sameOrderSet,true);assert.equal(pairRaw.validation.result.mechanicalPreserved,true);
 receipt.comparisonBinding=pairRaw.validation.bindingSha256;
 check('Checked comparison retains the exact original source and actual new target, with preserved clue-order set');
 await page.locator('#localization-notes summary').click();await page.locator('#localization-notes-text').fill(notesText);await page.locator('#attach-localization-notes').click();
 assert.equal(await page.locator('#localization-notes-status').getAttribute('data-binding'),'current');
 const notesFile=await download(page,'#download-localization-notes','localization-notes.json'),notes=await readLocalizationNotes(JSON.parse(notesFile.data));
 assert.deepEqual(notes.comparison,pairRaw);assert.equal(notes.notesText,notesText);receipt.notesContentSha256=notes.contentSha256;
 await page.locator('#localization-notes').screenshot({path:path.join(out,'02-authored-notes-desktop.png')});
 check('Authored rationale downloaded with its exact checked source/target pair through the maintained notes control');
 const playerFile=await download(page,'#download-portable-player','completed-player.es.html');
 const fresh=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});fresh.setDefaultTimeout(15000);
 const reopenedTarget=await workbench(fresh);await reopenedTarget.locator('#import-file').setInputFiles(targetFile.destination);
 await reopenedTarget.waitForFunction(h=>document.querySelector('#digest').textContent.includes(h),targetRaw.validation.episodeSha256);
 const targetAgain=await download(reopenedTarget,'#export-button','received-target.es.json');assert.deepEqual(JSON.parse(targetAgain.data),targetRaw);
 const reopenedPair=await workbench(fresh);await openComparison(reopenedPair,pairFile.destination,pairRaw.validation.bindingSha256);
 const pairAgain=await download(reopenedPair,'#comparison-export-button','received-comparison.en-es.json');assert.deepEqual(JSON.parse(pairAgain.data),pairRaw);
 const reopenedNotes=await workbench(fresh);await reopenedNotes.locator('#localization-notes-file').setInputFiles(notesFile.destination);
 await reopenedNotes.waitForFunction(s=>document.querySelector('#localization-notes-text').value===s,notesText);
 assert.equal(await reopenedNotes.locator('#localization-notes-status').getAttribute('data-binding'),'current');assert.equal(await reopenedNotes.locator('#episode-title-input').inputValue(),target.title);
 const notesAgain=await download(reopenedNotes,'#download-localization-notes','received-localization-notes.json');assert.deepEqual(JSON.parse(notesAgain.data),JSON.parse(notesFile.data));
 const pairFromNotes=await download(reopenedNotes,'#comparison-export-button','received-notes-comparison.json');assert.deepEqual(JSON.parse(pairFromNotes.data),pairRaw);
 assert(await reopenedNotes.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await reopenedNotes.locator('#localization-notes').screenshot({path:path.join(out,'03-authored-notes-mobile.png')});
 check('Fresh contexts receive target, comparison and notes separately; each UI re-export retains exact content');
 const offline=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true});await offline.setOffline(true);offline.setDefaultTimeout(15000);
 const player=await offline.newPage();observe(player);await player.goto(pathToFileURL(playerFile.destination).href);await player.locator('#portable-status[data-state="ready"]').waitFor();
 await player.locator('#playtest-ui-language').selectOption('es');
 assert.equal(await player.locator('#playtest-title').innerText(),target.title);assert.equal(await player.locator('#playtest-story').textContent(),target.story);
 await player.locator('#portable-start').click();await player.locator('#playtest-session').waitFor({state:'visible'});await arrange(player,SOLUTION_ORDER);
 await player.locator('#playtest-answer').fill('BRUJULA');await player.locator('#playtest-answer').press('Enter');assert.match(await player.locator('#playtest-feedback').innerText(),/Intenta de nuevo la acción/);
 await player.locator('#playtest-answer').fill('BRÚJULA');await player.locator('#playtest-answer').press('Enter');assert.match(await player.locator('#playtest-feedback').innerText(),/La acción funciona/);
 for(let i=0;i<3;i++)await player.locator('#playtest-hint').click();
 const hintText=await player.locator('#playtest-hints').innerText();for(const hint of target.hints)assert(hintText.includes(hint));
 const recordFile=await download(player,'#playtest-download','completed-play-record.json'),record=await readPlaytestRecord(JSON.parse(recordFile.data));
 assert.deepEqual(record.episode,target);assert.equal(record.validation.result.summary.successfulAttempts,1);assert.equal(record.validation.result.summary.attempts,2);
 for(const key of ['humanIdentityAttested','nativeLanguageAttested','humanQualityVerified','modelContributionVerified'])assert.equal(record.evidence[key],false);
 await player.screenshot({path:path.join(out,'04-completed-player-desktop.png'),fullPage:false});await player.setViewportSize({width:390,height:844});
 assert(await player.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await player.screenshot({path:path.join(out,'05-completed-player-mobile.png'),fullPage:false});
 check('Actual downloaded HTML plays offline with the new target; accent-sensitive answer and ordered hints reach the player');
 assert.deepEqual(receipt.errors,[]);receipt.status='passed';await offline.close();await fresh.close();await context.close();
}catch(error){receipt.status='failed';receipt.failure=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();if(receiver)await new Promise(resolve=>receiver.server.close(resolve));await fs.writeFile(path.join(out,'rehearsal.json'),JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify(receipt));
