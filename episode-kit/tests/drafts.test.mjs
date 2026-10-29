import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { draftKey, captureDraft, readDraft, writeDraft, removeDraft } from '../lib/drafts.mjs';
const SHA = 'a'.repeat(64), OTHER_SHA = 'b'.repeat(64);
function fixture(id = 'en-original') {
  const found = EPISODES.find(episode => episode.id === id);
  assert.ok(found, 'Missing fixture: ' + id);
  return structuredClone(found);
}
// Independent persisted input, deliberately not generated through captureDraft.
function recordFor(source, overrides = {}) {
  return { schema: 'ludolingua.author-draft.v1', source: { id: source.id, sha256: SHA },
    token: 'independent-test-token', revision: source.revision + 1,
    cards: source.cards.map(({id, label}) => ({id, label})),
    labelsFrozen: source.constraints.labelsFrozen, clues: structuredClone(source.clues),
    hintText: source.hints.join('\n'), hintReview: source.hintReview ?? null, actionExpected: source.action.expected, ...overrides };
}
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial)); let failAt = null;
  return {
    storage: {
      getItem(key) { if (failAt === 'read') throw new Error('Read unavailable'); return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { if (failAt === 'write') throw new Error('Write unavailable'); values.set(key, String(value)); },
      removeItem(key) { if (failAt === 'remove') throw new Error('Remove unavailable'); values.delete(key); }
    },
    fail(operation) { failAt = operation; },
    peek(key) { return values.has(key) ? values.get(key) : null; }
  };
}
test('absent draft is missing; malformed persisted data is invalid', () => {
  const source = fixture();
  assert.equal(readDraft(null, source, SHA).state, 'missing');
  for (const raw of ['{', 'null', '[]', '"text"', '42', '{}']) assert.equal(readDraft(raw, source, SHA).state, 'invalid', raw);
});
test('restores incomplete author edits without changing immutable source content', () => {
  const source = fixture(), original = structuredClone(source), record = recordFor(source);
  record.cards[0].label = ''; record.cards[1].label = '   '; record.cards[2].label = 'A new label';
  record.labelsFrozen = !source.constraints.labelsFrozen;
  const result = readDraft(JSON.stringify(record), source, SHA);
  assert.equal(result.state, 'ready');
  const expected = structuredClone(source);
  expected.cards.forEach((card, index) => { card.label = record.cards[index].label; });
  expected.revision = record.revision; expected.constraints.labelsFrozen = record.labelsFrozen;
  assert.deepEqual(result.episode, expected); assert.deepEqual(source, original);
});
test('another fixture or changed source digest is incompatible', () => {
  const source = fixture(), raw = JSON.stringify(recordFor(source));
  assert.equal(readDraft(raw, fixture('es-adapted'), SHA).state, 'incompatible');
  assert.equal(readDraft(raw, source, OTHER_SHA).state, 'incompatible');
});
test('malformed persisted source hashes are invalid', () => {
  const source = fixture();
  for (const sha256 of ['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64)]) {
    const record = recordFor(source); record.source.sha256 = sha256;
    assert.equal(readDraft(JSON.stringify(record), source, SHA).state, 'invalid');
  }
});
test('rejects missing, duplicate, reordered, extra, and replaced card identities', () => {
  const source = fixture(), mutations = [
    r => r.cards.pop(), r => { r.cards[1].id = r.cards[0].id; }, r => r.cards.reverse(),
    r => r.cards.push({id:'extra',label:'Extra'}), r => { r.cards[0].id = 'unrelated'; }
  ];
  for (const mutate of mutations) { const record = recordFor(source); mutate(record); assert.equal(readDraft(JSON.stringify(record), source, SHA).state, 'invalid'); }
});
test('requires string labels and boolean frozen state', () => {
  const source = fixture();
  for (const label of [null, 1, {}, []]) { const r = recordFor(source); r.cards[0].label = label; assert.equal(readDraft(JSON.stringify(r), source, SHA).state, 'invalid'); }
  for (const labelsFrozen of [null, 'false', 0, {}]) assert.equal(readDraft(JSON.stringify(recordFor(source, {labelsFrozen})), source, SHA).state, 'invalid');
});
test('requires safe integer revision at least as recent as the source', () => {
  const source = fixture();
  for (const revision of [source.revision-1, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER+1]) assert.equal(readDraft(JSON.stringify(recordFor(source,{revision})),source,SHA).state,'invalid');
  assert.equal(readDraft(JSON.stringify(recordFor(source,{revision:source.revision})),source,SHA).state,'ready');
  const advanced = structuredClone(source); advanced.revision += 3;
  assert.equal(readDraft(JSON.stringify(recordFor(source)),advanced,SHA).state,'invalid');
});
test('forged verification and unknown fields cannot grant approval', () => {
  const source = fixture();
  const mutations = [r=>{r.result={approved:true};},r=>{r.verification={passed:true};},r=>{r.pass=true;},r=>{r.source.approved=true;},r=>{r.cards[0].approved=true;}];
  for (const mutate of mutations) { const r=recordFor(source); mutate(r); assert.equal(readDraft(JSON.stringify(r),source,SHA).state,'invalid'); }
});
test('capture persists editable fields and round trips a valid edit', () => {
  const source = fixture(), original=structuredClone(source), edited=structuredClone(source);
  edited.cards[0].label=''; edited.cards[1].label='Renamed'; edited.constraints.labelsFrozen=!source.constraints.labelsFrozen; edited.revision++;
  const record=captureDraft(source,SHA,edited,'capture-test-token');
  assert.deepEqual(record,{schema:'ludolingua.author-draft.v1',source:{id:source.id,sha256:SHA},token:'capture-test-token',revision:edited.revision,cards:edited.cards.map(({id,label})=>({id,label})),labelsFrozen:edited.constraints.labelsFrozen,clues:edited.clues,hintText:edited.hints.join('\n'),hintReview:edited.hintReview??null,actionExpected:edited.action.expected});
  const result=readDraft(JSON.stringify(record),source,SHA); assert.equal(result.state,'ready'); assert.deepEqual(result.episode,edited); assert.deepEqual(source,original);
});
test('capture rejects changes outside editable author fields and malformed cards', () => {
  const source=fixture(), mutations=[e=>{e.id='different';},e=>e.cards.reverse(),e=>{e.cards[0].id='replacement';},e=>e.cards.pop(),e=>{e.constraints.requireUnique=false;},e=>{e.provenance={forged:true};},e=>{e.cards[0]=null;}];
  for (const mutate of mutations) { const edited=structuredClone(source); edited.revision++; mutate(edited); assert.throws(()=>captureDraft(source,SHA,edited,'capture-test-token')); }
});
test('write and remove succeed only against the observed storage value', () => {
  const source=fixture(),key=draftKey(source.id),memory=memoryStorage(),record=recordFor(source);
  const saved=writeDraft(memory.storage,key,null,record);
  assert.equal(saved.state,'saved'); assert.equal(saved.raw,memory.peek(key)); assert.deepEqual(JSON.parse(saved.raw),record);
  const removed=removeDraft(memory.storage,key,saved.raw);
  assert.equal(removed.state,'saved');assert.equal(removed.raw,null);assert.equal(memory.peek(key),null);
});
test('stale writes and resets preserve newer stored bytes', () => {
  const source=fixture(),key=draftKey(source.id),olderRaw=JSON.stringify(recordFor(source)),newerRaw=JSON.stringify(recordFor(source,{token:'newer-tab-token',revision:source.revision+2})),memory=memoryStorage({[key]:newerRaw});
  const write=writeDraft(memory.storage,key,olderRaw,recordFor(source));
  assert.equal(write.state,'conflict');assert.equal(write.raw,newerRaw);assert.equal(memory.peek(key),newerRaw);
  const remove=removeDraft(memory.storage,key,olderRaw);
  assert.equal(remove.state,'conflict');assert.equal(remove.raw,newerRaw);assert.equal(memory.peek(key),newerRaw);
});
test('storage read, write, and remove failures report unavailable', () => {
  const source=fixture(),key=draftKey(source.id),record=recordFor(source),raw=JSON.stringify(record);
  for(const operation of ['read','write']) { const memory=memoryStorage();memory.fail(operation);assert.equal(writeDraft(memory.storage,key,null,record).state,'unavailable');assert.equal(memory.peek(key),null); }
  for(const operation of ['read','remove']) { const memory=memoryStorage({[key]:raw});memory.fail(operation);assert.equal(removeDraft(memory.storage,key,raw).state,'unavailable');assert.equal(memory.peek(key),raw); }
});
test('discarding one fixture leaves another draft intact', () => {
  const first=fixture(),second=fixture('es-adapted'),firstKey=draftKey(first.id),secondKey=draftKey(second.id);
  assert.notEqual(firstKey,secondKey);assert.equal(draftKey(first.id),firstKey);
  const firstRaw=JSON.stringify(recordFor(first)),secondRaw=JSON.stringify(recordFor(second)),memory=memoryStorage({[firstKey]:firstRaw,[secondKey]:secondRaw});
  assert.equal(removeDraft(memory.storage,firstKey,firstRaw).state,'saved');assert.equal(memory.peek(firstKey),null);assert.equal(memory.peek(secondKey),secondRaw);assert.equal(readDraft(secondRaw,second,SHA).state,'ready');
});

test('restores raw hint whitespace while deriving authored hint lines', () => {
  const source=fixture(),hintText='\nFirst author hint\n\n  Second author hint  \n\n';
  const result=readDraft(JSON.stringify(recordFor(source,{hintText})),source,SHA);
  assert.equal(result.state,'ready');assert.equal(result.hintText,hintText);
  assert.deepEqual(result.episode.hints,['First author hint','  Second author hint  ']);
  assert.deepEqual(result.episode.clues,source.clues);
});
test('restores unfinished empty and self-referencing clue sets', () => {
  const source=fixture(),cardId=source.cards[0].id;
  for(const clues of [[],[{id:'unfinished-self',kind:'before',left:cardId,right:cardId}]]){
    const result=readDraft(JSON.stringify(recordFor(source,{clues})),source,SHA);
    assert.equal(result.state,'ready');assert.deepEqual(result.episode.clues,clues);assert.deepEqual(result.episode.cards,source.cards);
  }
});
test('rejects malformed clues and accepts exactly the supported relationships', () => {
  const source=fixture(),valid={id:'independent-clue',kind:'before',left:source.cards[0].id,right:source.cards[1].id};
  const cases=[null,{},[null],[{...valid,id:''}],[{...valid,id:42}],[{...valid,kind:'next_to'}],[{...valid,left:'missing-card'}],[{...valid,right:'missing-card'}],[{id:valid.id,kind:valid.kind,left:valid.left}],[{...valid,approved:true}],[valid,{...valid,right:source.cards[2].id}]];
  for(const clues of cases) assert.equal(readDraft(JSON.stringify(recordFor(source,{clues})),source,SHA).state,'invalid');
  for(const kind of ['before','after','immediately_before']){const clues=[{...valid,kind}],r=readDraft(JSON.stringify(recordFor(source,{clues})),source,SHA);assert.equal(r.state,'ready');assert.deepEqual(r.episode.clues,clues);}
});
test('restores only exact authored review declarations and removes null review', () => {
  const source=fixture(),revision=source.revision+2,reviews=[{status:'needs-author-review',kind:'author-self-declaration',reason:'Labels, ordering clues or hints changed.'},{status:'author-reviewed',kind:'author-self-declaration',revision}];
  for(const hintReview of reviews){const r=readDraft(JSON.stringify(recordFor(source,{revision,hintReview})),source,SHA);assert.equal(r.state,'ready');assert.deepEqual(r.episode.hintReview,hintReview);}
  const reviewed=structuredClone(source);reviewed.hintReview=reviews[1];
  const r=readDraft(JSON.stringify(recordFor(reviewed,{revision,hintReview:null})),reviewed,SHA);assert.equal(r.state,'ready');assert.equal(Object.hasOwn(r.episode,'hintReview'),false);assert.deepEqual(reviewed.hintReview,reviews[1]);
});
test('rejects forged, malformed, and future hint review declarations', () => {
  const source=fixture(),revision=source.revision+2,review={status:'author-reviewed',kind:'author-self-declaration',revision};
  const cases=[{},'author-reviewed',{...review,kind:'engine-verification'},{...review,status:'verified'},{...review,revision:0},{...review,revision:1.5},{...review,revision:'2'},{...review,revision:revision+1},{...review,revision:Number.MAX_SAFE_INTEGER+1},{...review,approved:true},{status:'needs-author-review',kind:'author-self-declaration',reason:'Different reason'},{status:'needs-author-review',kind:'author-self-declaration',reason:'Labels, ordering clues or hints changed.',revision}];
  for(const hintReview of cases)assert.equal(readDraft(JSON.stringify(recordFor(source,{revision,hintReview})),source,SHA).state,'invalid');
});
test('capture accepts consistent raw hint text and rejects a different buffer', () => {
  const source=fixture(),edited=structuredClone(source);edited.revision++;edited.hints=['An independently authored hint'];edited.hintReview={status:'needs-author-review',kind:'author-self-declaration',reason:'Labels, ordering clues or hints changed.'};
  const record=captureDraft(source,SHA,edited,'hint-token','\nAn independently authored hint\n\n');
  assert.equal(record.hintText,'\nAn independently authored hint\n\n');assert.deepEqual(record.hintReview,edited.hintReview);
  assert.throws(()=>captureDraft(source,SHA,edited,'hint-token','A different editor buffer'));
  assert.equal(captureDraft(source,SHA,edited,'default-token').hintText,edited.hints.join('\n'));
});
test('capture and restoration isolate clues, hints, and review objects', () => {
  const source=fixture(),original=structuredClone(source),edited=structuredClone(source);edited.revision++;
  edited.clues=[{id:'clone-isolation-clue',kind:'after',left:source.cards[0].id,right:source.cards[1].id}];edited.hints=['Keep this hint'];edited.hintReview={status:'needs-author-review',kind:'author-self-declaration',reason:'Labels, ordering clues or hints changed.'};
  const captured=captureDraft(source,SHA,edited,'clone-token'),before=structuredClone(captured);
  edited.clues[0].kind='before';edited.hints[0]='Changed';edited.hintReview.reason='Changed';assert.deepEqual(captured,before);
  const raw=JSON.stringify(captured),first=readDraft(raw,source,SHA),second=readDraft(raw,source,SHA),secondBefore=structuredClone(second);
  assert.equal(first.state,'ready');assert.equal(second.state,'ready');first.episode.clues[0].kind='immediately_before';first.episode.hints.push('Mutation');first.episode.hintReview.reason='Mutation';
  assert.deepEqual(second,secondBefore);assert.deepEqual(source,original);assert.deepEqual(captured,before);
});

test('required action input restores exactly, including an unfinished empty action', () => {
  const source=fixture();
  for(const actionExpected of ['', '  PLAY  ', 'ÁBRE']) {
    const record=recordFor(source,{actionExpected}),r=readDraft(JSON.stringify(record),source,SHA);
    assert.equal(r.state,'ready');assert.equal(r.episode.action.expected,actionExpected);
    assert.equal(r.episode.action.answerNormalization,source.action.answerNormalization);
    const edited=structuredClone(source);edited.action.expected=actionExpected;edited.revision++;
    assert.equal(captureDraft(source,SHA,edited,'action-token').actionExpected,actionExpected);
  }
  assert.equal(source.action.expected,'OPEN');
});
test('draft action cannot replace normalization or supply nonstring data', () => {
  const source=fixture(),edited=structuredClone(source);edited.revision++;edited.action.answerNormalization='forged';
  assert.throws(()=>captureDraft(source,SHA,edited,'action-token'));
  for(const actionExpected of [null,{},1,[]])assert.equal(readDraft(JSON.stringify(recordFor(source,{actionExpected})),source,SHA).state,'invalid');
});
