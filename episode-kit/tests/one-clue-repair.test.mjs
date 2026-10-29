import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEpisodes } from '../lib/compare.mjs';
import { MAX_REPAIR_CHECKS, suggestOneClueRepair } from '../lib/one-clue-repair.mjs';

function fixture(locale='en') {
  return {
    schema:'ludolingua.episode.v1',id:'repair-fixture-'+locale,revision:1,locale,
    title:'Independent fixture',story:'Find the encoded order.',
    cards:['key','bell','moon','star'].map((id,i)=>({id,label:['Otter','Pine','Eagle','Nest'][i]})),
    clues:[
      {id:'pair',kind:'immediately_before',left:'bell',right:'moon'},
      {id:'lead',kind:'before',left:'key',right:'bell'},
      {id:'tail',kind:'after',left:'star',right:'moon'}
    ],
    extraction:{kind:'first_letter',normalization:'NFC-uppercase'},
    action:{expected:'OPEN',answerNormalization:'NFC-trim-uppercase'},
    constraints:{labelsFrozen:false,requireUnique:true},
    hints:[],provenance:{kind:'authored',source:'Independent regression fixture',modelRun:null,humanPlaytest:null,semanticChanges:[]}
  };
}
const copy = x => structuredClone(x);
function apply(target, suggestion) {
  return {...target, clues:suggestion.operation==='add'
    ? [...target.clues, suggestion.clue]
    : target.clues.filter(c=>c.id!==suggestion.clue.id)};
}

test('a missing target relation gets a rechecked non-mutating add suggestion',()=>{
  const s=fixture(),t=copy(s);
  t.clues=t.clues.filter(c=>c.id!=='tail');const snap=JSON.stringify([s,t]);
  const proposal=suggestOneClueRepair(s,t);
  assert.equal(proposal.operation,'add');
  assert.deepEqual({kind:proposal.clue.kind,left:proposal.clue.left,right:proposal.clue.right},
    {kind:'after',left:'star',right:'moon'});
  assert.equal(proposal.beforeTotal>proposal.afterTotal,true);
  assert.equal(proposal.afterTotal,0);
  assert.equal(proposal.mechanicalPreserved,true);
  assert.equal(compareEpisodes(s,apply(t,proposal)).mechanicalPreserved,true);
  assert.equal(JSON.stringify([s,t]),snap);
});

test('an overrestrictive conflicting adaptation clue gets a safe removal',()=>{
  const s=fixture(),t=copy(s);
  t.clues.push({id:'contrary',kind:'before',left:'star',right:'key'});
  const p=suggestOneClueRepair(s,t);
  assert.equal(p.operation,'remove');
  assert.equal(p.clue.id,'contrary');
  assert.equal(p.afterTotal,0);
  assert.equal(compareEpisodes(s,apply(t,p)).mechanicalPreserved,true);
});

test('renamed roles are translated into adaptation identifiers',()=>{
  const s=fixture(),t=copy(s);
  const names={key:'llave',bell:'campana',moon:'luna',star:'estrella'};
  const map=Object.entries(names).map(([sourceId,targetId])=>({sourceId,targetId}));
  t.cards.forEach(c=>c.id=names[c.id]);
  t.clues.forEach(c=>{c.left=names[c.left];c.right=names[c.right];});
  t.clues=t.clues.filter(c=>c.id!=='tail');
  const p=suggestOneClueRepair(s,t,map);
  assert.equal(p.operation,'add');assert.equal(p.clue.left,'estrella');assert.equal(p.clue.right,'luna');
  assert.equal(compareEpisodes(s,apply(t,p),map).mechanicalPreserved,true);
});

test('invalid map, identical order sets, and changed-action-only failures yield no structural repair',()=>{
  const s=fixture(),t=copy(s);
  assert.equal(suggestOneClueRepair(s,t),null);
  t.action.expected='STOP';
  assert.equal(compareEpisodes(s,t).mechanicalPreserved,false);
  assert.equal(suggestOneClueRepair(s,t),null);
  t.clues=t.clues.slice(0,1);
  assert.equal(suggestOneClueRepair(s,t,null),null);
});

test('every proposed edit decreases both independent unmatched-order counts or leaves each unchanged',()=>{
  const s=fixture(),variants=[];
  for(let i=0;i<s.clues.length;i++){
    const t=copy(s);t.clues.splice(i,1);variants.push(t);
  }
  for (const clue of [
    {id:'extra',kind:'before',left:'star',right:'key'},
    {id:'extra',kind:'after',left:'key',right:'moon'},
    {id:'extra',kind:'immediately_before',left:'star',right:'key'}
  ]) {const t=copy(s);t.clues.push(clue);variants.push(t);}
  for(const t of variants){
    const baseline=compareEpisodes(s,t),p=suggestOneClueRepair(s,t);
    if(!p) continue;
    const after=compareEpisodes(s,apply(t,p));
    assert.ok(after.sourceOnlyCount <= baseline.sourceOnlyCount);
    assert.ok(after.targetOnlyCount <= baseline.targetOnlyCount);
    assert.ok(after.sourceOnlyCount+after.targetOnlyCount < baseline.sourceOnlyCount+baseline.targetOnlyCount);
    assert.equal(JSON.stringify(apply(t,p).clues).includes('repair-preview'),p.operation==='add');
  }
  assert.equal(MAX_REPAIR_CHECKS,12);
});

test('eight-card maximum remains bounded and recovers an omitted last-order relation',()=>{
  const ids=['a','b','c','d','e','f','g','h'];
  const s=fixture();
  s.cards=ids.map((id,i)=>({id,label:id.toUpperCase()+'ettle'}));
  s.clues=ids.slice(0,-1).map((id,i)=>({id:'link-'+i,kind:'immediately_before',left:id,right:ids[i+1]}));
  s.action.expected='ABCDEFGH';
  const t=copy(s);t.clues.pop();
  const p=suggestOneClueRepair(s,t);
  assert.equal(p.operation,'add');
  assert.equal(p.afterTotal,0);
  assert.equal(p.mechanicalPreserved,true);
  assert.equal(compareEpisodes(s,apply(t,p)).mechanicalPreserved,true);
});
