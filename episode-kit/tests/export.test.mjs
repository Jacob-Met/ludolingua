import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJSON, sourceDigest, createExport, readExport } from '../lib/export.mjs';

function episode(){return {schema:'ludolingua.episode.v1',id:'export-oracle',revision:1,locale:'es',title:'Plaques',story:'Order and read.',cards:[{id:'key',label:'Agua'},{id:'bell',label:'Barco'},{id:'moon',label:'Roca'},{id:'star',label:'Estrella'}],clues:[{id:'a',kind:'immediately_before',left:'bell',right:'moon'},{id:'b',kind:'before',left:'key',right:'bell'},{id:'c',kind:'after',left:'star',right:'moon'}],extraction:{kind:'first_letter',normalization:'NFC-uppercase'},action:{expected:'ABRE',answerNormalization:'NFC-trim-uppercase'},constraints:{labelsFrozen:false,requireUnique:true},hints:['Find the pair.'],provenance:{kind:'authored',source:'independent export oracle',modelRun:null,humanPlaytest:null,semanticChanges:['Changed meanings.']}};}
const copy=x=>structuredClone(x);
async function rejected(value){await assert.rejects(async()=>readExport(value));}

test('canonical JSON independently specified; SHA uses those exact bytes',async()=>{
  const value={z:[{b:2,a:1},'á'],a:{y:false,x:null}};
  const expected='{"a":{"x":null,"y":false},"z":[{"a":1,"b":2},"á"]}';
  assert.equal(canonicalJSON(value),expected);
  assert.equal(await sourceDigest(value),createHash('sha256').update(expected,'utf8').digest('hex'));
  assert.equal(canonicalJSON({b:2,a:1}),canonicalJSON({a:1,b:2}));assert.notEqual(canonicalJSON([1,2]),canonicalJSON([2,1]));
});
test('roundtrip recomputes authentic current result and retains unresolved provenance',async()=>{
  const e=episode(),bundle=await createExport(e);assert.equal(bundle.schema,'ludolingua.episode-export.v1');assert.equal(bundle.validation.result.clueOrderCount,1);assert.equal(bundle.validation.result.actionMatchCount,1);assert.equal(bundle.validation.result.mechanicalSuccess,true);assert.ok(bundle.evidence && typeof bundle.evidence==='object');
  for(const input of [bundle,JSON.stringify(bundle)]){const received=await readExport(input);assert.deepEqual(received.episode,e);assert.equal(received.integrity.verified,true);assert.equal(received.integrity.episodeSha256,await sourceDigest(e));assert.equal(received.episode.provenance.modelRun,null);assert.equal(received.episode.provenance.humanPlaytest,null);}
});
test('all attribution, clues, hints and content are digest-bound',async()=>{
  const original=await createExport(episode());
  for(const mutate of [e=>e.cards[2].label='Piedra',e=>e.hints.push('New hint'),e=>e.provenance.source='different source',e=>e.provenance.semanticChanges.push('Undisclosed change'),e=>e.title='Different title',e=>e.story='Different story',e=>e.clues[0].kind='before',e=>e.revision++]){const b=copy(original);mutate(b.episode);assert.notEqual(await sourceDigest(b.episode),original.validation.episodeSha256);await rejected(b);}
});
test('forged validation and engine version rejected even when content digest unchanged',async()=>{
  const original=await createExport(episode());
  for(const mutate of [b=>b.validation.result.clueOrderCount=99,b=>b.validation.result.actionMatchCount=99,b=>b.validation.result.mechanicalSuccess=false,b=>b.validation.result.outcome='ambiguous',b=>b.validation.engineVersion='999.0.0',b=>b.validation.result.engineVersion='999.0.0',b=>b.validation.episodeSha256='0'.repeat(64)]){const b=copy(original);mutate(b);await rejected(b);}
});
test('digest repair alone cannot rescue stale success after edit',async()=>{
  const b=await createExport(episode());b.episode.cards[2].label='Piedra';b.episode.revision++;b.validation.episodeSha256=await sourceDigest(b.episode);await rejected(b);
  const fresh=await createExport(b.episode);assert.equal(fresh.validation.result.mechanicalSuccess,false);assert.equal(fresh.validation.result.clueOrderCount,1);assert.equal(fresh.validation.result.actionMatchCount,0);assert.equal(fresh.validation.result.outcome,'action-mismatch');const received=await readExport(fresh);assert.equal(received.integrity.verified,true);assert.equal(received.validation.result.mechanicalSuccess,false);
});
test('extra passed claims never replace recomputed analysis',async()=>{
  const e=episode();e.cards[2].label='Piedra';e.validation={mechanicalSuccess:true};e.certified=true;const b=await createExport(e);assert.equal(b.validation.result.mechanicalSuccess,false);assert.equal(b.validation.result.actionMatchCount,0);
});
test('malformed imports, unsupported schemas and invalid episodes rejected',async()=>{
  for(const value of ['{','null',null,[],{},42,{schema:'other'}])await rejected(value);
  const original=await createExport(episode());for(const mutate of [b=>b.schema='other',b=>delete b.validation,b=>b.episode.cards[0].id='bell',b=>b.episode.clues[0].left='missing']){const b=copy(original);mutate(b);await rejected(b);}
  const invalid=episode();invalid.cards=[];await assert.rejects(async()=>createExport(invalid));
});

test('received review evidence cannot be silently upgraded to certification',async()=>{
  const original=await createExport(episode());
  const altered=copy(original);altered.evidence.nativeLanguageCertified=true;altered.evidence.actualModelInference=true;await rejected(altered);
  const missing=copy(original);delete missing.evidence;await rejected(missing);
});
