import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginalEpisode } from '../lib/authoring.mjs';
import { createDraftFile, readDraftFile } from '../lib/draft-file.mjs';
import { validateEpisode } from '../lib/engine.mjs';
const original=()=>createOriginalEpisode({title:'El jardín',story:'Encuentra la salida.',locale:'es',labels:['Árbol','Sol'],action:'ÁS'},{id:'independent-original'});
const unfinished=source=>{const e=structuredClone(source);e.revision++;e.title='';e.story='\n unfinished \n';e.cards[0].label='';e.cards[1].label='   ';e.action.expected='';e.hints=['  pista  '];return e;};
test('portable original survives serialization with unfinished exact inputs and no mechanical success',async()=>{
 const source=original(),edit=unfinished(source),hint='\n  pista  \n\n';
 const file=await createDraftFile(source,edit,'independent-token',hint);
 const result=await readDraftFile(JSON.stringify(file));
 assert.deepEqual(result.sourceEpisode,source);assert.deepEqual(result.episode,edit);assert.equal(result.hintText,hint);
 assert.equal(validateEpisode(result.episode).valid,false);
 assert.equal('verification' in result.episode,false);assert.equal('mechanical' in result,false);
 const next=structuredClone(result.episode);next.revision++;next.story='Second edit after recovery';
 const again=await readDraftFile(JSON.stringify(await createDraftFile(result.sourceEpisode,next,'second-token',hint)));
 assert.deepEqual(again.episode,next);assert.deepEqual(again.sourceEpisode,source);
});
test('file corruption and injected approval never become a recovered episode',async()=>{
 const source=original(),file=await createDraftFile(source,unfinished(source),'negative-token','\n  pista  \n');
 for(const mutate of [x=>x.draft.cards[0].label='Forged',x=>x.sourceEpisode.story='Other source',x=>x.sourceSha256='0'.repeat(64),x=>x.schema='future-v99',x=>x.verification={approved:true},x=>x.draft.verification={approved:true}]){
  const copy=structuredClone(file);mutate(copy);await assert.rejects(()=>readDraftFile(JSON.stringify(copy)));
 }
 await assert.rejects(()=>readDraftFile('{broken'));await assert.rejects(()=>readDraftFile('null'));
});
test('immutable author identity cannot be smuggled through a draft',async()=>{
 const source=original(),edit=unfinished(source);edit.locale='en';
 await assert.rejects(()=>createDraftFile(source,edit,'immutable','\n  pista  \n'));
});
test('capture freezes inputs before its asynchronous hashing begins',async()=>{
 const source=original(),edit=unfinished(source),expected=structuredClone(edit);
 const pending=createDraftFile(source,edit,'snapshot','\n  pista  \n');
 edit.story='Mutation while saving';source.story='Changed source';
 const recovered=await readDraftFile(await pending);assert.deepEqual(recovered.episode,expected);assert.equal(recovered.sourceEpisode.story,'Encuentra la salida.');
});
test('rehashed envelope cannot detach record from its original source or accept invalid source',async()=>{
 const {sourceDigest}=await import('../lib/export.mjs');
 const source=original(),file=await createDraftFile(source,unfinished(source),'bound','\n  pista  \n');
 for(const invalid of [false,true]){
  const x=structuredClone(file);x.sourceEpisode.story='Different original';
  if(invalid)x.sourceEpisode.cards[0].label='';
  x.sourceSha256=await sourceDigest(x.sourceEpisode);
  const {contentSha256,...body}=x;x.contentSha256=await sourceDigest(body);
  await assert.rejects(()=>readDraftFile(x));
 }
});
