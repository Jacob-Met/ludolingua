import test from 'node:test';
import assert from 'node:assert/strict';
import { describePlaytestJourney } from '../lib/playtest-journey.mjs';
import { replayPlaytest, MAX_PLAYTEST_EVENTS } from '../lib/playtest.mjs';

function episode() {
  return {
    schema: 'ludolingua.episode.v1', id: 'journey-fixture', revision: 1,
    locale: 'en', title: 'Journey review', story: 'Order these cards.',
    cards: [{id:'key',label:'Otter'}, {id:'bell',label:'Pine'},
      {id:'moon',label:'Eagle'}, {id:'star',label:'Nest'}],
    clues: [
      {id:'pair',kind:'immediately_before',left:'bell',right:'moon'},
      {id:'first',kind:'before',left:'key',right:'bell'},
      {id:'last',kind:'after',left:'star',right:'moon'}
    ],
    extraction: {kind:'first_letter',normalization:'NFC-uppercase'},
    action: {expected:'OPEN',answerNormalization:'NFC-trim-uppercase'},
    constraints: {labelsFrozen:false,requireUnique:true},
    hints: ['Find the pair.','Read the initials.'],
    provenance: {kind:'authored',source:'Independent review fixture',
      modelRun:null,humanPlaytest:null,semanticChanges:[]}
  };
}
const action = (type,elapsedMs) => ({type,elapsedMs});
const move = (cardId,direction,elapsedMs) => ({type:'move',cardId,direction,elapsedMs});
const attempt = (answer,elapsedMs) => ({type:'attempt',answer,elapsedMs});

test('the original order and each move are visible without exposing a solution', () => {
  const e=episode(), events=[attempt('OPEN',0),move('star','down',1),
    move('star','down',2),move('star','down',3),attempt('open',4)];
  const frozen=JSON.stringify({e,events});
  const steps=describePlaytestJourney(e,events);
  assert.deepEqual(steps[0].order,['star','key','bell','moon']);
  assert.equal(steps[0].attempt.cluesSatisfied,false);
  assert.deepEqual(steps[1].order,['key','star','bell','moon']);
  assert.deepEqual(steps[2].order,['key','bell','star','moon']);
  assert.deepEqual(steps[3].order,['key','bell','moon','star']);
  assert.equal(steps[4].attempt.success,true);
  assert.equal(steps[4].index,4);
  assert.equal(JSON.stringify({e,events}),frozen);
});
test('hints, reveal retirement, and reset follow the exact replay lifetime', () => {
  const events=[action('hint',1),action('reveal',2),move('star','down',3),
    action('reset',4),action('hint',5)];
  const steps=describePlaytestJourney(episode(),events);
  assert.equal(steps[0].visibleHintCount,1);
  assert.equal(steps[1].revealed,true);
  assert.equal(steps[2].revealed,false);
  assert.deepEqual(steps[3].order,['star','key','bell','moon']);
  assert.equal(steps[3].visibleHintCount,0);
  assert.equal(steps[4].visibleHintCount,1);
  assert.deepEqual(steps.at(-1).order,replayPlaytest(episode(),events).finalState.order);
});
test('invalid events and unsupported episode input never produce a journey', () => {
  assert.throws(()=>describePlaytestJourney(episode(),[move('star','up',0)]), /invalid play record/);
  assert.throws(()=>describePlaytestJourney(episode(),[action('unknown',0)]), /invalid play record/);
  assert.throws(()=>describePlaytestJourney({...episode(),cards:[]},[]), /invalid play record/);
});
test('large valid journals are inspected linearly after replay validation', () => {
  const events=Array.from({length:MAX_PLAYTEST_EVENTS},(_,i)=>action('reset',i));
  const steps=describePlaytestJourney(episode(),events);
  assert.equal(steps.length,MAX_PLAYTEST_EVENTS);
  assert.equal(steps.at(-1).index,MAX_PLAYTEST_EVENTS-1);
  assert.deepEqual(steps.at(-1).order,['star','key','bell','moon']);
  assert.throws(()=>describePlaytestJourney(episode(),[...events,action('reset',MAX_PLAYTEST_EVENTS)]), /invalid play record/);
});
