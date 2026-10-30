import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalEpisode} from '../lib/authoring.mjs';
import {createComparisonExport} from '../lib/comparison-export.mjs';
import {createLocalizationNotes,readLocalizationNotes} from '../lib/localization-notes.mjs';
async function pair(negative=false){
 const source=createOriginalEpisode({title:'Garden',story:'Arrange the garden.',locale:'en',labels:['Apple','Sun'],action:'AS'},{id:'notes-original'});
 source.clues=[{id:'order',kind:'before',left:'keeper-1',right:'keeper-2'}];
 const target=structuredClone(source);target.id='notes-target';target.locale='es';target.cards[0].label='Agua';target.cards[1].label='Sol';if(negative)target.action.expected='NO';
 return createComparisonExport(source,target);
}
test('nonblank exact note limits reject empty or oversized author input without changing pair',async()=>{
 const checked=await pair(),before=structuredClone(checked);
 for(const text of ['', ' \n\t ', 'x'.repeat(20001),null,{}])await assert.rejects(()=>createLocalizationNotes(checked,text));
 const accepted=await createLocalizationNotes(checked,'x'.repeat(20000));await readLocalizationNotes(JSON.stringify(accepted));assert.deepEqual(checked,before);
});
test('corrupt comparison cannot acquire a notes wrapper',async()=>{
 const checked=await pair();
 for(const mutate of [x=>x.target.cards[0].label='Changed',x=>x.validation.result.mechanicalPreserved=false,x=>x.evidence.nativeHumanPlaytestVerified=true]){
  const bad=structuredClone(checked);mutate(bad);await assert.rejects(()=>createLocalizationNotes(bad,'Author observation'));
 }
});
test('exact author notes travel with unchanged complete pair, including honest mechanical failure',async()=>{
 for(const negative of [false,true]){
  const checked=await pair(negative),before=structuredClone(checked),text='\n  Agua is a changed referent, not a literal apple.\n\nMeaning needs review.  \n';
  const file=await createLocalizationNotes(checked,text),opened=await readLocalizationNotes(JSON.stringify(file));
  assert.deepEqual(opened,file);assert.deepEqual(opened.comparison,before);assert.equal(opened.notesText,text);assert.equal(opened.comparison.validation.result.mechanicalPreserved,!negative);
  assert.equal(opened.comparison.evidence.nativeHumanPlaytestVerified,false);assert.equal(opened.comparison.evidence.modelContributionVerified,false);assert.deepEqual(checked,before);
 }
});
test('both creation and reading snapshot mutable inputs before hashing yields',async()=>{
 const checked=await pair(),before=structuredClone(checked);const pending=createLocalizationNotes(checked,'Exact note');checked.target.story='Later mutation';
 const file=await pending;assert.deepEqual(file.comparison,before);
 const expected=structuredClone(file),reading=readLocalizationNotes(file);file.notesText='Later notes';file.comparison.source.story='Mutated source';assert.deepEqual(await reading,expected);
});
test('corruption, injected approval and rehashed false nested comparison are refused',async()=>{
 const {sourceDigest}=await import('../lib/export.mjs');const file=await createLocalizationNotes(await pair(),'Exact note');
 for(const mutate of [x=>x.notesText='Altered note',x=>x.comparison.source.story='Altered source',x=>x.contentSha256='0'.repeat(64),x=>x.schema='future',x=>x.approved=true]){
  const bad=structuredClone(file);mutate(bad);await assert.rejects(()=>readLocalizationNotes(bad));
 }
 for(const mutate of [x=>x.comparison.evidence.nativeHumanPlaytestVerified=true,x=>x.comparison.validation.result.mechanicalPreserved=false,x=>x.evidence.approved=true]){
  const bad=structuredClone(file);mutate(bad);const {contentSha256,...body}=bad;bad.contentSha256=await sourceDigest(body);await assert.rejects(()=>readLocalizationNotes(bad));
 }
 for(const raw of ['{broken','null','[]'])await assert.rejects(()=>readLocalizationNotes(raw));
});
