import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalEpisode} from '../lib/authoring.mjs';
import {createAdaptation} from '../lib/adaptation.mjs';
import {compareEpisodes} from '../lib/compare.mjs';
import {createDraftFile,readDraftFile} from '../lib/draft-file.mjs';
import {sourceDigest} from '../lib/export.mjs';
const original=()=>{
 const x=createOriginalEpisode({title:'  The garden  ',story:'First line\n Second line ',locale:'en',labels:['Apple','Sun','Tree'],action:'AST'},{id:'independent-garden'});
 x.revision=7;x.clues=[{id:'first',kind:'before',left:'keeper-1',right:'keeper-2'},{id:'second',kind:'before',left:'keeper-2',right:'keeper-3'}];
 x.hints=['  Look first  ','Then last'];x.hintReview={status:'author-reviewed',kind:'author-self-declaration',revision:7};x.constraints.labelsFrozen=true;x.provenance.semanticChanges=['Prior author history.'];return x;
};
test('custom original fork preserves source and exact content while establishing independent target baseline',async()=>{
 const source=original(),before=structuredClone(source);const result=await createAdaptation(source,'es',{id:'independent-spanish'});
 assert.deepEqual(source,before);assert.deepEqual(result.sourceEpisode,before);assert.equal(result.sourceSha256,await sourceDigest(before));
 const target=result.targetEpisode;assert.equal(target.id,'independent-spanish');assert.equal(target.revision,1);assert.equal(target.locale,'es');
 for(const key of ['title','story','cards','clues','hints','constraints','extraction','action'])assert.deepEqual(target[key],before[key],key);
 assert.notEqual(target.hintReview?.status,'author-reviewed');assert.equal(target.provenance.modelRun,null);assert.equal(target.provenance.humanPlaytest,null);
 assert.match(JSON.stringify(target.provenance),new RegExp(result.sourceSha256));assert.match(JSON.stringify(target.provenance),/independent-garden/);assert.match(JSON.stringify(target.provenance),/Prior author history/);
 const comparison=compareEpisodes(result.sourceEpisode,target);assert.equal(comparison.valid,true);assert.equal(comparison.sameOrderSet,true);assert.equal(comparison.mechanicalPreserved,true);
 assert.deepEqual(comparison.mapping,before.cards.map(c=>({sourceId:c.id,targetId:c.id})));
 const edit=structuredClone(target);edit.revision++;edit.title='';edit.cards[0].label='';edit.action.expected='';
 const saved=await createDraftFile(target,edit,'target-draft',target.hints.join('\n'));const opened=await readDraftFile(saved);
 assert.deepEqual(opened.sourceEpisode,target);assert.deepEqual(opened.episode,edit);assert.equal(opened.episode.locale,'es');
 target.cards[0].label='Target mutation';result.sourceEpisode.story='Returned source mutation';assert.deepEqual(source,before);
});
test('fork captures exact source before hashing yields',async()=>{
 const source=original(),before=structuredClone(source);const pending=createAdaptation(source,'es',{id:'snapshot-target'});source.title='Newer';source.cards[0].label='Changed';
 const result=await pending;assert.deepEqual(result.sourceEpisode,before);assert.equal(result.targetEpisode.title,before.title);assert.deepEqual(result.targetEpisode.cards,before.cards);
});
test('invalid fork intents leave input unchanged',async()=>{
 for(const [locale,id,mutate]of [['en','new',()=>{}],['fr','new',()=>{}],['es','',()=>{}],['es','independent-garden',()=>{}],['es','new',x=>x.cards[0].label='']]){
  const source=original();mutate(source);const before=structuredClone(source);await assert.rejects(()=>createAdaptation(source,locale,{id}));assert.deepEqual(source,before);
 }
});
test('mechanical negative source remains admissible and cannot acquire a success claim',async()=>{
 const source=original();source.clues=[];const result=await createAdaptation(source,'es',{id:'ambiguous-target'});const comparison=compareEpisodes(result.sourceEpisode,result.targetEpisode);
 assert.equal(comparison.valid,true);assert.equal(comparison.sameOrderSet,true);assert.equal(comparison.mechanicalPreserved,false);assert.equal(comparison.target.uniqueReasoning,false);
});
test('Spanish source can become English target without translating raw source wording',async()=>{
 const source=original();source.locale='es';source.title='El jardín';source.story='Ordena las tarjetas.';
 const {sourceEpisode,targetEpisode}=await createAdaptation(source,'en',{id:'english-target'});
 assert.equal(sourceEpisode.locale,'es');assert.equal(targetEpisode.locale,'en');assert.equal(targetEpisode.title,'El jardín');assert.equal(targetEpisode.story,'Ordena las tarjetas.');
 assert.match(targetEpisode.provenance.semanticChanges.at(-1),/not translated/);
});
