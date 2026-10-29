import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { validateEpisode } from '../lib/engine.mjs';
import { DRAFT_SCHEMA, captureDraft, draftKey, readDraft, writeDraft } from '../lib/drafts.mjs';

const SHA = 'a'.repeat(64);
const source = () => structuredClone(EPISODES.find(e => e.id === 'en-original'));
const reason = {status:'needs-author-review',kind:'author-self-declaration',reason:'Episode title or story changed.'};
function legacy(e) {
  return {schema:'ludolingua.author-draft.v1',source:{id:e.id,sha256:SHA},token:'legacy-input',revision:e.revision+1,
    cards:e.cards.map(({id,label})=>({id,label})),labelsFrozen:e.constraints.labelsFrozen,clues:structuredClone(e.clues),
    hintText:e.hints.join('\n'),hintReview:null,actionExpected:e.action.expected};
}
function current(e, changes = {}) {
  return {...legacy(e),schema:'ludolingua.author-draft.v2',title:e.title,story:e.story,...changes};
}
function read(record,e) { return readDraft(JSON.stringify(record),e,SHA); }

test('v2 capture preserves complete wording and does not mutate its source', () => {
  const e=source(),before=structuredClone(e),edited=structuredClone(e);
  edited.revision++;edited.title='  Café — a new scene 🌱\nA second heading  ';edited.story='First line.\n  A second line with spaces.  ';edited.hintReview=reason;
  const record=captureDraft(e,SHA,edited,'wording');
  assert.equal(DRAFT_SCHEMA,'ludolingua.author-draft.v2');
  assert.deepEqual(Object.keys(record).sort(),Object.keys(current(e)).sort());
  assert.equal(record.title,edited.title);assert.equal(record.story,edited.story);
  assert.deepEqual(read(record,e).episode,edited);assert.deepEqual(e,before);
  record.title='Later mutation';assert.equal(edited.title,'  Café — a new scene 🌱\nA second heading  ');
});

test('legacy draft wording comes from its bound source while prior edits survive', () => {
  const e=source(),record=legacy(e);record.cards[0].label='Changed';record.actionExpected='PLAY';
  record.hintReview={status:'needs-author-review',kind:'author-self-declaration',reason:'Labels, ordering clues or hints changed.'};
  const restored=read(record,e);assert.equal(restored.state,'ready');
  assert.equal(restored.episode.title,e.title);assert.equal(restored.episode.story,e.story);
  assert.equal(restored.episode.action.expected,'PLAY');assert.equal(restored.episode.cards[0].label,'Changed');
  assert.deepEqual(restored.episode.hintReview,record.hintReview);
});

test('unfinished wording remains recoverable but is rejected as a complete episode', () => {
  for(const field of ['title','story'])for(const value of ['',' ','\n  \n']){
    const e=source(),edited=structuredClone(e);edited.revision++;edited[field]=value;
    const record=captureDraft(e,SHA,edited,'unfinished'),restored=read(record,e);
    assert.equal(restored.state,'ready');assert.equal(restored.episode[field],value);
    assert.equal(validateEpisode(restored.episode).valid,false);
    assert.equal(record[field],value);
  }
});

test('draft versions retain distinct exact shapes and primitive wording types', () => {
  const e=source();
  for(const field of ['title','story']){
    const missing=current(e);delete missing[field];assert.equal(read(missing,e).state,'invalid');
    for(const value of [null,42,[],{},true]){
      assert.equal(read(current(e,{[field]:value}),e).state,'invalid');
      const edited=structuredClone(e);edited.revision++;edited[field]=value;
      assert.throws(()=>captureDraft(e,SHA,edited,'bad-wording'));
    }
    assert.equal(read({...legacy(e),[field]:'injected'},e).state,'invalid');
  }
  assert.equal(read({...current(e),approved:true},e).state,'invalid');
  assert.equal(read({...current(e),schema:'ludolingua.author-draft.v3'},e).state,'invalid');
});

test('wording allowance does not allow changes to immutable episode fields', () => {
  for(const mutate of [
    e=>{e.id='different';},e=>{e.locale='es';},e=>{e.schema='different';},
    e=>{e.extraction.normalization='altered';},e=>{e.provenance.source='altered';},
    e=>{e.constraints.requireUnique=!e.constraints.requireUnique;}
  ]){
    const e=source(),edited=structuredClone(e);edited.revision++;edited.title='Allowed title';edited.story='Allowed story';mutate(edited);
    assert.throws(()=>captureDraft(e,SHA,edited,'immutable'));
  }
});

test('wording review reason remains an exact author declaration', () => {
  const e=source(),record=current(e,{hintReview:reason});assert.equal(read(record,e).state,'ready');
  for(const review of [
    {...reason,reason:reason.reason+' '},{...reason,kind:'independent-approval'},
    {...reason,verified:true},{...reason,reason:'Wording approved by a native speaker.'}
  ])assert.equal(read({...record,hintReview:review},e).state,'invalid');
});

test('explicit v1-to-v2 save retains the storage conflict and failure guards', () => {
  const e=source(),key=draftKey(e.id),raw=JSON.stringify(legacy(e));
  let stored=raw,failWrite=false;
  const storage={getItem:k=>k===key?stored:null,setItem:(k,value)=>{assert.equal(k,key);if(failWrite)throw Error('full');stored=value;}};
  const restored=readDraft(raw,e,SHA);restored.episode.title='New title';restored.episode.revision++;
  const upgraded=captureDraft(e,SHA,restored.episode,'upgrade');
  const newer=JSON.stringify(current(e,{token:'another-tab',story:'Newer draft'}));stored=newer;
  assert.equal(writeDraft(storage,key,raw,upgraded).state,'conflict');assert.equal(stored,newer);
  stored=raw;failWrite=true;assert.equal(writeDraft(storage,key,raw,upgraded).state,'unavailable');assert.equal(stored,raw);
  failWrite=false;assert.equal(writeDraft(storage,key,raw,upgraded).state,'saved');
  assert.equal(JSON.parse(stored).schema,'ludolingua.author-draft.v2');assert.equal(readDraft(stored,e,SHA).episode.title,'New title');
  const malformed={...upgraded};delete malformed.story;const before=stored;
  assert.equal(writeDraft(storage,key,before,malformed).state,'unavailable');assert.equal(stored,before);
});
