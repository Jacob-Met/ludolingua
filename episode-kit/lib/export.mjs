import { ENGINE_VERSION, validateEpisode, analyzeEpisode } from './engine.mjs';

export function canonicalJSON(value) {
  const seen = new Set();
  function encode(v) {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (typeof v !== 'object' || seen.has(v)) throw new Error('Expected acyclic JSON data');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error('Expected plain JSON object');
    seen.add(v);
    let result;
    if (Array.isArray(v)) {
      const parts = [];
      for (let i = 0; i < v.length; i++) {
        if (!Object.hasOwn(v, i)) throw new Error('Sparse arrays are not JSON data');
        parts.push(encode(v[i]));
      }
      result = '[' + parts.join(',') + ']';
    } else {
      if (Object.getOwnPropertySymbols(v).length) throw new Error('Symbol keys are not JSON data');
      result = '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + encode(v[k])).join(',') + '}';
    }
    seen.delete(v);
    return result;
  }
  return encode(value);
}

export async function sourceDigest(episode) {
  const bytes = new TextEncoder().encode(canonicalJSON(episode));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

const evidence = () => ({
  kind: 'authored-fixture',
  modelContributionVerified: false,
  nativeHumanPlaytestVerified: false,
  limitations: [
    'Mechanical checks certify only the encoded properties.',
    'No NVIDIA/Nebius model integration or native-language human playtest is established.',
    'Equivalent difficulty, cultural suitability and linguistic quality remain unverified.',
    'SHA256 binds content; it does not authenticate an author or attest provenance claims.'
  ]
});

export async function createExport(episode) {
  // Snapshot before awaiting the digest so later caller edits cannot race the binding.
  const snapshot = JSON.parse(canonicalJSON(episode));
  const valid = validateEpisode(snapshot);
  if (!valid.valid) throw new Error('Invalid episode: ' + valid.errors.join('; '));
  const result = analyzeEpisode(snapshot);
  return {
    schema: 'ludolingua.episode-export.v1', episode: snapshot,
    validation: { engineVersion: ENGINE_VERSION, episodeSha256: await sourceDigest(snapshot), result },
    evidence: evidence()
  };
}

export async function readExport(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  const incoming = JSON.parse(canonicalJSON(parsed));
  if (!incoming || incoming.schema !== 'ludolingua.episode-export.v1') throw new Error('Invalid export schema');
  const rebuilt = await createExport(incoming.episode);
  if (canonicalJSON(incoming.validation) !== canonicalJSON(rebuilt.validation)) throw new Error('Stale or altered validation, digest, or engine version');
  if (canonicalJSON(incoming.evidence) !== canonicalJSON(rebuilt.evidence)) throw new Error('Altered evidence claims');
  return { episode: rebuilt.episode, validation: rebuilt.validation,
    integrity: { verified: true, episodeSha256: rebuilt.validation.episodeSha256 } };
}
