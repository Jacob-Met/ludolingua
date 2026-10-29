import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { analyzeEpisode, checkAttempt, clueText, displayCardLabel } from '../lib/engine.mjs';

test('source cards without duplicate visible labels keep their exact presentation', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  for (const c of e.cards) assert.equal(displayCardLabel(e,c),c.label);
  assert.equal(clueText(e,e.clues.find(c => c.id === 'lead')),'Otter comes before Pine.');
  assert.equal(analyzeEpisode(e).outcome,'verified');
});

test('duplicate named keepers get stable visual and spoken identities without changing puzzle rules', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  e.cards[0].label = e.cards[1].label;
  e.action.expected = 'PPEN';
  const r = analyzeEpisode(e);
  assert.equal(r.valid,true);
  assert.equal(r.clueOrderCount,1);
  assert.equal(r.mechanicalSuccess,true);
  assert.equal(displayCardLabel(e,e.cards[0]),'Pine (key)');
  assert.equal(displayCardLabel(e,e.cards[1]),'Pine (bell)');
  assert.equal(clueText(e,e.clues.find(c => c.id === 'lead')),'Pine (key) comes before Pine (bell).');
  assert.equal(checkAttempt(e,['key','bell','moon','star'],'PPEN').success,true);
});

test('visually equivalent NFC and trimmed labels are still distinguished; different words are untouched', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  const decomposed = 'Píno'.normalize('NFD'); e.cards[0].label = `  ${decomposed}  `;
  e.cards[1].label = 'Píno';
  assert.equal(displayCardLabel(e,e.cards[0]),`${decomposed} (key)`);
  assert.equal(displayCardLabel(e,e.cards[1]),'Píno (bell)');
  assert.equal(displayCardLabel(e,e.cards[2]),'Eagle');
  assert.equal(displayCardLabel(e,{id:'unknown',label:'Different'}),'Different');
  assert.equal(displayCardLabel(e,{id:'key',label:''}),'');
});

test('Spanish relation also names duplicate identities while normal evidence remains unchanged', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'es-adapted'));
  e.cards[0].label = 'Barco';
  const clue = e.clues.find(c => c.id === 'lead');
  assert.equal(clueText(e,clue),'Barco (key) va antes de Barco (bell).');
  assert.equal(displayCardLabel(e,e.cards[2]),'Roca');
});
