import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CASES, SOLUTION_ORDER} from './cases.mjs';
import {analyzeEpisode, checkAttempt, extractToken} from '../../episode-kit/lib/engine.mjs';
import {compareEpisodes} from '../../episode-kit/lib/compare.mjs';
import {readExport} from '../../episode-kit/lib/export.mjs';
import {readComparisonExport} from '../../episode-kit/lib/comparison-export.mjs';

test('three exports bind the authored cases and their distinct mechanical outcomes',async()=>{
 const names=['01-en-source.json','02-es-literal-contrast.json','03-es-adapted.json'];
 for(const [i,name] of names.entries()){
  const received=await readExport(JSON.parse(await fs.readFile(new URL('./exports/episodes/'+name,import.meta.url),'utf8')));
  assert.equal(received.integrity.verified,true);assert.deepEqual(received.episode,CASES[i]);
  const result=analyzeEpisode(CASES[i]);
  assert.equal(result.permutationCount,5040);assert.equal(result.clueOrderCount,1);
  assert.deepEqual(result.solutions[0].order,SOLUTION_ORDER);
  assert.equal(result.mechanicalSuccess,i!==1);
 }
 for(const [i,name] of [[1,'source-vs-literal.json'],[2,'source-vs-adapted.json']]){
  const received=await readComparisonExport(JSON.parse(await fs.readFile(new URL('./exports/comparisons/'+name,import.meta.url),'utf8')));
  assert.equal(received.integrity.verified,true);assert.deepEqual(received.source,CASES[0]);assert.deepEqual(received.target,CASES[i]);
 }
});
test('same English answer with Star and Shell swapped is still a failed attempt',()=>{
 const wrong=[...SOLUTION_ORDER.slice(0,5),'slot-g','slot-f'];
 assert.equal(extractToken(CASES[0],wrong),'COMPASS');
 const attempt=checkAttempt(CASES[0],wrong,'COMPASS');
 assert.equal(attempt.tokenMatches,true);assert.equal(attempt.answerMatches,true);
 assert.equal(attempt.cluesSatisfied,false);assert.equal(attempt.success,false);
 assert.equal(checkAttempt(CASES[0],SOLUTION_ORDER,'COMPASS').success,true);
});
test('Spanish answer accepts canonical equivalence but preserves accents and internal text',()=>{
 for(const value of ['BRÚJULA','brújula','  brújula  ','BRU\u0301JULA','bru\u0301jula'])
  assert.equal(checkAttempt(CASES[2],SOLUTION_ORDER,value).success,true,value);
 for(const value of ['BRUJULA','BRÙJULA','BRÚ JULA','BRÚJULA!','VREPMEC','COMPASS'])
  assert.equal(checkAttempt(CASES[2],SOLUTION_ORDER,value).success,false,value);
 const decomposed=structuredClone(CASES[2]);decomposed.cards.find(c=>c.id==='slot-c').label=' U\u0301til náutico ';
 assert.equal(extractToken(decomposed,SOLUTION_ORDER),'BRÚJULA');
 assert.equal(analyzeEpisode(decomposed).mechanicalSuccess,true);
 const lost=structuredClone(CASES[2]);lost.cards.find(c=>c.id==='slot-c').label='Util náutico';
 assert.equal(extractToken(lost,SOLUTION_ORDER),'BRUJULA');
 assert.equal(analyzeEpisode(lost).mechanicalSuccess,false);
});
test('equivalent before/after formulations preserve complete order sets',()=>{
 const equivalent=structuredClone(CASES[2]);
 for(const c of equivalent.clues){if(c.kind==='before'||c.kind==='after'){c.kind=c.kind==='before'?'after':'before';[c.left,c.right]=[c.right,c.left];}}
 assert.deepEqual(analyzeEpisode(equivalent).solutions,analyzeEpisode(CASES[2]).solutions);
 const comparison=compareEpisodes(CASES[2],equivalent);
 assert.equal(comparison.sameOrderSet,true);assert.equal(comparison.mechanicalPreserved,true);
});
test('literal contrast cannot pass through guessing either its token or intended answer',()=>{
 assert.equal(checkAttempt(CASES[1],SOLUTION_ORDER,'VREPMEC').success,false);
 assert.equal(checkAttempt(CASES[1],SOLUTION_ORDER,'BRÚJULA').success,false);
 assert.equal(analyzeEpisode(CASES[1]).frozenWitness.missing.join(''),'BÚJULA');
});
