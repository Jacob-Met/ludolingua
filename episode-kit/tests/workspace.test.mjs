import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { analyzeEpisode } from '../lib/engine.mjs';
import { createWorkspaceSnapshot, readWorkspaceSnapshot, WORKSPACE_SCHEMA, MAX_WORKSPACE_BYTES } from '../lib/workspace.mjs';
function state() {
  const episode = structuredClone(EPISODES[2]);
  return { episode, comparison: { source: structuredClone(EPISODES[0]), mapping: episode.cards.map(c => ({sourceId:c.id,targetId:c.id})) }, player: { order: ['star','key','bell','moon'], answer: ' áBrE ', hintCount: 1, revealed: true, attempted: true }, uiLocale:'es', mode:'player', hintDraft:episode.hints.join('\n') };
}
test('real episode and independently selected player state round-trip with detached ownership', () => {
  const original = state(), snapshot = createWorkspaceSnapshot(original);
  assert.equal(snapshot.schema, WORKSPACE_SCHEMA);
  assert.deepEqual(readWorkspaceSnapshot(JSON.stringify(snapshot)), {schema:WORKSPACE_SCHEMA,...original});
  snapshot.episode.cards[0].label = 'changed';
  snapshot.comparison.source.cards[0].label = 'changed';
  snapshot.player.order.reverse();
  assert.equal(original.episode.cards[0].label,'Agua');
  assert.equal(original.comparison.source.cards[0].label,'Otter');
  assert.deepEqual(original.player.order,['star','key','bell','moon']);
});
test('dirty invalid labels, self-clues, duplicate/unselected role mapping and raw hint blank lines survive', () => {
  const draft = state();
  draft.episode.cards[0].label = '';
  draft.episode.cards[1].label = '  123 ';
  draft.episode.clues[0].right = draft.episode.clues[0].left;
  draft.comparison.mapping[0].targetId = '';
  draft.comparison.mapping[1].targetId = draft.comparison.mapping[2].targetId;
  draft.hintDraft = '\n  primera ayuda  \n\nsegunda ayuda\n';
  draft.episode.hints = ['  primera ayuda  ','segunda ayuda'];
  assert.equal(analyzeEpisode(draft.episode).valid, false);
  assert.deepEqual(readWorkspaceSnapshot(createWorkspaceSnapshot(draft)), {schema:WORKSPACE_SCHEMA,...draft});
});
test('empty clue set and editable source draft are admitted without manufactured validation authority', () => {
  const draft = state(); draft.episode.clues=[]; draft.comparison.source.cards[0].label='';
  draft.validation={mechanicalSuccess:true};
  const snapshot=createWorkspaceSnapshot(draft);
  assert.equal(Object.hasOwn(snapshot,'validation'),false);
  assert.equal(Object.hasOwn(snapshot.comparison,'checked'),false);
  assert.equal(analyzeEpisode(snapshot.comparison.source).valid,false);
});
test('malformed schema, unsafe render structures, forged check state and bad role/order references are rejected', () => {
  const cases = [
    s=>s.schema='ludolingua.workspace.v99', s=>s.validation={mechanicalSuccess:true},
    s=>s.comparison.checked={validation:{result:{mechanicalPreserved:true}}}, s=>s.player.result={success:true},
    s=>s.mode='unknown', s=>s.uiLocale='fr', s=>s.episode.locale='fr', s=>s.episode.cards=null,
    s=>s.episode.cards[0].label=null, s=>s.episode.cards[1].id=s.episode.cards[0].id,
    s=>s.episode.clues[0].left='missing', s=>s.episode.clues[0].kind='script',
    s=>s.episode.clues[1].id=s.episode.clues[0].id, s=>s.episode.revision=0,
    s=>s.comparison.mapping.pop(), s=>s.comparison.mapping[0].sourceId='missing',
    s=>s.comparison.mapping[0].targetId='missing', s=>s.comparison.mapping[0].sourceId=s.comparison.mapping[1].sourceId,
    s=>s.player.order[0]='missing', s=>s.player.order[0]=s.player.order[1],
    s=>s.player.order.pop(), s=>s.player.answer={}, s=>s.player.revealed='true',
    s=>s.player.attempted=null, s=>s.player.hintCount=-1, s=>s.player.hintCount=4,
    s=>s.player.hintCount=0.5, s=>s.hintDraft='different hints',
    s=>s.episode.provenance.semanticChanges=[{}], s=>s.episode.constraints.labelsFrozen='false'
  ];
  for (const mutate of cases) { const snapshot=createWorkspaceSnapshot(state()); mutate(snapshot); assert.throws(()=>readWorkspaceSnapshot(snapshot), undefined, String(mutate)); }
  assert.throws(()=>readWorkspaceSnapshot('{bad json'));
  assert.throws(()=>readWorkspaceSnapshot(null));
});
test('JSON contract rejects cycles and functions without executing toJSON', () => {
  const snapshot=createWorkspaceSnapshot(state()); snapshot.episode.self=snapshot;
  assert.throws(()=>readWorkspaceSnapshot(snapshot));
  let ran=false; const second=createWorkspaceSnapshot(state()); second.episode.toJSON=()=>{ran=true;return {};};
  assert.throws(()=>readWorkspaceSnapshot(second)); assert.equal(ran,false);
});
test('size limit counts UTF-8 bytes and rejects both serialized and object forms', () => {
  const snapshot=createWorkspaceSnapshot(state()); snapshot.episode.story='é'.repeat(MAX_WORKSPACE_BYTES/2);
  const text=JSON.stringify(snapshot);
  assert.ok(text.length<MAX_WORKSPACE_BYTES);
  assert.throws(()=>readWorkspaceSnapshot(text),/20 MB/);
  assert.throws(()=>readWorkspaceSnapshot(snapshot),/20 MB/);
});

test('DOM collection and display-text bounds reject oversized corrupt sessions', () => {
  for (const mutate of [s=>s.episode.clues=Array.from({length:129},(_,i)=>({...s.episode.clues[0],id:String(i)})), s=>s.episode.hints=Array(257).fill('hint'), s=>s.episode.provenance.semanticChanges=Array(257).fill('change'), s=>s.episode.cards[0].label='a'.repeat(10001), s=>s.episode.story='a'.repeat(1000001)]) {
    const snapshot=createWorkspaceSnapshot(state()); mutate(snapshot); assert.throws(()=>readWorkspaceSnapshot(snapshot));
  }
});
