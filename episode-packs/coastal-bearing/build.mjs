import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CASES, PACK_VERSION} from './cases.mjs';
import {createExport, readExport} from '../../episode-kit/lib/export.mjs';
import {extractToken} from '../../episode-kit/lib/engine.mjs';
import {createComparisonExport, readComparisonExport} from '../../episode-kit/lib/comparison-export.mjs';

const output=process.argv[2];
assert(output,'Usage: node episode-packs/coastal-bearing/build.mjs /new/output-directory');
await fs.mkdir(output,{recursive:false});
const pin=JSON.parse(await fs.readFile(new URL('./runtime-pin.json',import.meta.url),'utf8'));
const mapping=CASES[0].cards.map(c=>({sourceId:c.id,targetId:c.id}));
const filenames=['01-en-source.json','02-es-literal-contrast.json','03-es-adapted.json'];
const tokens=['NORTH','NORTP','NORTE'],expected=[true,false,true],files=[];
async function save(relative,value){
  const data=Buffer.from(JSON.stringify(value,null,2)+'\n');
  const destination=path.join(output,relative);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.writeFile(destination,data,{flag:'wx'});
  files.push({path:relative,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
for(const [i,episode] of CASES.entries()){
  const exported=await createExport(episode);
  assert.equal(exported.validation.result.mechanicalSuccess,expected[i]);
  assert.equal(exported.validation.result.clueOrderCount,1);
  assert.equal(exported.validation.result.permutationCount,120);
  assert.equal(extractToken(episode,episode.cards.map(c=>c.id)),tokens[i]);
  const received=await readExport(exported);
  assert.deepEqual(received.episode,episode);assert.equal(received.integrity.verified,true);
  await save('episodes/'+filenames[i],exported);
}
for(const [i,name] of [[1,'source-vs-literal.json'],[2,'source-vs-adapted.json']]){
  const exported=await createComparisonExport(CASES[0],CASES[i],mapping);
  const received=await readComparisonExport(exported);
  assert.equal(received.integrity.verified,true);
  assert.deepEqual(received.source,CASES[0]);assert.deepEqual(received.target,CASES[i]);assert.deepEqual(received.mapping,mapping);
  await save('comparisons/'+name,exported);
}
const manifest={
  schema:'ludolingua.authored-casepack.v1',id:'coastal-bearing',version:PACK_VERSION,
  runtime:{commit:pin.commit,packageVersion:pin.packageVersion},files,
  cases:CASES.map((e,i)=>({id:e.id,file:'episodes/'+filenames[i],locale:e.locale,intendedUse:expected[i]?'playable-authored-case':'intentional-negative-localization-contrast',expectedExtraction:tokens[i],requiredBearing:e.action.expected,mechanicalSuccess:expected[i]})),
  limits:['Authored choices, not an automatic repair or model-inference result.','Mechanical checks do not establish native-language clarity, equal difficulty, human participation or semantic equivalence.']
};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,files:files.length+1,cases:manifest.cases}));
