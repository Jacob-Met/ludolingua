import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNAL_PANEL_EPISODES } from '../fixtures/signal-panel.mjs';
import { EPISODES } from '../fixtures/episodes.mjs';
import { analyzeEpisode, checkAttempt, clueText } from '../lib/engine.mjs';
import { compareEpisodes } from '../lib/compare.mjs';
import { createExport, readExport } from '../lib/export.mjs';
import { createComparisonExport, readComparisonExport } from '../lib/comparison-export.mjs';

// Fixed witnesses and oracle relations were independently derived from player text.
// The oracle does not call the application's solver or derive answers from its output.
const ids = ['pine', 'river', 'ember', 'stone', 'star'];
const swapped = ['pine', 'river', 'ember', 'star', 'stone'];
const relations = [
  ['before', 'ember', 'star'], ['before', 'river', 'ember'],
  ['before', 'stone', 'star'], ['before', 'pine', 'river'],
  ['before', 'ember', 'stone']
];
const incomplete = relations.filter(([, left, right]) => !(left === 'stone' && right === 'star'));
const byId = id => SIGNAL_PANEL_EPISODES.find(episode => episode.id === id);
function permutations(values) {
  return values.length
    ? values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index)).map(tail => [value, ...tail]))
    : [[]];
}
function satisfies(order, clues) {
  const positions = new Map(order.map((id, index) => [id, index]));
  return clues.every(([kind, left, right]) => {
    assert.ok(positions.has(left) && positions.has(right));
    if (kind === 'before') return positions.get(left) < positions.get(right);
    if (kind === 'after') return positions.get(left) > positions.get(right);
    if (kind === 'immediately_before') return positions.get(left) + 1 === positions.get(right);
    assert.fail('Unexpected relation: ' + kind);
  });
}
const project = episode => episode.clues.map(({ kind, left, right }) => [kind, left, right]);
const all = permutations(ids);

test('five-card catalog matches independent player-text relations and fixed labels', () => {
  assert.equal(all.length, 120);
  assert.deepEqual(all.filter(order => satisfies(order, relations)), [ids]);
  assert.deepEqual(all.filter(order => satisfies(order, incomplete)), [ids, swapped]);
  assert.equal(satisfies(ids, [['immediately_before', 'pine', 'ember']]), false);
  const expected = [
    ['en-signal-original', 'en', ['Pine', 'River', 'Ember', 'Stone', 'Star'], 'PRESS', relations],
    ['es-signal-literal', 'es', ['Pino', 'Río', 'Brasa', 'Piedra', 'Estrella'], 'PULSA', relations],
    ['es-signal-adapted', 'es', ['Pulpo', 'Uva', 'Luna', 'Sol', 'Ancla'], 'PULSA', relations],
    ['en-signal-ambiguous', 'en', ['Pine', 'River', 'Ember', 'Stone', 'Star'], 'PRESS', incomplete]
  ];
  for (const [id, locale, labels, action, clues] of expected) {
    const episode = byId(id);
    assert.equal(episode.locale, locale);
    assert.deepEqual(episode.cards.map(card => card.id), ids);
    assert.deepEqual(episode.cards.map(card => card.label), labels);
    assert.equal(episode.action.expected, action);
    assert.equal(episode.constraints.requireUnique, true);
    assert.deepEqual(project(episode), clues);
    assert.equal(EPISODES.filter(item => item.id === id).length, 1);
    assert.equal(episode.provenance.modelRun, null);
    assert.equal(episode.provenance.humanPlaytest, null);
  }
  assert.equal(new Set(EPISODES.map(episode => episode.id)).size, EPISODES.length);
});

test('positive and literal episodes count reasoning independently from their expected action', () => {
  for (const [id, token, matches, success] of [
    ['en-signal-original', 'PRESS', 1, true],
    ['es-signal-literal', 'PRBPE', 0, false],
    ['es-signal-adapted', 'PULSA', 1, true]
  ]) {
    const episode = byId(id), result = analyzeEpisode(episode);
    assert.equal(result.valid, true);
    assert.equal(result.permutationCount, 120);
    assert.equal(result.clueOrderCount, 1);
    assert.equal(result.actionMatchCount, matches);
    assert.equal(result.mechanicalSuccess, success);
    assert.equal(result.outcome, success ? 'verified' : 'action-mismatch');
    assert.deepEqual(result.solutions.map(solution => solution.order), [ids]);
    assert.equal(result.solutions[0].token, token);
    assert.equal(checkAttempt(episode, ids, episode.action.expected).success, success);
  }
  assert.equal(clueText(byId('es-signal-adapted'), byId('es-signal-adapted').clues[2]), 'Sol va antes de Ancla.');
});

test('identical extracted words cannot erase two distinct reasoning orders', () => {
  const episode = byId('en-signal-ambiguous'), result = analyzeEpisode(episode);
  assert.equal(result.valid, true);
  assert.equal(result.permutationCount, 120);
  assert.equal(result.clueOrderCount, 2);
  assert.equal(result.actionMatchCount, 2);
  assert.equal(result.outcome, 'ambiguous');
  assert.equal(result.uniqueReasoning, false);
  assert.equal(result.mechanicalSuccess, false);
  assert.deepEqual(result.solutions.map(solution => solution.order), [ids, swapped]);
  assert.deepEqual(result.solutions.map(solution => solution.token), ['PRESS', 'PRESS']);
  for (const order of [ids, swapped]) assert.equal(checkAttempt(episode, order, ' press ').success, true);
  assert.equal(analyzeEpisode({ ...structuredClone(episode), action: { ...episode.action, expected: 'OTHER' } }).clueOrderCount, 2);
});

test('comparison preserves the coordinated adaptation but exposes literal and missing-clue limits', () => {
  const source = byId('en-signal-original');
  const adapted = compareEpisodes(source, byId('es-signal-adapted'));
  assert.equal(adapted.valid, true); assert.equal(adapted.sameOrderSet, true);
  assert.equal(adapted.mechanicalPreserved, true);
  assert.equal(adapted.roleChanges.filter(role => role.labelChanged).length, 5);
  const literal = compareEpisodes(source, byId('es-signal-literal'));
  assert.equal(literal.sameOrderSet, true); assert.equal(literal.mechanicalPreserved, false);
  const missing = compareEpisodes(source, byId('en-signal-ambiguous'));
  assert.equal(missing.sameOrderSet, false); assert.equal(missing.mechanicalPreserved, false);
  assert.equal(missing.targetOnlyCount, 1);
  assert.deepEqual(missing.targetOnlyWitness.targetOrder, swapped);
});

test('positive and same-word ambiguous evidence survive export without upgrading claims', async () => {
  for (const id of ['es-signal-adapted', 'en-signal-ambiguous']) {
    const episode = byId(id), artifact = await createExport(episode);
    const received = await readExport(JSON.stringify(artifact));
    assert.deepEqual(received.episode, episode);
    assert.deepEqual(received.validation.result, analyzeEpisode(episode));
    assert.equal(artifact.evidence.modelContributionVerified, false);
    assert.equal(artifact.evidence.nativeHumanPlaytestVerified, false);
  }
  const artifact = await createComparisonExport(byId('en-signal-original'), byId('es-signal-adapted'));
  assert.equal((await readComparisonExport(artifact)).validation.result.mechanicalPreserved, true);
});
