import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPlaytestRecord,readPlaytestRecord} from '../lib/playtest-export.mjs';
import {sourceDigest} from '../lib/export.mjs';

const fixtureHashes = {
  attempt:'76392d45a1ece09e18e435d64ef6d74835b5b4de4ff634568b5b489c30c1c78e',
  empty:'506ba68a63508ddffbd09c2f297b7ced8b427a3f3dd878c7e449c04a6d75daeb',
  history:'28bda2af8f33dd31f35f2bbbaf6693aaeb4b6ac514000caf138c31c463a34b6b'
};
async function fixture(name) {
  const bytes=await readFile(new URL('./fixtures/playtest-v0.1-'+name+'.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),fixtureHashes[name]);
  return JSON.parse(bytes.toString('utf8'));
}
function freeze(value) {
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
async function rebind(record) {
  const {engineVersion,playtestEngineVersion,result}=record.validation;
  record.validation.bindingSha256=await sourceDigest({
    episode:record.episode,sessionId:record.sessionId,events:record.events,
    engineVersion,playtestEngineVersion,result
  });
  return record;
}
const rejects=value=>assert.rejects(()=>readPlaytestRecord(value));

test('authentic old attempted record reopens without changing its failed answer or history',async()=>{
  const old=freeze(await fixture('attempt')),before=JSON.stringify(old);
  for(const input of [old,JSON.stringify(old)]){
    const current=await readPlaytestRecord(input);
    assert.deepEqual(current.episode,old.episode);assert.equal(current.sessionId,old.sessionId);assert.deepEqual(current.events,old.events);
    assert.deepEqual(current.validation.result.summary,old.validation.result.summary);
    assert.equal(current.validation.result.finalState.lastAttempt.tokenMatches,true);
    assert.equal(current.validation.result.finalState.lastAttempt.answerMatches,false);
    assert.equal(current.validation.result.finalState.lastAttempt.success,false);
    assert.notEqual(current.integrity.bindingSha256,old.validation.bindingSha256);
    assert.equal(current.integrity.bindingSha256,current.validation.bindingSha256);
    assert.deepEqual(current.evidence,old.evidence);
  }
  assert.equal(JSON.stringify(old),before);
});

test('authentic old history retains earlier success, hints, reveal and resets with a final failed attempt',async()=>{
  const old=await fixture('history'),current=await readPlaytestRecord(old);
  assert.deepEqual(current.events,old.events);
  assert.deepEqual(current.validation.result.summary,{moves:3,attempts:4,successfulAttempts:1,hintsShown:1,resets:2,revealUsed:true,firstSuccessMs:8,elapsedMs:10});
  assert.deepEqual(current.validation.result.finalState.order,['star','key','bell','moon']);
  assert.equal(current.validation.result.finalState.lastAttempt.token,'NOPE');
  assert.equal(current.validation.result.finalState.lastAttempt.tokenMatches,false);
  assert.equal(current.validation.result.finalState.lastAttempt.answerMatches,true);
  assert.equal(current.validation.result.finalState.lastAttempt.success,false);
});

test('authentic old empty record and current records keep their ordinary verification path',async()=>{
  const empty=await fixture('empty'),received=await readPlaytestRecord(empty);
  assert.deepEqual(received.validation,empty.validation);
  const old=await fixture('attempt');
  const current=await createPlaytestRecord(old.episode,old.sessionId,old.events);
  const roundtrip=await readPlaytestRecord(freeze(current));
  assert.deepEqual(roundtrip.validation,current.validation);
  assert.deepEqual(roundtrip.events,old.events);
});

test('re-export after legacy receiving creates current data that reopens with the original journal',async()=>{
  const old=await fixture('history'),received=await readPlaytestRecord(old);
  const exported=await createPlaytestRecord(received.episode,received.sessionId,received.events);
  const reopened=await readPlaytestRecord(JSON.stringify(exported));
  assert.deepEqual(reopened.episode,old.episode);assert.deepEqual(reopened.events,old.events);assert.equal(reopened.sessionId,old.sessionId);
  assert.deepEqual(reopened.validation,received.validation);
});

test('legacy derived-field tampering remains rejected even after its binding is recomputed',async()=>{
  const old=await fixture('attempt');
  for(const mutate of [
    r=>r.validation.result.finalState.lastAttempt.success=true,
    r=>r.validation.result.finalState.lastAttempt.token='CLOSE',
    r=>r.validation.result.finalState.lastAttempt.cluesSatisfied=false,
    r=>r.validation.result.finalState.lastAttempt.answerMatches=true,
    r=>r.validation.result.finalState.lastAttempt.orderValid=false,
    r=>r.validation.result.finalState.order.reverse(),
    r=>r.validation.result.summary.successfulAttempts=1,
    r=>r.validation.result.finalState.lastAttempt.extra='ignored?'
  ]){
    const changed=structuredClone(old);mutate(changed);await rebind(changed);await rejects(changed);
  }
});

test('a missing tokenMatches field is insufficient without the historical binding; explicit wrong values never fall back',async()=>{
  const old=await fixture('attempt'),current=await createPlaytestRecord(old.episode,old.sessionId,old.events);
  const missing=structuredClone(current);delete missing.validation.result.finalState.lastAttempt.tokenMatches;await rejects(missing);
  for(const value of [false,null,undefined]){
    const changed=structuredClone(current);changed.validation.result.finalState.lastAttempt.tokenMatches=value;
    if(value!==undefined)await rebind(changed);
    await rejects(changed);
    const suppliedOld=structuredClone(old);suppliedOld.validation.result.finalState.lastAttempt.tokenMatches=value;
    await rejects(suppliedOld);
  }
});

test('legacy receiving rejects altered source, events, identity, digests, evidence and unsupported versions',async()=>{
  const old=await fixture('attempt');
  for(const mutate of [
    r=>r.episode.story+=' changed',
    r=>r.events[3].answer='OPEN',
    r=>r.events[3].elapsedMs=50,
    r=>r.sessionId+=' changed',
    r=>r.validation.episodeSha256='0'.repeat(64),
    r=>r.validation.bindingSha256='0'.repeat(64),
    r=>r.evidence.humanIdentityAttested=true,
    r=>r.validation.engineVersion='0.2.0',
    r=>r.validation.playtestEngineVersion='0.2.0',
    r=>r.validation.result.playtestEngineVersion='0.2.0',
    r=>r.schema='ludolingua.playtest-record.v2'
  ]){const changed=structuredClone(old);mutate(changed);await rejects(changed);}
  const future=structuredClone(old);future.validation.engineVersion='0.2.0';await rebind(future);await rejects(future);
});

test('a self-consistent historical representation remains a content binding, not proof of origin',async()=>{
  const old=await fixture('attempt');
  old.sessionId='another-self-reported-session';await rebind(old);
  const received=await readPlaytestRecord(old);
  assert.equal(received.sessionId,old.sessionId);assert.equal(received.validation.result.finalState.lastAttempt.success,false);
  assert.equal(received.evidence.humanIdentityAttested,false);assert.equal(received.evidence.modelContributionVerified,false);
});
