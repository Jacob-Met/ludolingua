import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeEpisode, checkAttempt } from '../../../episode-kit/lib/engine.mjs';
import { canonicalJSON, readExport } from '../../../episode-kit/lib/export.mjs';
import { compareEpisodes } from '../../../episode-kit/lib/compare.mjs';
import { readComparisonExport } from '../../../episode-kit/lib/comparison-export.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const caseRoot = fileURLToPath(new URL('../', import.meta.url));
const read = async path => JSON.parse(await readFile(resolve(caseRoot,path),'utf8'));
const names = ['en-source','es-literal','es-repaired','es-meaning-control'];
const order = ['bread','raisin','ivy','daffodil','topaz','emerald'];
const expectedLabels = [
 ['Bread','Raisin','Ivy','Daffodil','Golden topaz','Emerald'],
 ['Pan','Pasa','Hiedra','Narciso','Topacio dorado','Esmeralda'],
 ['Pan','Uva pasa','Enredadera de hiedra','Narciso','Topacio dorado','Esmeralda'],
 ['Pan','Uva fresca','Enredadera de hiedra','Narciso','Topacio dorado','Esmeralda']
];
const expectedTokens = ['BRIDGE','PPHNTE','PUENTE','PUENTE'];
const expectedClues = [
 ['bread_next_raisin','immediately_before','bread','raisin'],
 ['ivy_next_daffodil','immediately_before','ivy','daffodil'],
 ['topaz_next_emerald','immediately_before','topaz','emerald'],
 ['raisin_before_ivy','before','raisin','ivy'],
 ['daffodil_before_topaz','before','daffodil','topaz']
].map(([id,kind,left,right])=>({id,kind,left,right}));
const runtime = await read('runtime-files.json');
assert.equal(runtime.commit,'18fdb3eb5fc5c1d8d24efb698eff72bc127f72a4');
for (const entry of runtime.files) {
 const b = await readFile(resolve(root,entry.path));
 assert.equal(b.length,entry.bytes,entry.path);
 assert.equal(createHash('sha256').update(b).digest('hex'),entry.sha256,entry.path);
}
const actualFiles=[];
async function walk(path) { for (const entry of await readdir(path,{withFileTypes:true})) { const p=resolve(path,entry.name); if(entry.isDirectory()) await walk(p); else {assert(entry.isFile(),'No non-regular runtime inputs'); actualFiles.push(relative(root,p));}} }
await walk(resolve(root,'episode-kit'));
assert.deepEqual(actualFiles.filter(x=>x!=='episode-kit/MANIFEST.json').sort(),runtime.files.map(x=>x.path).sort(),'Exact pinned runtime inventory');
const oracle = spawnSync('python3',[resolve(caseRoot,'scripts/oracle.py')],{encoding:'utf8'});
assert.equal(oracle.status,0,oracle.stderr); const independent = JSON.parse(oracle.stdout);
assert.equal(independent.orders_checked,720); assert.equal(independent.solution_count,1); assert.deepEqual(independent.solution,order);
const episodes={}, results=[], cliResults=[];
function cli(args, expectedCode) {
 const r=spawnSync(process.execPath,[resolve(root,'episode-kit/cli.mjs'),...args],{encoding:'utf8'});
 assert.equal(r.status,expectedCode,JSON.stringify({args,stdout:r.stdout,stderr:r.stderr}));
 const out=JSON.parse(r.stdout); cliResults.push({args,exitCode:r.status}); return out;
}
for (let i=0;i<names.length;i++) {
 const name=names[i], ep=await read('episodes/'+name+'.json'), exported=await read('exports/'+name+'.export.json');
 episodes[name]=ep;
 assert.deepEqual(ep.cards.map(c=>c.id).sort(),[...order].sort()); assert.deepEqual(ep.clues,expectedClues);
 assert.deepEqual(order.map(id=>ep.cards.find(c=>c.id===id).label),expectedLabels[i]);
 assert.equal(ep.action.expected,i===0?'BRIDGE':'PUENTE');
 const received=await readExport(exported); assert.equal(received.integrity.verified,true);
 assert.equal(canonicalJSON(received.episode),canonicalJSON(ep));
 const result=analyzeEpisode(ep); assert.equal(result.valid,true); assert.equal(result.permutationCount,720);
 assert.equal(result.clueOrderCount,1); assert.deepEqual(result.solutions[0].order,order);
 assert.equal(result.solutions[0].token,expectedTokens[i]); assert.equal(result.mechanicalSuccess,i!==1);
 assert.equal(result.outcome,i===1?'action-mismatch':'verified');
 assert.equal(checkAttempt(ep,order,ep.action.expected).success,i!==1);
 if(i===1) assert.equal(checkAttempt(ep,order,'PPHNTE').success,false,'Submitting extracted literal token must not turn mismatch into success');
 const file=resolve(caseRoot,'exports/'+name+'.export.json');
 const checked=cli(['check',file],i===1?2:0); assert.equal(checked.mechanicalSuccess,i!==1);
 const carried=cli(['receive',file],0); assert.equal(carried.validation.result.mechanicalSuccess,i!==1);
 results.push({name,episodeSha256:received.integrity.episodeSha256,token:result.solutions[0].token,required:ep.action.expected,outcome:result.outcome,clueOrders:result.clueOrderCount});
}
const mechanism = ep=>({cards:ep.cards,clues:ep.clues,extraction:ep.extraction,action:ep.action,constraints:ep.constraints,hints:ep.hints});
const repaired=mechanism(structuredClone(episodes['es-repaired']));
repaired.cards.find(c=>c.id==='raisin').label='Uva fresca';
assert.equal(canonicalJSON(repaired),canonicalJSON(mechanism(episodes['es-meaning-control'])),'Only raisin wording changes within puzzle mechanism; metadata explicitly labels the control');
const mapping=await read('mapping.json'), comparisons=[];
for(const name of names.slice(1)) {
 const comparison=compareEpisodes(episodes['en-source'],episodes[name],mapping);
 assert.equal(comparison.valid,true); assert.equal(comparison.sameOrderSet,true);
 assert.equal(comparison.mechanicalPreserved,name!=='es-literal');
 const filename='comparisons/en-to-'+name+'.comparison.json';
 const received=await readComparisonExport(await read(filename)); assert.equal(received.integrity.verified,true);
 assert.equal(canonicalJSON(received.source),canonicalJSON(episodes['en-source']));
 assert.equal(canonicalJSON(received.target),canonicalJSON(episodes[name]));
 assert.equal(canonicalJSON(received.validation.result),canonicalJSON(comparison));
 const output=cli(['compare',resolve(caseRoot,'exports/en-source.export.json'),resolve(caseRoot,'exports/'+name+'.export.json'),resolve(caseRoot,'mapping.json')],name==='es-literal'?2:0);
 assert.equal(output.mechanicalPreserved,name!=='es-literal');
 cli(['comparison-receive',resolve(caseRoot,filename)],0);
 comparisons.push({name,sameOrderSet:true,mechanicalPreserved:comparison.mechanicalPreserved,bindingSha256:received.integrity.bindingSha256});
}
console.log(JSON.stringify({schema:'ludolingua.courier-verification.v1',runtimeFilesVerified:runtime.files.length,independent,episodes:results,comparisons,cli:cliResults,semanticControl:'Mechanically preserved; intentionally changes dried raisin to fresh grape. Semantic assessment is authored, not computed.',limitations:['No native-human playtest, equal difficulty, language fluency or provider-model benefit established.']},null,2));
