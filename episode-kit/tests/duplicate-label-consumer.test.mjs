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


const visibleName = value => value.trim().normalize('NFC').replace(/\s+/gu, ' ');

test('an authored name cannot collide with an identity added to a different card', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  e.cards[0].label = 'Pine';
  e.cards[1].label = 'Pine';
  e.cards[2].label = 'Pine (key)';
  e.action.expected = 'PPPN';
  const original = structuredClone(e);
  const labels = e.cards.map(card => displayCardLabel(e, card));
  assert.equal(new Set(labels.map(visibleName)).size, e.cards.length);
  assert.deepEqual(labels, ['Pine (key) [1]', 'Pine (bell)', 'Pine (key) [3]', 'Nest']);
  assert.equal(clueText(e, e.clues.find(clue => clue.id === 'lead')), 'Pine (key) [1] comes before Pine (bell).');
  assert.equal(analyzeEpisode(e).mechanicalSuccess, true);
  assert.equal(checkAttempt(e, ['key', 'bell', 'moon', 'star'], 'PPPN').success, true);
  assert.deepEqual(e, original);
});

test('distinct IDs that normalize to the same visible name keep distinct stable display identities', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  const mapping = new Map([['key', 'café'], ['bell', 'cafe\u0301']]);
  e.cards = e.cards.map(card => ({...card, id: mapping.get(card.id) ?? card.id}));
  e.clues = e.clues.map(clue => ({...clue, left: mapping.get(clue.left) ?? clue.left, right: mapping.get(clue.right) ?? clue.right}));
  e.cards[0].label = e.cards[1].label = 'Pine';
  e.action.expected = 'PPEN';
  const labels = e.cards.map(card => displayCardLabel(e, card));
  assert.equal(analyzeEpisode(e).mechanicalSuccess, true);
  assert.equal(new Set(labels.map(visibleName)).size, e.cards.length);
  assert.ok(labels[0].endsWith(' [1]'));
  assert.ok(labels[1].endsWith(' [2]'));
  const shuffled = [e.cards[2], e.cards[0], e.cards[3], e.cards[1]];
  assert.deepEqual(shuffled.map(card => displayCardLabel(e, card)), [labels[2], labels[0], labels[3], labels[1]]);
});

test('names that collapse to the same displayed whitespace receive distinct identities', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  e.cards[0].label = 'Pine  Tree';
  e.cards[1].label = 'Pine\tTree';
  e.action.expected = 'PPEN';
  const labels = e.cards.map(card => displayCardLabel(e, card));
  assert.equal(new Set(labels.map(visibleName)).size, e.cards.length);
  assert.match(labels[0], /\(key\)$/u);
  assert.match(labels[1], /\(bell\)$/u);
  assert.equal(analyzeEpisode(e).mechanicalSuccess, true);
});

test('all eight repeated names stay distinguishable without changing their initials or order rules', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  e.cards = Array.from({length: 8}, (_, i) => ({id: 'card-' + i, label: 'Pine'}));
  e.clues = e.cards.slice(1).map((card, i) => ({id: 'next-' + i, kind: 'immediately_before', left: e.cards[i].id, right: card.id}));
  e.action.expected = 'PPPPPPPP';
  const labels = e.cards.map(card => displayCardLabel(e, card));
  assert.equal(new Set(labels.map(visibleName)).size, 8);
  const result = analyzeEpisode(e);
  assert.equal(result.permutationCount, 40320);
  assert.equal(result.mechanicalSuccess, true);
  assert.equal(checkAttempt(e, e.cards.map(card => card.id), 'PPPPPPPP').success, true);
});


test('reserved authored names survive multiple suffix collisions and render order changes', () => {
  const e = structuredClone(EPISODES.find(item => item.id === 'en-original'));
  e.cards = [
    {id:'key',label:'Pine'}, {id:'bell',label:'Pine'}, {id:'moon',label:'Pine  (key)'},
    {id:'star',label:'Pine (key) [1]'}, {id:'sun',label:'Pine (key) [1] [1]'},
  ];
  e.clues = e.cards.slice(1).map((card, i) => ({id:'next-' + i,kind:'immediately_before',left:e.cards[i].id,right:card.id}));
  e.action.expected = 'PPPPP';
  const source = structuredClone(e);
  const labels = e.cards.map(card => displayCardLabel(e, card));
  assert.equal(analyzeEpisode(e).mechanicalSuccess, true);
  assert.equal(new Set(labels.map(visibleName)).size, e.cards.length);
  assert.equal(labels[0], 'Pine (key) [1] [1] [1]');
  assert.equal(labels[2], 'Pine  (key) [3]');
  assert.equal(labels[3], source.cards[3].label);
  assert.equal(labels[4], source.cards[4].label);
  assert.deepEqual([...e.cards].reverse().map(card => displayCardLabel(e, card)), [...labels].reverse());
  assert.deepEqual(e, source);
});
