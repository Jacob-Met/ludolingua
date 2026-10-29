import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import {CASES} from './cases.mjs';
import {validateEpisode,analyzeEpisode,extractToken,checkAttempt} from '../../episode-kit/lib/engine.mjs';
import {createExport,readExport} from '../../episode-kit/lib/export.mjs';
import {createComparisonExport,readComparisonExport} from '../../episode-kit/lib/comparison-export.mjs';
const ids=['nest','sea','river','tower','landing'];
function* permutations(xs){
  if(!xs.length){yield [];return;}
  for(let i=0;i<xs.length;i++)for(const tail of permutations(xs.filter((_,j)=>i!==j)))yield [xs[i],...tail];
}
const orders=[...permutations(ids)];
// Independent model of the authored constraints, without importing the solver.
const predicates=[p=>p.landing>p.tower,p=>p.river===p.sea+1,p=>p.nest<p.sea,p=>p.tower===p.river+1];
const matching=omit=>orders.filter(order=>{
  const p=Object.fromEntries(order.map((id,i)=>[id,i]));
  return predicates.every((fn,i)=>i===omit||fn(p));
});
const expectedTokens=['NORTH','NORTP','NORTE'];
const independentToken=labels=>labels.map(s=>Array.from(s.trim().normalize('NFC'))[0].toUpperCase()).join('');
test('independent enumeration finds one order among 120',()=>{
  assert.equal(orders.length,120);assert.deepEqual(matching(-1),[ids]);
  assert.deepEqual(predicates.map((_,i)=>matching(i).length),[3,6,3,6]);
});
test('every authored clue contributes to uniqueness in every locale',()=>{
  for(const episode of CASES)for(let i=0;i<4;i++){
    const changed=structuredClone(episode);changed.clues.splice(i,1);
    assert.equal(analyzeEpisode(changed).clueOrderCount,matching(i).length);
  }
});
test('valid episodes preserve intended positive and negative mechanical outcomes',()=>{
  for(const [i,episode] of CASES.entries()){
    assert.equal(validateEpisode(episode).valid,true);
    const result=analyzeEpisode(episode);
    assert.equal(result.permutationCount,120);assert.equal(result.clueOrderCount,1);
    assert.equal(result.mechanicalSuccess,i!==1);
    assert.equal(independentToken(episode.cards.map(c=>c.label)),expectedTokens[i]);
    assert.equal(extractToken(episode,ids),expectedTokens[i]);
    assert.equal(checkAttempt(episode,ids,episode.action.expected).success,i!==1);
  }
  assert.equal(checkAttempt(CASES[1],ids,'NORTP').success,false);
});
test('Spanish adaptation changes one label while preserving shared construction',()=>{
  const literal=CASES[1],adapted=CASES[2];
  assert.deepEqual(literal.cards.map(c=>c.id),ids);assert.deepEqual(adapted.cards.map(c=>c.id),ids);
  assert.deepEqual(literal.cards.slice(0,4),adapted.cards.slice(0,4));
  assert.equal(literal.cards[4].label,'Puerto');assert.equal(adapted.cards[4].label,'Embarcadero');
  for(const field of ['title','story','hints','clues','extraction','action','constraints'])assert.deepEqual(literal[field],adapted[field]);
  for(const episode of CASES){assert.deepEqual(episode.clues,CASES[0].clues);assert.equal(episode.provenance.modelRun,null);assert.equal(episode.provenance.humanPlaytest,null);}
  assert.notEqual(literal.id,adapted.id);assert.notDeepEqual(literal.provenance.semanticChanges,adapted.provenance.semanticChanges);
});
test('checked episode exports retain exact content and honest negative evidence',async()=>{
  const names=['01-en-source.json','02-es-literal-contrast.json','03-es-adapted.json'];
  for(const [i,episode] of CASES.entries()){
    const exported=await createExport(episode);
    const committed=JSON.parse(await fs.readFile(new URL('./exports/episodes/'+names[i],import.meta.url),'utf8'));
    assert.deepEqual(committed,exported);
    const received=await readExport(committed);assert.deepEqual(received.episode,episode);
    assert.equal(received.validation.result.mechanicalSuccess,i!==1);
    assert.equal(exported.evidence.modelContributionVerified,false);assert.equal(exported.evidence.nativeHumanPlaytestVerified,false);
  }
});
test('checked comparisons preserve both episodes and exact role mapping',async()=>{
  const mapping=ids.map(id=>({sourceId:id,targetId:id}));
  for(const [i,name] of [[1,'source-vs-literal.json'],[2,'source-vs-adapted.json']]){
    const exported=await createComparisonExport(CASES[0],CASES[i],mapping);
    const committed=JSON.parse(await fs.readFile(new URL('./exports/comparisons/'+name,import.meta.url),'utf8'));
    assert.deepEqual(committed,exported);
    const received=await readComparisonExport(committed);
    assert.deepEqual(received.source,CASES[0]);assert.deepEqual(received.target,CASES[i]);assert.deepEqual(received.mapping,mapping);
    assert.equal(received.integrity.verified,true);
  }
});
