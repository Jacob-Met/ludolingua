import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { inspectClueProgression, compareClueProgression } from '../lib/clue-progression.mjs';

const get = id => structuredClone(EPISODES.find(e => e.id === id));

test('source and coordinated Spanish adaptation retain exact progression and final action', () => {
  const r = compareClueProgression(get('en-original'), get('es-adapted'));
  assert.equal(r.valid, true);
  assert.equal(r.available, true);
  assert.equal(r.mechanicalPreserved, true);
  assert.equal(r.sameFinalOrderSet, true);
  assert.equal(r.sameClueProgression, true);
  assert.equal(r.firstDifference, null);
  assert.equal(r.sourcePath.totalOrders, 24);
  assert.equal(r.sourcePath.steps[0].afterCount, 6);
  assert.equal(r.sourcePath.finalOrderCount, 1);
  assert.deepEqual(r.sourcePath.steps.map(s => s.afterCount), r.targetPath.steps.map(s => s.afterCount));
});

test('mechanical endpoint equality hides changed listed-clue prefix order', () => {
  const s = get('en-original'), t = get('es-adapted');
  t.clues.reverse();
  const r = compareClueProgression(s, t);
  assert.equal(r.valid, true);
  assert.equal(r.sameFinalOrderSet, true);
  assert.equal(r.mechanicalPreserved, true);
  assert.equal(r.sameClueProgression, false);
  assert.equal(r.firstDifference.clueNumber, 1);
  assert.equal(r.firstDifference.sourceRemaining, 6);
  assert.equal(r.firstDifference.targetRemaining, 12);
  assert.ok(r.firstDifference.sourceOnlyOrder || r.firstDifference.targetOnlyOrder);
  assert.equal(r.sourcePath.finalOrderCount, 1);
  assert.equal(r.targetPath.finalOrderCount, 1);
});

test('additional redundant clue is visible without falsely reporting a mechanical failure', () => {
  const t = get('es-adapted');
  t.clues.push({...t.clues[0], id:'duplicated-relation'});
  const r = compareClueProgression(get('en-original'),t);
  assert.equal(r.mechanicalPreserved, true);
  assert.equal(r.sameFinalOrderSet, true);
  assert.equal(r.sameClueProgression, false);
  assert.equal(r.firstDifference.clueNumber, 4);
  assert.equal(r.firstDifference.targetRemaining, 1);
  assert.equal(r.targetPath.steps[3].redundantAtThisStage, true);
});

test('literal translation preserves clue path but does not preserve action extraction', () => {
  const r = compareClueProgression(get('en-original'),get('es-literal'));
  assert.equal(r.sameClueProgression, true);
  assert.equal(r.sameFinalOrderSet, true);
  assert.equal(r.mechanicalPreserved, false);
});

test('an explicit full role mapping retains path equivalence after renaming IDs', () => {
  const target = get('es-adapted');
  const pairs = target.cards.map(c => ({sourceId:c.id,targetId:'local-'+c.id}));
  target.cards.forEach(c => {c.id='local-'+c.id;});
  target.clues.forEach(c => {c.left='local-'+c.left;c.right='local-'+c.right;});
  const r = compareClueProgression(get('en-original'),target,pairs);
  assert.equal(r.valid,true);
  assert.equal(r.mechanicalPreserved,true);
  assert.equal(r.sameClueProgression,true);
});

test('same cardinality with invalid mapping is not treated as supported equivalence', () => {
  const pairs = [{sourceId:'key',targetId:'key'}];
  const r = compareClueProgression(get('en-original'),get('es-adapted'),pairs);
  assert.equal(r.valid,false);
  assert.equal(r.available,false);
  assert.equal(r.sameClueProgression,null);
});

test('an incompatible relation produces a visible ordering-space discrepancy', () => {
  const t = get('es-adapted');
  t.clues[0].kind='after';
  const r = compareClueProgression(get('en-original'),t);
  assert.equal(r.valid,true);
  assert.equal(r.mechanicalPreserved,false);
  assert.equal(r.sameClueProgression,false);
  assert.equal(r.firstDifference.clueNumber,1);
});

test('contradictions become zero survivors without false infinite information', () => {
  const r = inspectClueProgression(get('en-contradictory'));
  assert.equal(r.valid,true);
  assert.equal(r.finalOrderCount,0);
  assert.equal(r.steps.at(-1).contradictionAtThisStage,true);
  assert.equal(r.steps.at(-1).informationBits,null);
});

test('a capped diagnostic does not emit a false positive', () => {
  const target=get('es-adapted');
  for (let i=0;i<65;i++) target.clues.push({...target.clues[0],id:'extra-'+i});
  const r=compareClueProgression(get('en-original'),target);
  assert.equal(r.valid,true);
  assert.equal(r.available,false);
  assert.equal(r.sameClueProgression,null);
  assert.equal(r.mechanicalPreserved,null);
});

test('invalid input fails cleanly and inputs remain unchanged after inspection', () => {
  const s=get('en-original'),t=get('es-adapted');
  const originals=structuredClone([s,t]);
  compareClueProgression(s,t);
  inspectClueProgression(s);
  assert.deepEqual([s,t],originals);
  t.cards[0].label='7';
  const r=compareClueProgression(s,t);
  assert.equal(r.valid,false);
  assert.equal(r.sameClueProgression,null);
});

test('equal prefix counts can still hide different remaining candidate orders', () => {
  const s = get('en-original'), t = get('es-adapted');
  const ordered = [
    {id:'first',kind:'before',left:'key',right:'bell'},
    {id:'second',kind:'before',left:'bell',right:'moon'},
    {id:'third',kind:'before',left:'moon',right:'star'}
  ];
  s.clues = ordered.map(x => ({...x}));
  t.clues = [ordered[2], ordered[0], ordered[1]].map(x => ({...x}));
  const r = compareClueProgression(s,t);
  assert.equal(r.valid,true);
  assert.equal(r.mechanicalPreserved,true);
  assert.equal(r.sameFinalOrderSet,true);
  assert.equal(r.sourcePath.steps[0].afterCount,12);
  assert.equal(r.targetPath.steps[0].afterCount,12);
  assert.equal(r.sameClueProgression,false);
  assert.equal(r.firstDifference.clueNumber,1);
  assert.deepEqual(r.firstDifference.sourceOnlyOrder?.length,4);
  assert.deepEqual(r.firstDifference.targetOnlyOrder?.length,4);
});

