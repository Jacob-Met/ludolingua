import { canonicalJSON, sourceDigest } from './export.mjs';
import { ENGINE_VERSION } from './engine.mjs';
import { PLAYTEST_ENGINE_VERSION, replayPlaytest } from './playtest.mjs';

const evidence = () => ({
  origin: 'client-recorded', timing: 'self-reported',
  humanIdentityAttested: false, nativeLanguageAttested: false,
  humanQualityVerified: false, modelContributionVerified: false,
  limitations: [
    'The journal records client events, not independently attested human participation.',
    'Timings are self-reported; no independent clock or identity verification is performed.',
    'A missing recorded hint or reveal does not establish unaided solving or exclude outside assistance.',
    'Replay and hashes do not certify language quality, native-language status, comparable difficulty or model contribution.',
    'Hashes are content bindings, not signatures; a consistently authored replacement journal is not authenticated.'
  ]
});

export async function createPlaytestRecord(episode, sessionId, events) {
  const snapshot = JSON.parse(canonicalJSON({ episode, sessionId, events }));
  if (typeof snapshot.sessionId !== 'string' || !snapshot.sessionId.trim()) throw new Error('A nonempty sessionId is required');
  const result = replayPlaytest(snapshot.episode, snapshot.events);
  if (!result.valid) throw new Error('Invalid playtest journal: ' + result.errors.join('; '));
  const binding = { ...snapshot, engineVersion: ENGINE_VERSION, playtestEngineVersion: PLAYTEST_ENGINE_VERSION, result };
  const [episodeSha256, bindingSha256] = await Promise.all([sourceDigest(snapshot.episode), sourceDigest(binding)]);
  return { schema: 'ludolingua.playtest-record.v1', ...snapshot,
    validation: { engineVersion: ENGINE_VERSION, playtestEngineVersion: PLAYTEST_ENGINE_VERSION, episodeSha256, bindingSha256, result },
    evidence: evidence() };
}

// The first playtest writer persisted the pre-tokenMatches attempt shape.
// Recognize only that 0.1.0 representation and validate its complete binding.
async function matchesLegacyAttemptValidation(incoming, rebuilt) {
  const oldValidation = incoming.validation, currentValidation = rebuilt.validation;
  if (oldValidation?.engineVersion !== '0.1.0' ||
      oldValidation?.playtestEngineVersion !== '0.1.0' ||
      currentValidation.engineVersion !== '0.1.0' ||
      currentValidation.playtestEngineVersion !== '0.1.0') return false;
  const oldAttempt = oldValidation.result?.finalState?.lastAttempt;
  const currentAttempt = currentValidation.result?.finalState?.lastAttempt;
  if (oldAttempt === null || typeof oldAttempt !== 'object' || Array.isArray(oldAttempt) ||
      Object.hasOwn(oldAttempt, 'tokenMatches') ||
      currentAttempt === null || typeof currentAttempt !== 'object' || Array.isArray(currentAttempt) ||
      !Object.hasOwn(currentAttempt, 'tokenMatches') || typeof currentAttempt.tokenMatches !== 'boolean') return false;
  // Project fresh replay output, never sanitize a supplied result.
  const legacyResult = JSON.parse(canonicalJSON(currentValidation.result));
  delete legacyResult.finalState.lastAttempt.tokenMatches;
  const legacyBinding = {
    episode: rebuilt.episode, sessionId: rebuilt.sessionId, events: rebuilt.events,
    engineVersion: '0.1.0', playtestEngineVersion: '0.1.0', result: legacyResult
  };
  const legacyValidation = {
    ...currentValidation, result: legacyResult,
    bindingSha256: await sourceDigest(legacyBinding)
  };
  return canonicalJSON(oldValidation) === canonicalJSON(legacyValidation);
}

export async function readPlaytestRecord(value) {
  const incoming = JSON.parse(canonicalJSON(typeof value === 'string' ? JSON.parse(value) : value));
  if (!incoming || incoming.schema !== 'ludolingua.playtest-record.v1') throw new Error('Invalid playtest record schema');
  const rebuilt = await createPlaytestRecord(incoming.episode, incoming.sessionId, incoming.events);
  if (canonicalJSON(incoming.validation) !== canonicalJSON(rebuilt.validation) &&
      !(await matchesLegacyAttemptValidation(incoming, rebuilt))) throw new Error('Stale or altered playtest binding, engine or replay result');
  if (canonicalJSON(incoming.evidence) !== canonicalJSON(rebuilt.evidence)) throw new Error('Altered playtest evidence claims');
  return { episode: rebuilt.episode, sessionId: rebuilt.sessionId, events: rebuilt.events,
    validation: rebuilt.validation, evidence: rebuilt.evidence,
    integrity: { verified: true, episodeSha256: rebuilt.validation.episodeSha256, bindingSha256: rebuilt.validation.bindingSha256 } };
}
