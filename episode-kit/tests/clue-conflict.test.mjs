import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { analyzeEpisode } from '../lib/engine.mjs';
import { createExport, readExport } from '../lib/export.mjs';
import { explainClueConflict } from '../lib/clue-conflict.mjs';

function episode(clues) {
  const source = EPISODES.find(item => item.id === 'en-original');
  assert.ok(source);
  const result = structuredClone(source); result.clues = structuredClone(clues);
  return result;
}
const clue = (id, kind, left, right) => ({ id, kind, left, right });
const cycle = [
  clue('a', 'before', 'key', 'bell'),
  clue('b', 'before', 'bell', 'moon'),
  clue('c', 'before', 'moon', 'key')
];
const adjacency = [
  clue('adjacent', 'immediately_before', 'key', 'moon'),
  clue('middle-left', 'before', 'key', 'bell'),
  clue('middle-right', 'before', 'bell', 'moon')
];
// Independent hand-constructed witnesses, not a copy of subset search.
function assertWitness(clues, order) {
  assert.deepEqual([...order].sort(), ['key','bell','moon','star'].sort());
  const position = new Map(order.map((id,index) => [id,index]));
  for (const item of clues) {
    const left = position.get(item.left), right = position.get(item.right);
    const satisfied = item.kind === 'before' ? left < right
      : item.kind === 'after' ? left > right
      : item.kind === 'immediately_before' ? left + 1 === right : false;
    assert.equal(satisfied, true, 'Witness must satisfy ' + item.id);
  }
}
function assertSoundConflict(source, result) {
  assert.equal(result.state, 'conflict');
  assert.ok(Array.isArray(result.clueIds) && result.clueIds.length);
  assert.equal(new Set(result.clueIds).size, result.clueIds.length);
  const ids = new Set(source.clues.map(item => item.id));
  for (const id of result.clueIds) assert.ok(ids.has(id));
  const subset = structuredClone(source);
  subset.clues = source.clues.filter(item => result.clueIds.includes(item.id));
  const analysis = analyzeEpisode(subset);
  assert.equal(analysis.valid, true); assert.equal(analysis.outcome, 'inconsistent');
  assert.equal(analysis.clueOrderCount, 0); assert.equal(analysis.mechanicalSuccess, false);
  return subset;
}
test('explains a three-clue cycle without inventing a conflicting pair', () => {
  const source = episode(cycle), result = explainClueConflict(source);
  assertSoundConflict(source, result);
  assert.deepEqual([...result.clueIds].sort(), ['a','b','c']);
  const witnesses = [
    ['bell','moon','key','star'],
    ['moon','key','bell','star'],
    ['key','bell','moon','star']
  ];
  for (let index=0; index<cycle.length; index++) {
    const remaining = cycle.filter((_,i) => i!==index);
    assertWitness(remaining, witnesses[index]);
    assert.ok(analyzeEpisode(episode(remaining)).clueOrderCount>0);
  }
});
test('detects adjacency obstruction even though precedence has no cycle', () => {
  const source = episode(adjacency), result = explainClueConflict(source);
  assertSoundConflict(source,result);
  assert.deepEqual([...result.clueIds].sort(), ['adjacent','middle-left','middle-right'].sort());
  const witnesses = [
    ['key','bell','moon','star'],
    ['bell','key','moon','star'],
    ['key','moon','bell','star']
  ];
  for(let index=0;index<adjacency.length;index++) {
    const remaining=adjacency.filter((_,i)=>i!==index);
    assertWitness(remaining,witnesses[index]);
    assert.ok(analyzeEpisode(episode(remaining)).clueOrderCount>0);
  }
});
test('returns a sound subset without implying it is the only conflict', () => {
  const clues = [
    clue('first-forward','before','key','bell'),
    clue('first-backward','before','bell','key'),
    clue('second-forward','before','moon','star'),
    clue('second-backward','before','star','moon')
  ];
  const source=episode(clues), result=explainClueConflict(source);
  const subset=assertSoundConflict(source,result);assert.equal(subset.clues.length,2);
  const partial=episode(clues.filter(item=>item.id!==result.clueIds[0]));
  assert.equal(analyzeEpisode(partial).outcome,'inconsistent');
  for(const removed of subset.clues) {
    assert.ok(analyzeEpisode(episode(subset.clues.filter(item=>item.id!==removed.id))).clueOrderCount>0);
  }
});
test('collapses semantic duplicates and excludes irrelevant constraints', () => {
  const source=episode([
    clue('pair','immediately_before','bell','moon'),
    clue('pair-copy','immediately_before','bell','moon'),
    clue('reverse','before','moon','bell'),
    clue('lead','before','key','bell'),
    clue('tail','after','star','moon')
  ]);
  const result=explainClueConflict(source);assertSoundConflict(source,result);
  assert.deepEqual([...result.clueIds].sort(),['pair','reverse']);
  assert.deepEqual(explainClueConflict(source),result);
});
test('does not explain action failure or ambiguity as a clue conflict', () => {
  const empty=episode([]);assert.equal(analyzeEpisode(empty).clueOrderCount,24);
  assert.equal(explainClueConflict(empty).state,'satisfiable');
  const cases=EPISODES.filter(item=>{
    const a=analyzeEpisode(item);return a.valid&&a.clueOrderCount>0&&!a.mechanicalSuccess;
  });
  assert.ok(cases.length>0);
  for(const source of cases)assert.equal(explainClueConflict(structuredClone(source)).state,'satisfiable',source.id);
});
test('unfinished self-reference is invalid for explanation, not a conflict proof', () => {
  const source=episode([clue('unfinished','before','bell','bell')]);
  assert.equal(analyzeEpisode(source).valid,false);
  const result=explainClueConflict(source);assert.equal(result.state,'invalid');
  assert.ok(Array.isArray(result.errors)&&result.errors.length>0);
  assert.equal(Object.hasOwn(result,'clueIds'),false);
});
test('each exhausted budget returns no unproved clue subset', () => {
  const source=episode(cycle);
  for(const options of [{maxEvaluations:1},{maxOrders:1},{maxDistinctClues:2},{maxRawClues:2}]) {
    const result=explainClueConflict(source,options);
    assert.equal(result.state,'budget-exhausted',JSON.stringify(options));
    assert.equal(Object.hasOwn(result,'clueIds'),false);
  }
  const satisfiable=episode([
    clue('one','before','key','bell'),
    clue('two','before','bell','moon'),
    clue('three','before','moon','star')
  ]);
  assertWitness(satisfiable.clues,['key','bell','moon','star']);
  const capped=explainClueConflict(satisfiable,{maxRawClues:2});
  assert.equal(capped.state,'budget-exhausted');assert.equal(Object.hasOwn(capped,'clueIds'),false);
});
test('diagnostics preserve source, engine analysis, and checked export schema', async () => {
  const source=episode(adjacency), original=structuredClone(source);
  const beforeAnalysis=analyzeEpisode(source),beforeExport=await createExport(source);
  assertSoundConflict(source,explainClueConflict(source));
  assert.deepEqual(source,original);assert.deepEqual(analyzeEpisode(source),beforeAnalysis);
  const after=await createExport(source);
  assert.deepEqual(Object.keys(after).sort(),['schema','episode','validation','evidence'].sort());
  assert.deepEqual(after.episode,beforeExport.episode);assert.deepEqual(after.validation,beforeExport.validation);
  assert.equal(Object.hasOwn(after.validation.result,'clueIds'),false);
  const received=await readExport(after);
  assert.deepEqual(received.episode,original);
  assert.equal(received.validation.result.outcome,'inconsistent');
  assert.equal(received.validation.result.mechanicalSuccess,false);
});
