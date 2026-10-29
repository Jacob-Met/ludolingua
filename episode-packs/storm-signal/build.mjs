import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CASES,PACK_VERSION} from './cases.mjs';
import {analyzeEpisode,extractToken} from '../../episode-kit/lib/engine.mjs';
import {createExport,readExport} from '../../episode-kit/lib/export.mjs';
import {createComparisonExport,readComparisonExport} from '../../episode-kit/lib/comparison-export.mjs';

const destination=process.argv[2];
assert(destination,'Usage: node episode-packs/storm-signal/build.mjs /new/output-directory');
await fs.mkdir(destination,{recursive:false});
const pin=JSON.parse(await fs.readFile(new URL('./runtime-pin.json',import.meta.url),'utf8'));
const mapping=CASES[0].cards.map(x=>({sourceId:x.id,targetId:x.id}));
const names=['01-en-source.json','02-es-literal.json','03-es-adapted.json','04-es-ambiguous.json'];
const tokens=['ALERT','ALEST','AVISO','AVISO'];
const passes=[true,false,true,false];
const manifests=[];
async function save(relative,payload){
 const bytes=Buffer.from(JSON.stringify(payload,null,2)+'\n');
 const file=path.join(destination,relative);
 await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.writeFile(file,bytes,{flag:'wx'});
 manifests.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
for(let i=0;i<CASES.length;i++){
 const e=CASES[i],a=analyzeEpisode(e);
 assert.equal(a.permutationCount,120);
 assert.equal(a.clueOrderCount,i===3?3:1);
 assert.equal(a.mechanicalSuccess,passes[i]);
 assert.equal(extractToken(e,e.cards.map(x=>x.id)),tokens[i]);
 const exported=await createExport(e);
 assert.deepEqual((await readExport(exported)).episode,e);
 await save('episodes/'+names[i],exported);
}
for(const [i,name,passed] of [[1,'source-vs-literal.json',false],[2,'source-vs-adapted.json',true],[3,'source-vs-ambiguous.json',false]]){
 const exported=await createComparisonExport(CASES[0],CASES[i],mapping);
 assert.equal(exported.validation.result.sameOrderSet,i!==3);
 assert.equal(exported.validation.result.mechanicalPreserved,passed);
 assert.equal((await readComparisonExport(exported)).integrity.verified,true);
 await save('comparisons/'+name,exported);
}
const files=[...manifests];
await save('manifest.json',{schema:'ludolingua.authored-casepack.v1',id:'storm-signal',version:PACK_VERSION,source:pin,files,cases:CASES.map((e,i)=>({id:e.id,path:'episodes/'+names[i],locale:e.locale,expectedToken:tokens[i],requiredAction:e.action.expected,mechanicalSuccess:passes[i]})),limitations:['Authored mechanical evidence only; no model inference or human/native-language testing.','Equivalent difficulty, language clarity, cultural suitability and semantic equivalence remain unverified.']});
console.log(JSON.stringify({destination,cases:CASES.length,files:manifests.length}));
