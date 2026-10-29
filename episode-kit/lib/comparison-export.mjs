import { canonicalJSON, sourceDigest } from './export.mjs';
import { COMPARISON_ENGINE_VERSION, compareEpisodes } from './compare.mjs';

const evidence = () => ({
  modelContributionVerified: false, nativeHumanPlaytestVerified: false,
  limitations: ['Encoded order-set and action checks only; no equivalence of meaning, difficulty or cultural suitability is established.',
    'Hashes bind caller-provided content, not author identity or independent provenance attestation.']
});

export async function createComparisonExport(source, target, mapping) {
  // Snapshot all inputs together before the first asynchronous digest operation.
  const snapshot = JSON.parse(canonicalJSON({ source, target, mapping: mapping === undefined ? null : mapping,
    comparisonEngineVersion: COMPARISON_ENGINE_VERSION }));
  const result = compareEpisodes(snapshot.source, snapshot.target, snapshot.mapping === null ? undefined : snapshot.mapping);
  if (!result.valid) throw new Error('Invalid comparison: ' + result.errors.join('; '));
  const [sourceSha256, targetSha256, bindingSha256] = await Promise.all([
    sourceDigest(snapshot.source), sourceDigest(snapshot.target), sourceDigest(snapshot)
  ]);
  return { schema: 'ludolingua.comparison-export.v1', source: snapshot.source, target: snapshot.target,
    mapping: snapshot.mapping,
    validation: { comparisonEngineVersion: COMPARISON_ENGINE_VERSION, sourceSha256, targetSha256, bindingSha256, result },
    evidence: evidence() };
}

export async function readComparisonExport(value) {
  const incoming = JSON.parse(canonicalJSON(typeof value === 'string' ? JSON.parse(value) : value));
  if (!incoming || incoming.schema !== 'ludolingua.comparison-export.v1' || !Object.hasOwn(incoming, 'mapping')) throw new Error('Invalid comparison export schema');
  const rebuilt = await createComparisonExport(incoming.source, incoming.target, incoming.mapping === null ? undefined : incoming.mapping);
  if (canonicalJSON(incoming.validation) !== canonicalJSON(rebuilt.validation)) throw new Error('Stale or altered comparison binding, engine or result');
  if (canonicalJSON(incoming.evidence) !== canonicalJSON(rebuilt.evidence)) throw new Error('Altered comparison evidence claims');
  return { source: rebuilt.source, target: rebuilt.target, mapping: rebuilt.mapping, validation: rebuilt.validation,
    integrity: { verified: true, bindingSha256: rebuilt.validation.bindingSha256 } };
}
