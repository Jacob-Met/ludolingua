import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { checkAttempt, analyzeEpisode } from '../lib/engine.mjs';

const ORDER = ['key', 'bell', 'moon', 'star'];
function fixture(id) {
  const episode = EPISODES.find(entry => entry.id === id);
  assert.ok(episode, 'Missing fixture: ' + id);
  return structuredClone(episode);
}
test('a learner typo does not make the original episode an adaptation failure', () => {
  const episode = fixture('en-original');
  assert.deepEqual(checkAttempt(episode, ORDER, 'CLOSE'), {
    orderValid: true, cluesSatisfied: true, token: 'OPEN',
    tokenMatches: true, answerMatches: false, success: false
  });
  assert.deepEqual(checkAttempt(episode, ORDER, '  open \n'), {
    orderValid: true, cluesSatisfied: true, token: 'OPEN',
    tokenMatches: true, answerMatches: true, success: true
  });
});
test('literal Spanish remains incompatible with either attempted answer', () => {
  const episode = fixture('es-literal');
  assert.deepEqual(checkAttempt(episode, ORDER, 'ABRE'), {
    orderValid: true, cluesSatisfied: true, token: 'NPÁN',
    tokenMatches: false, answerMatches: true, success: false
  });
  assert.deepEqual(checkAttempt(episode, ORDER, 'NPÁN'), {
    orderValid: true, cluesSatisfied: true, token: 'NPÁN',
    tokenMatches: false, answerMatches: false, success: false
  });
});
test('a duplicate card cannot produce a valid attempt or matching token', () => {
  assert.deepEqual(checkAttempt(fixture('en-original'), ['key', 'bell', 'moon', 'moon'], 'OPEN'), {
    orderValid: false, cluesSatisfied: false, token: '',
    tokenMatches: false, answerMatches: false, success: false
  });
});
test('token matching preserves NFC normalization and uppercase expansion', () => {
  const episode = fixture('en-original');
  episode.id = 'unicode-attempt-feedback';
  episode.cards = [{ id: 'accent', label: 'Éclair' }, { id: 'expansion', label: 'ßeta' }];
  episode.clues = [{ id: 'one', kind: 'before', left: 'accent', right: 'expansion' }];
  episode.action.expected = 'ÉSS';
  episode.constraints = { labelsFrozen: false, requireUnique: true };
  for (const answer of ['  e\u0301ss \n', '  e\u0301ß \n']) {
    assert.deepEqual(checkAttempt(episode, ['accent', 'expansion'], answer), {
      orderValid: true, cluesSatisfied: true, token: 'ÉSS',
      tokenMatches: true, answerMatches: true, success: true
    });
  }
  assert.deepEqual(checkAttempt(episode, ['accent', 'expansion'], 'ESS'), {
    orderValid: true, cluesSatisfied: true, token: 'ÉSS',
    tokenMatches: true, answerMatches: false, success: false
  });
  const analysis = analyzeEpisode(episode);
  assert.equal(analysis.valid, true);
  assert.equal(analysis.permutationCount, 2);
  assert.equal(analysis.clueOrderCount, 1);
  assert.equal(analysis.actionMatchCount, 1);
  assert.equal(analysis.mechanicalSuccess, true);
  assert.equal(analysis.outcome, 'verified');
  assert.deepEqual(analysis.solutions, [{ order: ['accent', 'expansion'], token: 'ÉSS', actionMatches: true }]);
});
test('attempt feedback preserves established analysis and does not mutate input', () => {
  const original = fixture('en-original'), literal = fixture('es-literal');
  const originalSnapshot = structuredClone(original), literalSnapshot = structuredClone(literal);
  const originalBefore = analyzeEpisode(original), literalBefore = analyzeEpisode(literal);
  assert.equal(originalBefore.schema, 'ludolingua.analysis.v1');
  assert.equal(originalBefore.engineVersion, '0.1.0');
  assert.equal(originalBefore.valid, true);
  assert.deepEqual(originalBefore.errors, []);
  assert.equal(originalBefore.permutationCount, 24);
  assert.equal(originalBefore.clueOrderCount, 1);
  assert.equal(originalBefore.actionMatchCount, 1);
  assert.equal(originalBefore.uniqueReasoning, true);
  assert.equal(originalBefore.mechanicalSuccess, true);
  assert.equal(originalBefore.outcome, 'verified');
  assert.deepEqual(originalBefore.solutions, [{ order: ORDER, token: 'OPEN', actionMatches: true }]);
  assert.equal(literalBefore.schema, 'ludolingua.analysis.v1');
  assert.equal(literalBefore.engineVersion, '0.1.0');
  assert.equal(literalBefore.valid, true);
  assert.deepEqual(literalBefore.errors, []);
  assert.equal(literalBefore.permutationCount, 24);
  assert.equal(literalBefore.clueOrderCount, 1);
  assert.equal(literalBefore.actionMatchCount, 0);
  assert.equal(literalBefore.mechanicalSuccess, false);
  assert.equal(literalBefore.outcome, 'action-mismatch');
  for (const answer of ['CLOSE', 'OPEN']) checkAttempt(original, ORDER, answer);
  for (const answer of ['ABRE', 'NPÁN']) checkAttempt(literal, ORDER, answer);
  assert.deepEqual(original, originalSnapshot);
  assert.deepEqual(literal, literalSnapshot);
  assert.deepEqual(analyzeEpisode(original), originalBefore);
  assert.deepEqual(analyzeEpisode(literal), literalBefore);
});
