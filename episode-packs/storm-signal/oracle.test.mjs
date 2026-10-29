import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES} from './cases.mjs';
import {validateEpisode,analyzeEpisode,extractToken,checkAttempt} from '../../episode-kit/lib/engine.mjs';
import {createExport,readExport} from '../../episode-kit/lib/export.mjs';
import {createComparisonExport,readComparisonExport} from '../../episode-kit/lib/comparison-export.mjs';
const ids=['anchor','lantern','echo','rope','tower'];
function* permutations(xs){
 if(!xs.length){yield [];return;}
 for(let i=0;i<xs.length;i++)for(const rest of permutations(xs.filter((_,j)=>i!==j)))yield [xs[i],...rest];
}
const orders=[...permutations(ids)];
const predicates=[p=>p.anchor<p.lantern,p=>p.lantern<p.echo,p=>p.echo+1===p.rope,p=>p.rope+1===p.tower];
const valid=(order,skipped=-1)=>{
 const p=Object.fromEntries(order.map((id,i)=>[id,i]));
 return predicates.every((predicate,i)=>i===skipped||predicate(p));
};
const reduced=predicates.map((_,i)=>orders.filter(order=>valid(order,i)).length);
const initials=e=>e.cards.map(c=>[...c.label.trim().normalize('NFC')][0].toUpperCase()).join('');
test('independent brute-force oracle finds exactly one order out of 120',()=>{
 assert.equal(orders.length,120);
 assert.deepEqual(orders.filter(order=>valid(order)),[ids]);
 assert.ok(reduced.every(n=>n>1));
});
test('authored cases distinguish positive extraction, negative translation and ambiguous reasoning',()=>{
 const tokens=['ALERT','ALEST','AVISO','AVISO'],passes=[true,false,true,false];
 for(let i=0;i<CASES.length;i++){
  const e=CASES[i],analysis=analyzeEpisode(e);
  assert.equal(validateEpisode(e).valid,true);
  assert.deepEqual(e.cards.map(c=>c.id),ids);
  assert.equal(analysis.permutationCount,120);
  assert.equal(analysis.clueOrderCount,i===3?reduced[0]:1);
  assert.equal(analysis.mechanicalSuccess,passes[i]);
  assert.equal(initials(e),tokens[i]);
  assert.equal(extractToken(e,ids),tokens[i]);
  assert.equal(checkAttempt(e,ids,e.action.expected).success,i===3?true:passes[i]);
  assert.equal(e.provenance.modelRun,null);
  assert.equal(e.provenance.humanPlaytest,null);
 }
 assert.equal(checkAttempt(CASES[1],ids,'ALEST').success,false);
});
test('localized adaptation preserves semantic difference declaration and ordering constraints',()=>{
 const [source,literal,adapted,ambiguous]=CASES;
 for(const f of ['title','story','hints','clues','extraction','action','constraints'])assert.deepEqual(literal[f],adapted[f]);
 assert.deepEqual(literal.cards.map(c=>c.id),adapted.cards.map(c=>c.id));
 assert.deepEqual(adapted.cards.map(c=>c.label),['Ancla','Vigía','Isla','Sirena','Observatorio']);
 assert.equal(source.action.expected,'ALERT');
 assert.equal(adapted.action.expected,'AVISO');
 assert.deepEqual(ambiguous.cards,adapted.cards);
 assert.deepEqual(ambiguous.clues,adapted.clues.slice(1));
});
test('each removed clue increases admissible orders independently of target token',()=>{
 for(let i=0;i<4;i++){
  const e=structuredClone(CASES[2]);
  e.clues.splice(i,1);
  const analysis=analyzeEpisode(e);
  assert.equal(analysis.clueOrderCount,reduced[i]);
  assert.equal(analysis.mechanicalSuccess,false);
 }
 const a=analyzeEpisode(CASES[3]);
 assert.ok(a.actionMatchCount>=1);
 assert.equal(a.mechanicalSuccess,false);
});
test('real comparison export and receive distinguish proof of order from valid negative comparison',async()=>{
 const mapping=ids.map(id=>({sourceId:id,targetId:id}));
 for(const [i,expectedSame,expectedPass] of [[1,true,false],[2,true,true],[3,false,false]]){
  const exportValue=await createComparisonExport(CASES[0],CASES[i],mapping);
  const received=await readComparisonExport(exportValue);
  assert.equal(received.integrity.verified,true);
  assert.equal(received.validation.result.sameOrderSet,expectedSame);
  assert.equal(received.validation.result.mechanicalPreserved,expectedPass);
  assert.deepEqual(received.source,CASES[0]);
  assert.deepEqual(received.target,CASES[i]);
 }
});
test('tampered label and forged playtest evidence cannot receive as valid exports',async()=>{
 const original=await createExport(CASES[2]);
 assert.equal((await readExport(original)).integrity.verified,true);
 const modified=structuredClone(original);
 modified.episode.cards[1].label='Linterna';
 await assert.rejects(readExport(modified),/Stale or altered/);
 const forged=structuredClone(original);
 forged.evidence.nativeHumanPlaytestVerified=true;
 await assert.rejects(readExport(forged),/Altered evidence/);
});
test('contradictory extra ordering clue is a valid but impossible puzzle',()=>{
 const e=structuredClone(CASES[0]);
 e.clues.push({id:'cycle',kind:'before',left:'tower',right:'anchor'});
 const result=analyzeEpisode(e);
 assert.equal(result.valid,true);
 assert.equal(result.clueOrderCount,0);
 assert.equal(result.mechanicalSuccess,false);
 assert.equal(result.outcome,'inconsistent');
});
