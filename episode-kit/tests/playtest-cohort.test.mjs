import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizePlaytestCohort, MAX_COHORT_FILES } from '../playtest-cohort.mjs';
import { createPlaytestRecord, readPlaytestRecord } from '../lib/playtest-export.mjs';
import { sourceDigest } from '../lib/export.mjs';

// An independent authored four-role course: the unique order reads OPEN.
function episode() {
  return {
    schema: 'ludolingua.episode.v1', id: 'cohort-independent-course', revision: 1,
    locale: 'en', title: 'Four roles', story: 'Order the cards and read their initials.',
    cards: [{id:'key',label:'Otter'},{id:'bell',label:'Pine'},
      {id:'moon',label:'Eagle'},{id:'star',label:'Nest'}],
    clues: [{id:'pair',kind:'immediately_before',left:'bell',right:'moon'},
      {id:'first',kind:'before',left:'key',right:'bell'},
      {id:'last',kind:'after',left:'star',right:'moon'}],
    extraction: {kind:'first_letter',normalization:'NFC-uppercase'},
    action: {expected:'OPEN',answerNormalization:'NFC-trim-uppercase'},
    constraints: {labelsFrozen:false,requireUnique:true}, hints:['Find the pair.','Read initials.'],
    provenance: {kind:'authored',source:'Independent cohort course',modelRun:null,
      humanPlaytest:null,semanticChanges:[]}
  };
}
const event = (type, elapsedMs) => ({type, elapsedMs});
const attempt = (answer, elapsedMs) => ({type:'attempt',answer,elapsedMs});
const move = elapsedMs => ({type:'move',cardId:'star',direction:'down',elapsedMs});
const solve = () => [move(1),move(2),move(3),attempt(' open ',4)];
const record = (sessionId, events = [], source = episode()) => createPlaytestRecord(source,sessionId,events);
const zero = {sessions:1,sessionsWithSuccess:0,sessionsWithHints:0,sessionsWithReveal:0,
  attempts:0,successfulAttempts:0,moves:0,hintsShown:0,resets:0};
const oneSuccess = {...zero,sessionsWithSuccess:1,attempts:1,successfulAttempts:1,moves:3};
const fixture = async name => JSON.parse(await readFile(new URL('./fixtures/playtest-v0.1-'+name+'.json',import.meta.url),'utf8'));

test('actual maintained records count recorded histories, including unfinished and failed sessions', async () => {
  const records = await Promise.all([
    record('unfinished'), record('wrong-order',[attempt('OPEN',0)]),
    record('solved',solve()), record('assisted',[event('hint',0),...solve(),event('reveal',5),event('reset',6)])
  ]);
  const before=JSON.stringify(records);
  const result=await summarizePlaytestCohort(records.map((r,i)=>i%2?JSON.stringify(r):r));
  assert.deepEqual(result.inputs,{verifiedFiles:4,uniqueSessions:4,duplicateFiles:0,supersededSnapshots:0});
  assert.equal(result.episodes.length,1);
  assert.deepEqual(result.episodes[0].recorded,{sessions:4,sessionsWithSuccess:2,sessionsWithHints:1,
    sessionsWithReveal:1,attempts:3,successfulAttempts:2,moves:6,hintsShown:1,resets:1});
  assert.equal(JSON.stringify(records),before);
  assert.equal(Object.hasOwn(result.episodes[0].recorded,'elapsedMs'),false);
});

test('repeated downloads and shorter snapshots do not inflate a completed session, regardless of input order', async () => {
  const empty=await record('same'), partial=await record('same',solve().slice(0,2)), full=await record('same',solve());
  const inputs=[empty,partial,full,structuredClone(full),JSON.stringify(partial)];
  const forward=await summarizePlaytestCohort(inputs),reverse=await summarizePlaytestCohort([...inputs].reverse());
  assert.deepEqual(forward,reverse);
  assert.deepEqual(forward.inputs,{verifiedFiles:5,uniqueSessions:1,duplicateFiles:2,supersededSnapshots:2});
  assert.deepEqual(forward.episodes[0].recorded,oneSuccess);
});

test('two independently named sessions with identical journals both count, while exact duplicate files do not', async () => {
  const a=await record('person-is-not-attested-a',solve()),b=await record('person-is-not-attested-b',solve());
  const result=await summarizePlaytestCohort([a,b,a]);
  assert.deepEqual(result.inputs,{verifiedFiles:3,uniqueSessions:2,duplicateFiles:1,supersededSnapshots:0});
  assert.deepEqual(result.episodes[0].recorded,{...oneSuccess,sessions:2,sessionsWithSuccess:2,
    attempts:2,successfulAttempts:2,moves:6});
});

test('a divergent earlier snapshot cannot be hidden by a longer journal or input order', async () => {
  const a=await record('fork',[event('hint',0)]), b=await record('fork',[event('reveal',0)]);
  const extension=await record('fork',[event('hint',0),event('reset',1)]);
  for(const inputs of [[a,b],[b,a],[a,b,extension],[extension,b,a]]) {
    await assert.rejects(()=>summarizePlaytestCohort(inputs),/Conflicting records/);
  }
});

test('valid self-reported timing edits under the same session are conflicting histories', async () => {
  const a=await record('timing',[attempt('WRONG',1)]),b=await record('timing',[attempt('WRONG',2)]);
  await assert.rejects(()=>summarizePlaytestCohort([a,b]),/Conflicting records/);
});

test('exact content hashes separate equal IDs and revisions, and one session cannot change its episode', async () => {
  const first=episode(),second=episode();second.story+=' An editorial change.';
  const a=await record('source-a',[],first),b=await record('source-b',[],second);
  const result=await summarizePlaytestCohort([a,b]);
  assert.equal(result.episodes.length,2);
  assert.deepEqual(result.episodes.map(x=>x.episode.sha256).sort(),
    [await sourceDigest(first),await sourceDigest(second)].sort());
  for(const group of result.episodes) assert.deepEqual(group.recorded,zero);
  const changed=await record('source-a',[],second);
  await assert.rejects(()=>summarizePlaytestCohort([a,changed]),/Conflicting records/);
});

test('an apparently verified flag, forged evidence, or recomputed forged success cannot bypass actual replay', async () => {
  const original=await record('forgery',[attempt('OPEN',0)]);
  for(const mutate of [r=>r.validation.result.summary.successfulAttempts=1,
    r=>r.evidence.humanIdentityAttested=true,r=>r.events[0].answer='CHANGED',
    r=>r.validation.episodeSha256='0'.repeat(64)]) {
    const altered=structuredClone(original);mutate(altered);altered.integrity={verified:true};
    await assert.rejects(()=>summarizePlaytestCohort([altered]));
  }
  const forged=structuredClone(original);
  forged.validation.result.summary.successfulAttempts=1;
  forged.validation.result.finalState.lastAttempt.success=true;
  const {engineVersion,playtestEngineVersion,result}=forged.validation;
  forged.validation.bindingSha256=await sourceDigest({episode:forged.episode,sessionId:forged.sessionId,
    events:forged.events,engineVersion,playtestEngineVersion,result});
  await assert.rejects(()=>summarizePlaytestCohort([forged]),/Stale or altered/);
});

test('historical and current exports of the same attempted journal normalize to one duplicate', async () => {
  const legacy=await fixture('attempt');
  const current=await createPlaytestRecord(legacy.episode,legacy.sessionId,legacy.events);
  assert.notEqual(legacy.validation.bindingSha256,current.validation.bindingSha256);
  const result=await summarizePlaytestCohort([legacy,current]);
  assert.deepEqual(result.inputs,{verifiedFiles:2,uniqueSessions:1,duplicateFiles:1,supersededSnapshots:0});
  assert.deepEqual(result.episodes[0].recorded,{...zero,attempts:1,moves:3});
  assert.equal((await readPlaytestRecord(legacy)).validation.result.finalState.lastAttempt.success,false);
});

test('a historical session retains earlier success even when its last attempt failed', async () => {
  const legacy=await fixture('history');
  const result=await summarizePlaytestCohort([legacy]);
  assert.deepEqual(result.episodes[0].recorded,{sessions:1,sessionsWithSuccess:1,sessionsWithHints:1,
    sessionsWithReveal:1,attempts:4,successfulAttempts:1,moves:3,hintsShown:1,resets:2});
});

test('invalid input and mixed good/bad envelopes reject the entire result', async () => {
  const good=await record('valid-empty');
  for(const value of [null,{},[],[{}],[good,'{'],[good,{...good,schema:'unrecognized'}],
    Array(MAX_COHORT_FILES+1).fill(good)]) await assert.rejects(()=>summarizePlaytestCohort(value));
  const maximum=await summarizePlaytestCohort(Array(MAX_COHORT_FILES).fill(good));
  assert.equal(maximum.inputs.uniqueSessions,1);
  assert.equal(maximum.inputs.duplicateFiles,MAX_COHORT_FILES-1);
  assert.deepEqual(maximum.episodes[0].recorded,zero);
});
