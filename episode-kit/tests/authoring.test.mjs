import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginalEpisode } from '../lib/authoring.mjs';
import { analyzeEpisode, checkAttempt } from '../lib/engine.mjs';
import { createExport, readExport } from '../lib/export.mjs';

const input = (changes = {}) => ({ title: 'A message in order', story: 'Arrange the keepers and read their initials.', locale: 'en', labels: ['Sun', 'Apple', 'Yarn'], action: 'SAY', ...changes });
const make = changes => createOriginalEpisode(input(changes), { id: 'original-native-example' });
const order = ['keeper-1', 'keeper-2', 'keeper-3'];
const chain = [
  { id: 'clue-1', kind: 'before', left: 'keeper-1', right: 'keeper-2' },
  { id: 'clue-2', kind: 'before', left: 'keeper-2', right: 'keeper-3' }
];

test('original authoring narrows six orders to three to one and restores ambiguity when clues are removed', async () => {
  const episode = make(), counts = [];
  function check(count) {
    const result = analyzeEpisode(episode);
    assert.equal(result.valid, true); assert.equal(result.permutationCount, 6);
    assert.equal(result.clueOrderCount, count); counts.push(count);
    assert.equal(result.mechanicalSuccess, count === 1);
    return result;
  }
  const initial = check(6);
  assert.equal(initial.outcome, 'ambiguous'); assert.equal(initial.actionMatchCount, 1);
  episode.clues.push(structuredClone(chain[0])); check(3);
  episode.clues.push(structuredClone(chain[1]));
  assert.deepEqual(check(1).solutions, [{ order, token: 'SAY', actionMatches: true }]);
  assert.equal(checkAttempt(episode, order, '  say  ').success, true);
  assert.equal(checkAttempt(episode, [...order].reverse(), 'SAY').success, false);
  assert.equal(checkAttempt(episode, order, 'NO').success, false);
  const snapshot = structuredClone(episode), exported = await createExport(episode);
  const received = await readExport(JSON.stringify(exported));
  assert.equal(received.integrity.verified, true);
  assert.deepEqual(received.episode, snapshot);
  assert.deepEqual(analyzeEpisode(received.episode), analyzeEpisode(snapshot));
  episode.clues.pop(); check(3); episode.clues.pop(); check(6);
  assert.deepEqual(counts, [6, 3, 1, 3, 6]);
  assert.deepEqual(exported.episode, snapshot);
  const unfinished = await readExport(JSON.stringify(await createExport(episode)));
  assert.equal(unfinished.validation.result.outcome, 'ambiguous');
});

test('two and eight cards retain complete unconstrained order spaces', () => {
  for (const [count, permutations] of [[2, 2], [8, 40320]]) {
    const labels = Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index) + ' card');
    const result = analyzeEpisode(make({ labels, action: labels.map(x => x[0]).join('') }));
    assert.equal(result.clueOrderCount, permutations);
    assert.equal(result.solutions.length, permutations);
    assert.equal(result.outcome, 'ambiguous');
  }
});

test('explicit Spanish episode retains raw Unicode and whitespace through export', async () => {
  const raw = input({ title: '  Un mensaje\nnuevo  ', story: 'Primera línea.\nSegunda línea.', locale: 'es', labels: [' E\u0301toile ', 'Árbol', 'Yuzu'], action: '  e\u0301áy\n' });
  const episode = createOriginalEpisode(raw, { id: 'original-unicode' }); episode.clues = structuredClone(chain);
  assert.equal(episode.title, raw.title); assert.equal(episode.story, raw.story);
  assert.deepEqual(episode.cards.map(x => x.label), raw.labels); assert.equal(episode.action.expected, raw.action);
  assert.equal(episode.locale, 'es'); assert.equal(checkAttempt(episode, order, 'ÉÁY').success, true);
  const received = await readExport(JSON.stringify(await createExport(episode)));
  assert.deepEqual(received.episode, episode);
});

test('original episodes have independent state and do not invent reasoning or attest playtests', () => {
  const raw = input({ clues: [{ id: 'injected' }] });
  const first = createOriginalEpisode(raw, { id: 'first' }), second = createOriginalEpisode(raw, { id: 'second' });
  raw.labels[0] = 'Changed input'; raw.labels.push('Extra input'); raw.title = 'Changed';
  assert.equal(first.cards[0].label, 'Sun'); assert.equal(first.cards.length, 3);
  assert.deepEqual(first.clues, []); assert.deepEqual(first.hints, []);
  first.cards[0].label = 'Changed output'; first.hints.push('Hint'); first.provenance.semanticChanges.push('Edit');
  assert.equal(second.cards[0].label, 'Sun'); assert.deepEqual(second.hints, []); assert.deepEqual(second.provenance.semanticChanges, []);
  assert.equal(second.provenance.modelRun, null); assert.equal(second.provenance.humanPlaytest, null);
  assert.equal(analyzeEpisode(make({ action: 'ZZZ' })).actionMatchCount, 0);
  assert.equal(analyzeEpisode(make({ labels: ['Sun', 'Sun'], action: 'SS' })).clueOrderCount, 2);
});

test('invalid authoring input cannot be silently clipped or normalized into a different episode', () => {
  for (const value of [null, undefined, [], 'text', 3, true]) assert.throws(() => createOriginalEpisode(value), /input must be an object/);
  for (const labels of [null, undefined, 'Sun, Apple', {}, 3]) assert.throws(() => make({ labels }), /labels must be an array/);
  for (const count of [0, 1, 9]) assert.throws(() => make({ labels: Array.from({ length: count }, () => 'Card') }), /2\.\.8 cards/);
  for (const labels of [['', 'Apple'], ['   ', 'Apple'], ['1Sun', 'Apple'], [null, 'Apple'], [42, 'Apple'], new Array(2)]) assert.throws(() => make({ labels }), /Invalid episode/);
  assert.throws(() => createOriginalEpisode(input()), /Invalid episode/);
  for (const locale of [undefined, '', 'fr']) assert.throws(() => make({ locale }), /Invalid episode/);
  for (const field of ['title', 'story', 'action']) assert.throws(() => make({ [field]: '' }), /Invalid episode/);
});
