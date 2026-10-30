import { validateEpisode } from './engine.mjs';
import { canonicalJSON, sourceDigest } from './export.mjs';
import { captureDraft, readDraft } from './drafts.mjs';

export const DRAFT_FILE_SCHEMA = 'ludolingua.author-draft-file.v1';
export const MAX_DRAFT_FILE_BYTES = 20_000_000;
const keys = ['schema', 'sourceEpisode', 'sourceSha256', 'draft', 'contentSha256'];
const digestPattern = /^[0-9a-f]{64}$/;

function bounded(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_DRAFT_FILE_BYTES) {
    throw new Error('Author draft file exceeds the 20 MB limit.');
  }
  return text;
}
function snapshot(value) {
  return JSON.parse(bounded(canonicalJSON(value)));
}
function validateSource(source) {
  const result = validateEpisode(source);
  if (!result.valid) throw new Error('Invalid original episode: ' + result.errors.join('; '));
}
function payload(envelope) {
  const { schema, sourceEpisode, sourceSha256, draft } = envelope;
  return { schema, sourceEpisode, sourceSha256, draft };
}

// This is a portable unfinished work record, not a checked playable export.
// Digests detect content mismatch; they do not authenticate authors/provenance.
export async function createDraftFile(sourceEpisode, editedEpisode, token, hintText) {
  // Capture caller-owned data before yielding to hashing.
  const source = snapshot(sourceEpisode);
  const edited = snapshot(editedEpisode);
  validateSource(source);
  const sourceSha256 = await sourceDigest(source);
  const draft = captureDraft(source, sourceSha256, edited, token, hintText);
  const body = { schema: DRAFT_FILE_SCHEMA, sourceEpisode: source, sourceSha256, draft };
  bounded(canonicalJSON(body));
  const envelope = { ...body, contentSha256: await sourceDigest(body) };
  bounded(canonicalJSON(envelope));
  return envelope;
}

export async function readDraftFile(value) {
  // Strings are byte-bounded before parsing; objects are snapshotted before await.
  const incoming = snapshot(typeof value === 'string' ? JSON.parse(bounded(value)) : value);
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) ||
      Object.keys(incoming).length !== keys.length || !keys.every(key => Object.hasOwn(incoming, key)) ||
      incoming.schema !== DRAFT_FILE_SCHEMA || typeof incoming.sourceSha256 !== 'string' ||
      !digestPattern.test(incoming.sourceSha256) || typeof incoming.contentSha256 !== 'string' ||
      !digestPattern.test(incoming.contentSha256)) throw new Error('Invalid author draft file schema.');
  validateSource(incoming.sourceEpisode);
  const sourceSha256 = await sourceDigest(incoming.sourceEpisode);
  if (sourceSha256 !== incoming.sourceSha256) throw new Error('Original episode digest mismatch.');
  const contentSha256 = await sourceDigest(payload(incoming));
  if (contentSha256 !== incoming.contentSha256) throw new Error('Author draft content digest mismatch.');
  const restored = readDraft(JSON.stringify(incoming.draft), incoming.sourceEpisode, sourceSha256);
  if (restored.state !== 'ready') throw new Error('Invalid or incompatible author draft record.');
  return {
    sourceEpisode: incoming.sourceEpisode, sourceSha256,
    episode: restored.episode, hintText: restored.hintText, token: incoming.draft.token,
    integrity: { verified: true, contentSha256 }
  };
}
