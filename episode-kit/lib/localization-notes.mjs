import { canonicalJSON, sourceDigest } from './export.mjs';
import { readComparisonExport, createComparisonExport } from './comparison-export.mjs';

export const LOCALIZATION_NOTES_SCHEMA = 'ludolingua.localization-notes.v1';
export const MAX_LOCALIZATION_NOTES_CHARS = 20_000;
export const MAX_LOCALIZATION_NOTES_BYTES = 20 * 1024 * 1024;
const keys = ['schema', 'comparison', 'notesText', 'evidence', 'contentSha256'];
const comparisonKeys = ['schema', 'source', 'target', 'mapping', 'validation', 'evidence'];
const exactKeys = (value, names) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key));
const evidence = () => ({
  kind: 'author-notes',
  limitations: [
    'These notes are authored statements, not independent verification of meaning, language quality, difficulty or cultural suitability.',
    'Content hashes bind the supplied notes and comparison; they do not authenticate an author or establish human playtesting or model contribution.'
  ]
});
function bounded(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_LOCALIZATION_NOTES_BYTES) {
    throw new Error('Localization notes file exceeds the 20 MiB limit.');
  }
  return text;
}
function snapshot(value) { return JSON.parse(bounded(canonicalJSON(value))); }
function validNotes(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_LOCALIZATION_NOTES_CHARS) {
    throw new Error('Localization notes must contain nonblank text of at most 20000 characters.');
  }
}
async function checkedComparison(value) {
  if (!exactKeys(value, comparisonKeys)) throw new Error('Invalid localization notes comparison shape.');
  const received = await readComparisonExport(value);
  const rebuilt = await createComparisonExport(received.source, received.target,
    received.mapping === null ? undefined : received.mapping);
  if (canonicalJSON(value) !== canonicalJSON(rebuilt)) throw new Error('Altered localization notes comparison.');
  return rebuilt;
}
function body(comparison, notesText) {
  return { schema: LOCALIZATION_NOTES_SCHEMA, comparison, notesText, evidence: evidence() };
}

export async function createLocalizationNotes(comparisonExport, notesText) {
  // Capture caller-owned content before any digest or comparison verification.
  const incoming = snapshot(comparisonExport);
  validNotes(notesText);
  const comparison = await checkedComparison(incoming);
  const payload = body(comparison, notesText);
  bounded(canonicalJSON(payload));
  const result = { ...payload, contentSha256: await sourceDigest(payload) };
  bounded(canonicalJSON(result));
  return result;
}

export async function readLocalizationNotes(value) {
  const incoming = snapshot(typeof value === 'string' ? JSON.parse(bounded(value)) : value);
  if (!exactKeys(incoming, keys) || incoming.schema !== LOCALIZATION_NOTES_SCHEMA ||
      typeof incoming.contentSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(incoming.contentSha256)) {
    throw new Error('Invalid localization notes file schema.');
  }
  validNotes(incoming.notesText);
  if (canonicalJSON(incoming.evidence) !== canonicalJSON(evidence())) throw new Error('Altered localization notes evidence.');
  const comparison = await checkedComparison(incoming.comparison);
  const payload = body(comparison, incoming.notesText);
  const digest = await sourceDigest(payload);
  if (digest !== incoming.contentSha256) throw new Error('Localization notes content digest mismatch.');
  return { ...payload, contentSha256: digest };
}
