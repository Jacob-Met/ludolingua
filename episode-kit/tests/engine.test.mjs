import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_VERSION, validateEpisode, analyzeEpisode, extractToken, clueText, checkAttempt } from '../lib/engine.mjs';

// Independently authored fixtures: expected values are fixed, not derived by a second solver.
function episode(locale = 'en') {
  return {schema:'ludolingua.episode.v1',id:'independent-oracle',revision:1,locale,
    title:'Four plaques',story:'Order the plaques, read their initials, then act.',
    cards:['key','bell','moon','star'].map((id,i)=>({id,label:(locale==='en'?['Otter','Pine','Eagle','Nest']:['Agua','Barco','Roca','Estrella'])[i]})),
    clues:[{id:'adjacent',kind:'immediately_before',left:'bell',right:'moon'},{id:'earlier',kind:'before',left:'key',right:'bell'},{id:'later',kind:'after',left:'star',right:'moon'}],
    extraction:{kind:'first_letter',normalization:'NFC-uppercase'},action:{expected:locale==='en'?'OPEN':'ABRE',answerNormalization:'NFC-trim-uppercase'},
    constraints:{labelsFrozen:false,requireUnique:true},hints:['Find the adjacent pair.'],
    provenance:{kind:'authored',source:'independent receiving oracle',modelRun:null,humanPlaytest:null,semanticChanges:locale==='es'?['Label meanings changed.']:[]}};
}
const order=['key','bell','moon','star'];
function counts(e,c,a,outcome,success){const r=analyzeEpisode(e);assert.equal(r.valid,true);assert.equal(r.clueOrderCount,c);assert.equal(r.actionMatchCount,a);assert.equal(r.outcome,outcome);assert.equal(r.mechanicalSuccess,success);return r;}

test('original and coordinated adaptation have independently known unique solution',()=>{
  assert.equal(ENGINE_VERSION,'0.1.0');
  for(const locale of ['en','es']){const e=episode(locale),r=counts(e,1,1,'verified',true);assert.equal(r.permutationCount,24);assert.equal(r.uniqueReasoning,true);assert.deepEqual(r.solutions.map(s=>s.order),[order]);assert.equal(r.solutions[0].token,locale==='en'?'OPEN':'ABRE');assert.equal(extractToken(e,order),e.action.expected);}
});
test('literal translation fails action while keeping valid ordering; frozen proof is explicit',()=>{
  const e=episode('es');e.cards.forEach((c,i)=>c.label=['Nutria','Pino','Águila','Nido'][i]);
  const r=counts(e,1,0,'action-mismatch',false);assert.equal(r.solutions[0].token,'NPÁN');assert.equal(r.frozenWitness,null);
  e.constraints.labelsFrozen=true;const f=counts(e,1,0,'action-mismatch',false);assert.ok(f.frozenWitness);assert.deepEqual([...f.frozenWitness.available].sort(),['N','P','Á','N'].sort());for(const letter of ['B','R','E'])assert.ok(f.frozenWitness.missing.includes(letter));assert.equal(typeof f.frozenWitness.scope,'string');assert.ok(f.frozenWitness.scope.length);
});
test('answer filtering cannot manufacture unique discovery from twelve orders',()=>{
  const e=episode();e.clues=[e.clues[1]];const r=counts(e,12,1,'ambiguous',false);assert.equal(r.uniqueReasoning,false);assert.equal(r.solutions.length,12);
  e.action.expected='ZZZZ';assert.equal(analyzeEpisode(e).clueOrderCount,12);
});
test('contradiction is distinct from action mismatch',()=>{const e=episode();e.clues.push({id:'cycle',kind:'before',left:'star',right:'key'});counts(e,0,0,'inconsistent',false);});
test('before permits twelve orders; immediately-before permits six',()=>{
  const e=episode();e.clues=[{id:'relation',kind:'before',left:'bell',right:'moon'}];assert.equal(analyzeEpisode(e).clueOrderCount,12);
  const broadText=clueText(e,e.clues[0]);e.clues[0].kind='immediately_before';assert.equal(analyzeEpisode(e).clueOrderCount,6);assert.notEqual(clueText(e,e.clues[0]),broadText);
  const s=episode('es');s.clues=[{...e.clues[0],kind:'before'}];const spanish=clueText(s,s.clues[0]);s.clues[0].kind='immediately_before';assert.notEqual(clueText(s,s.clues[0]),spanish);
});
test('nonunique mode requires every clue order to match, not merely one',()=>{
  const e=episode();e.clues=[e.clues[1]];e.constraints.requireUnique=false;const r=analyzeEpisode(e);assert.equal(r.clueOrderCount,12);assert.equal(r.actionMatchCount,1);assert.equal(r.mechanicalSuccess,false);
  e.cards.forEach(c=>c.label='Apple');e.action.expected='AAAA';const all=analyzeEpisode(e);assert.equal(all.clueOrderCount,12);assert.equal(all.actionMatchCount,12);assert.equal(all.mechanicalSuccess,true);
});
test('NFC and trimmed Unicode initials preserve accents; uppercase expansion stays honest',()=>{
  const e=episode();e.cards[0].label='  a\u0301rbol  ';e.action.expected='ÁPEN';assert.equal(extractToken(e,order),'ÁPEN');counts(e,1,1,'verified',true);
  e.cards[0].label='ßeta';e.action.expected='SSPEN';e.constraints.labelsFrozen=true;assert.equal(extractToken(e,order),'SSPEN');const r=counts(e,1,1,'verified',true);assert.equal(r.frozenWitness,null);
});
test('full permutation required; invalid attempts never throw or succeed',()=>{
  const e=episode();for(const bad of [null,[],['key','bell','moon'],['key','bell','moon','moon'],['key','bell','moon','unknown']]){assert.throws(()=>extractToken(e,bad));const r=checkAttempt(e,bad,'OPEN');assert.equal(r.success,false);assert.equal(r.orderValid,false);assert.equal(r.token,'');}
  assert.equal(checkAttempt(e,order,' open ').success,true);assert.equal(checkAttempt(e,order,'CLOSE').success,false);assert.equal(checkAttempt(e,['star','moon','bell','key'],'OPEN').success,false);
});
test('editing Roca to Piedra invalidates current action',()=>{const e=episode('es');counts(e,1,1,'verified',true);e.cards[2].label='Piedra';e.revision++;const r=counts(e,1,0,'action-mismatch',false);assert.equal(r.solutions[0].token,'ABPE');});
test('JSON malformed inputs are rejected without validator exceptions',()=>{
  const mutations=[e=>e.cards.push({...e.cards[0]}),e=>e.cards[0].label='',e=>e.cards[0].label='123',e=>e.clues[0].left='missing',e=>e.clues[0].right=e.clues[0].left,e=>e.clues[0].kind='maybe_before',e=>e.locale='xx',e=>e.revision=0,e=>e.extraction.normalization='strip-accents',e=>e.action.answerNormalization='anything',e=>e.constraints.requireUnique='true',e=>e.cards=Array.from({length:9},(_,i)=>({id:`card${i}`,label:'Apple'}))];
  for(const value of [null,[],{},42,'episode',...mutations.map(m=>{const e=episode();m(e);return e;})]){let r;assert.doesNotThrow(()=>r=validateEpisode(value));assert.equal(r.valid,false);assert.ok(r.errors.length);assert.equal(analyzeEpisode(value).mechanicalSuccess,false);}
});
