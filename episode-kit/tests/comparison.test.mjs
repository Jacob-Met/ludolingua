import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARISON_ENGINE_VERSION, compareEpisodes } from '../lib/compare.mjs';
import { createComparisonExport, readComparisonExport } from '../lib/comparison-export.mjs';

function fixture(locale='en') {return {schema:'ludolingua.episode.v1',id:`independent-compare-${locale}`,revision:1,locale,title:'Independent cards',story:'Find the order and read initials.',cards:['key','bell','moon','star'].map((id,i)=>({id,label:(locale==='en'?['Otter','Pine','Eagle','Nest']:['Agua','Barco','Roca','Estrella'])[i]})),clues:[{id:'pair',kind:'immediately_before',left:'bell',right:'moon'},{id:'lead',kind:'before',left:'key',right:'bell'},{id:'tail',kind:'after',left:'star',right:'moon'}],extraction:{kind:'first_letter',normalization:'NFC-uppercase'},action:{expected:locale==='en'?'OPEN':'ABRE',answerNormalization:'NFC-trim-uppercase'},constraints:{labelsFrozen:false,requireUnique:true},hints:['Find the adjacent pair.'],provenance:{kind:'authored',source:'Independent comparison oracle',modelRun:null,humanPlaytest:null,semanticChanges:[]}};}
const correct=['key','bell','moon','star'];
const clone=x=>structuredClone(x);
async function rejects(value){await assert.rejects(async()=>readComparisonExport(value));}

test('same clue-order set preserves encoded mechanics across coordinated EN/ES labels',()=>{
  assert.equal(COMPARISON_ENGINE_VERSION,'0.1.0');const s=fixture(),t=fixture('es'),before=JSON.stringify([s,t]);const r=compareEpisodes(s,t);
  assert.equal(r.valid,true);assert.equal(r.sameOrderSet,true);assert.equal(r.mechanicalPreserved,true);assert.equal(r.sourceOnlyCount,0);assert.equal(r.targetOnlyCount,0);assert.equal(r.sourceOnlyWitness,null);assert.equal(r.targetOnlyWitness,null);assert.equal(r.roleChanges.filter(x=>x.labelChanged).length,4);assert.equal(JSON.stringify([s,t]),before);
});
test('equal counts with opposite unique orders must not pass comparison',()=>{
  const s=fixture(),t=fixture();t.clues=[{id:'a',kind:'before',left:'star',right:'moon'},{id:'b',kind:'immediately_before',left:'moon',right:'bell'},{id:'c',kind:'before',left:'bell',right:'key'}];t.action.expected='NEPO';const r=compareEpisodes(s,t);
  assert.equal(r.source.clueOrderCount,1);assert.equal(r.target.clueOrderCount,1);assert.equal(r.source.mechanicalSuccess,true);assert.equal(r.target.mechanicalSuccess,true);assert.equal(r.sameOrderSet,false);assert.equal(r.mechanicalPreserved,false);assert.equal(r.sourceOnlyCount,1);assert.equal(r.targetOnlyCount,1);assert.deepEqual(r.sourceOnlyWitness.sourceOrder,correct);assert.deepEqual(r.targetOnlyWitness.sourceOrder,['star','moon','bell','key']);
});
test('redundant or inverse-syntax relations preserve the order set',()=>{
  const s=fixture(),t=fixture();t.clues.push({id:'redundant',kind:'before',left:'key',right:'star'});let r=compareEpisodes(s,t);assert.equal(r.sameOrderSet,true);assert.equal(r.mechanicalPreserved,true);assert.equal(r.clueChanges.targetOnly.length,1);
  t.clues=clone(s.clues);t.clues[1]={id:'inverse',kind:'after',left:'bell',right:'key'};r=compareEpisodes(s,t);assert.equal(r.sameOrderSet,true);assert.equal(r.mechanicalPreserved,true);assert.equal(r.clueChanges.sourceOnly.length,1);assert.equal(r.clueChanges.targetOnly.length,1);
});
test('missing clues retain all twelve candidate orders despite one matching action',()=>{
  const s=fixture(),t=fixture();t.clues=[t.clues[1]];const r=compareEpisodes(s,t);assert.equal(r.source.clueOrderCount,1);assert.equal(r.target.clueOrderCount,12);assert.equal(r.target.actionMatchCount,1);assert.equal(r.sourceOnlyCount,0);assert.equal(r.targetOnlyCount,11);assert.equal(r.sameOrderSet,false);assert.equal(r.mechanicalPreserved,false);assert.notDeepEqual(r.targetOnlyWitness.sourceOrder,correct);
});
test('explicit renamed-role bijection compares actual mapped orders',()=>{
  const s=fixture(),t=fixture('es'),names={key:'llave',bell:'campana',moon:'luna',star:'estrella'},mapping=Object.entries(names).map(([sourceId,targetId])=>({sourceId,targetId}));
  t.cards.forEach(c=>c.id=names[c.id]);t.clues.forEach(c=>{c.left=names[c.left];c.right=names[c.right];});assert.equal(compareEpisodes(s,t).valid,false);
  const r=compareEpisodes(s,t,mapping);assert.equal(r.valid,true);assert.equal(r.sameOrderSet,true);assert.equal(r.mechanicalPreserved,true);assert.equal(r.sourceOnlyCount,0);assert.equal(r.targetOnlyCount,0);assert.deepEqual(r.clueChanges,{sourceOnly:[],targetOnly:[]});
});
test('invalid and incomplete mappings never certify preservation',()=>{
  const s=fixture(),t=fixture('es'),full=s.cards.map(c=>({sourceId:c.id,targetId:c.id}));
  for(const m of [null,{},[],full.slice(1),[...full,full[0]],full.map((p,i)=>i===0?{...p,targetId:'bell'}:p),full.map((p,i)=>i===0?{...p,sourceId:'missing'}:p)]){const r=compareEpisodes(s,t,m);assert.equal(r.valid,false);assert.equal(r.sameOrderSet,false);assert.equal(r.mechanicalPreserved,false);assert.ok(r.errors.length);assert.equal(r.sourceOnlyWitness,null);assert.equal(r.targetOnlyWitness,null);}
});
test('two contradictory episodes have equal empty sets but no preserved puzzle',()=>{
  const s=fixture();s.clues.push({id:'cycle',kind:'before',left:'star',right:'key'});const t=clone(s);const r=compareEpisodes(s,t);assert.equal(r.valid,true);assert.equal(r.source.clueOrderCount,0);assert.equal(r.target.clueOrderCount,0);assert.equal(r.sameOrderSet,true);assert.equal(r.mechanicalPreserved,false);
});
test('literal Spanish retains order structure while action fails',()=>{
  const s=fixture(),t=fixture('es');t.cards.forEach((c,i)=>c.label=['Nutria','Pino','Águila','Nido'][i]);const r=compareEpisodes(s,t);assert.equal(r.sameOrderSet,true);assert.equal(r.source.mechanicalSuccess,true);assert.equal(r.target.actionMatchCount,0);assert.equal(r.mechanicalPreserved,false);
});
test('comparison export roundtrip binds both complete episodes and mapping',async()=>{
  const s=fixture(),t=fixture('es'),bundle=await createComparisonExport(s,t);assert.equal(bundle.schema,'ludolingua.comparison-export.v1');assert.equal(bundle.validation.result.mechanicalPreserved,true);
  for(const value of [bundle,JSON.stringify(bundle)]){const r=await readComparisonExport(value);assert.equal(r.integrity.verified,true);assert.deepEqual(r.source,s);assert.deepEqual(r.target,t);assert.equal(r.validation.result.mechanicalPreserved,true);}
  for(const side of ['source','target'])for(const mutate of [e=>e.hints.push('A changed hint'),e=>e.story='Different story',e=>e.provenance.source='New attribution',e=>e.provenance.semanticChanges.push('Changed meaning'),e=>e.revision++,e=>e.cards[2].label='Piedra']){const b=clone(bundle);mutate(b[side]);await rejects(b);}
  const mapped=await createComparisonExport(s,t,s.cards.map(c=>({sourceId:c.id,targetId:c.id})));mapped.mapping[0].targetId='star';await rejects(mapped);
});
test('current negative comparison may verify integrity but false preservation cannot',async()=>{
  const s=fixture(),t=fixture('es');t.cards[2].label='Piedra';const bundle=await createComparisonExport(s,t);assert.equal(bundle.validation.result.mechanicalPreserved,false);const r=await readComparisonExport(bundle);assert.equal(r.integrity.verified,true);assert.equal(r.validation.result.mechanicalPreserved,false);
  const forged=clone(bundle);forged.validation.result.mechanicalPreserved=true;await rejects(forged);const fakeVersion=clone(bundle);fakeVersion.validation.comparisonEngineVersion='999.0.0';await rejects(fakeVersion);const fakeEvidence=clone(bundle);fakeEvidence.evidence={nativeLanguageCertified:true};await rejects(fakeEvidence);
});
