import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {CASES, PACK_VERSION, SOLUTION_ORDER} from './cases.mjs';

const output=process.argv[2];
assert(output,'Usage: node episode-packs/mapmakers-cabinet/build.mjs /new/output-directory');
assert.equal(CASES.length,3);
assert.equal(SOLUTION_ORDER.length,7);
assert.equal(new Set(SOLUTION_ORDER).size,7);
const pin=JSON.parse(await fs.readFile(new URL('./runtime-pin.json',import.meta.url),'utf8'));
assert.equal(pin.commit,'c2f0637374cd8f33efbf3a085f9a6388a69194be');
const runtimeRoot=fileURLToPath(new URL('../../episode-kit/',import.meta.url));
const instruction='Use the published casepack source commit named in BUNDLE-SOURCE.json; do not refresh the pin to bypass verification.';
const pinned=new Map();
for(const row of pin.files){
  assert(typeof row.path==='string'&&!path.posix.isAbsolute(row.path)&&!row.path.split('/').some(p=>p==='..'||p==='')&&!row.path.includes('\\'),'Unsafe runtime pin path');
  assert(!pinned.has(row.path),'Duplicate runtime pin path');
  pinned.set(row.path,row);
}
async function inventory(directory,prefix=''){
  const rows=new Map();
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(entry.name.startsWith('.')||['node_modules','__pycache__'].includes(entry.name))continue;
    const relative=prefix+entry.name,absolute=path.join(directory,entry.name);
    assert(!entry.isSymbolicLink(),'Runtime symlink: '+relative);
    if(entry.isDirectory())for(const [name,data]of await inventory(absolute,relative+'/'))rows.set(name,data);
    else if(entry.isFile())rows.set(relative,await fs.readFile(absolute));
  }
  return rows;
}
const runtime=await inventory(runtimeRoot);
assert.deepEqual([...runtime.keys()].filter(p=>p!=='MANIFEST.json').sort(),[...pinned.keys()].sort(),'Runtime file membership differs from its pin. '+instruction);
for(const [name,row]of pinned){
  const bytes=runtime.get(name);
  assert(bytes.length===row.bytes&&createHash('sha256').update(bytes).digest('hex')===row.sha256,'Runtime bytes changed: '+name+'. '+instruction);
}
if(runtime.has('MANIFEST.json')){
  const manifest=JSON.parse(runtime.get('MANIFEST.json').toString('utf8'));
  assert.deepEqual(Object.fromEntries(manifest.files.map(row=>[row.path,row])),Object.fromEntries(pinned),'Runtime package manifest differs from its pin.');
}
const [{createExport,readExport},{extractToken},{createComparisonExport,readComparisonExport},{createPortablePlayerPage}]=await Promise.all([
  import('../../episode-kit/lib/export.mjs'),import('../../episode-kit/lib/engine.mjs'),
  import('../../episode-kit/lib/comparison-export.mjs'),import('../../episode-kit/lib/portable-player-export.mjs')
]);
const bundle=JSON.parse(await fs.readFile(new URL('../../episode-kit/web/portable-player-bundle.json',import.meta.url),'utf8'));
await fs.mkdir(output,{recursive:false});
const mapping=CASES[0].cards.map(c=>({sourceId:c.id,targetId:c.id}));
const filenames=['01-en-source.json','02-es-literal-contrast.json','03-es-adapted.json'];
const tokens=['COMPASS','VREPMEC','BRÚJULA'],expected=[true,false,true];
const files=[],players=[],exports=[];
async function saveRaw(relative,data){
  const bytes=Buffer.isBuffer(data)?data:Buffer.from(data,'utf8');
  const destination=path.join(output,relative);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.writeFile(destination,bytes,{flag:'wx'});
  files.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
async function save(relative,value){await saveRaw(relative,JSON.stringify(value,null,2)+'\n');}
for(const [i,episode] of CASES.entries()){
  assert.equal(episode.cards.length,7);
  assert.deepEqual([...episode.cards.map(c=>c.id)].sort(),[...SOLUTION_ORDER].sort());
  const exported=await createExport(episode);
  assert.equal(exported.validation.result.mechanicalSuccess,expected[i]);
  assert.equal(exported.validation.result.clueOrderCount,1);
  assert.equal(exported.validation.result.permutationCount,5040);
  assert.deepEqual(exported.validation.result.solutions[0].order,SOLUTION_ORDER);
  assert.equal(extractToken(episode,SOLUTION_ORDER),tokens[i]);
  const received=await readExport(exported);
  assert.deepEqual(received.episode,episode);
  assert.equal(received.integrity.verified,true);
  await save('episodes/'+filenames[i],exported);
  exports.push(exported);
}
for(const [i,name] of [[1,'source-vs-literal.json'],[2,'source-vs-adapted.json']]){
  const exported=await createComparisonExport(CASES[0],CASES[i],mapping);
  const received=await readComparisonExport(exported);
  assert.equal(received.integrity.verified,true);
  assert.deepEqual(received.source,CASES[0]);
  assert.deepEqual(received.target,CASES[i]);
  assert.deepEqual(received.mapping,mapping);
  await save('comparisons/'+name,exported);
}
for(const [i,uiLocale,name] of [[0,'en','01-en-source.html'],[2,'es','03-es-adapted.html']]){
  const player=await createPortablePlayerPage(exports[i],bundle,{uiLocale});
  assert.equal(player.episode.id,CASES[i].id);
  assert.equal(player.episode.locale,CASES[i].locale);
  assert.equal(Buffer.byteLength(player.html,'utf8'),player.bytes);
  const file='players/'+name;
  await saveRaw(file,player.html);
  players.push({file,caseId:CASES[i].id,uiLocale,episodeSha256:player.episodeSha256,bundleSha256:player.bundleSha256});
}
const manifest={
  schema:'ludolingua.authored-casepack.v1',id:'mapmakers-cabinet',version:PACK_VERSION,
  runtime:{commit:pin.commit,packageVersion:pin.packageVersion},files,players,
  cases:CASES.map((e,i)=>({id:e.id,file:'episodes/'+filenames[i],locale:e.locale,
    intendedUse:expected[i]?'playable-authored-case':'intentional-negative-localization-contrast',
    expectedExtraction:tokens[i],requiredToken:e.action.expected,mechanicalSuccess:expected[i]})),
  limits:['Authored choices, not an automatic repair or model-inference result.',
    'Mechanical checks do not establish native-language clarity, equal difficulty, human participation or semantic equivalence.']
};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,files:files.length+1,cases:manifest.cases,players}));
