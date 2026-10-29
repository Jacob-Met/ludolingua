import { canonicalJSON } from './export.mjs';

export const WORKSPACE_SCHEMA = 'ludolingua.workspace.v1';
export const MAX_WORKSPACE_BYTES = 20_000_000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// Bound rendered collections separately from the overall serialized-size ceiling.
const text = value => typeof value === 'string' && value.length <= 1_000_000;
const nonempty = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const locale = value => value === 'en' || value === 'es';
function need(condition, message) { if (!condition) throw new Error(`Invalid workspace: ${message}`); }
function keys(value, expected, label) {
  need(object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), `${label} fields`);
}
function episodeShape(e, label) {
  need(object(e) && e.schema === 'ludolingua.episode.v1', `${label} schema`);
  need(nonempty(e.id) && text(e.title) && text(e.story), `${label} text`);
  need(Number.isSafeInteger(e.revision) && e.revision > 0 && locale(e.locale), `${label} revision or locale`);
  need(Array.isArray(e.cards) && e.cards.length >= 2 && e.cards.length <= 8, `${label} cards`);
  const ids = new Set();
  for (const card of e.cards) {
    need(object(card) && nonempty(card.id) && !ids.has(card.id) && text(card.label) && card.label.length <= 10_000, `${label} card fields`);
    ids.add(card.id);
  }
  need(Array.isArray(e.clues) && e.clues.length <= 128, `${label} clues`);
  const clueIds = new Set();
  for (const clue of e.clues) {
    need(object(clue) && nonempty(clue.id) && !clueIds.has(clue.id), `${label} clue identity`);
    need(['before', 'after', 'immediately_before'].includes(clue.kind) && ids.has(clue.left) && ids.has(clue.right), `${label} clue relation`);
    clueIds.add(clue.id);
  }
  need(object(e.extraction) && e.extraction.kind === 'first_letter' && e.extraction.normalization === 'NFC-uppercase', `${label} extraction`);
  need(object(e.action) && text(e.action.expected) && e.action.answerNormalization === 'NFC-trim-uppercase', `${label} action`);
  need(object(e.constraints) && typeof e.constraints.labelsFrozen === 'boolean' && typeof e.constraints.requireUnique === 'boolean', `${label} constraints`);
  need(Array.isArray(e.hints) && e.hints.length <= 256 && e.hints.every(text), `${label} hints`);
  const p = e.provenance;
  need(object(p) && p.kind === 'authored' && text(p.source) && p.modelRun === null && p.humanPlaytest === null && Array.isArray(p.semanticChanges) && p.semanticChanges.length <= 256 && p.semanticChanges.every(text), `${label} provenance`);
  if (e.hintReview !== undefined) {
    need(object(e.hintReview) && ['needs-author-review', 'author-reviewed'].includes(e.hintReview.status) && e.hintReview.kind === 'author-self-declaration', `${label} hint review`);
    if (e.hintReview.status === 'author-reviewed') need(Number.isSafeInteger(e.hintReview.revision) && e.hintReview.revision > 0, `${label} hint review revision`);
  }
  return ids;
}
function validate(snapshot) {
  keys(snapshot, ['schema', 'episode', 'comparison', 'player', 'uiLocale', 'hintDraft', 'mode'], 'root');
  need(snapshot.schema === WORKSPACE_SCHEMA, 'unsupported schema');
  need(locale(snapshot.uiLocale), 'UI locale');
  need(snapshot.mode === 'author' || snapshot.mode === 'player', 'mode');
  const targetIds = episodeShape(snapshot.episode, 'episode');
  keys(snapshot.comparison, ['source', 'mapping'], 'comparison');
  const sourceIds = episodeShape(snapshot.comparison.source, 'source');
  const mapping = snapshot.comparison.mapping;
  need(Array.isArray(mapping) && mapping.length === sourceIds.size, 'mapping coverage');
  const seen = new Set();
  for (const pair of mapping) {
    keys(pair, ['sourceId', 'targetId'], 'mapping pair');
    need(sourceIds.has(pair.sourceId) && !seen.has(pair.sourceId) && (pair.targetId === '' || targetIds.has(pair.targetId)), 'mapping role');
    seen.add(pair.sourceId);
  }
  const player = snapshot.player;
  keys(player, ['order', 'answer', 'hintCount', 'revealed', 'attempted'], 'player');
  need(Array.isArray(player.order) && player.order.length === targetIds.size && new Set(player.order).size === targetIds.size && player.order.every(id => targetIds.has(id)), 'player order');
  need(text(player.answer) && typeof player.revealed === 'boolean' && typeof player.attempted === 'boolean', 'player fields');
  need(Number.isSafeInteger(player.hintCount) && player.hintCount >= 0 && player.hintCount <= snapshot.episode.hints.length, 'hint count');
  need(text(snapshot.hintDraft), 'hint draft');
  const lines = snapshot.hintDraft.split('\n').filter(line => line.trim().length);
  need(lines.length === snapshot.episode.hints.length && lines.every((line, index) => line === snapshot.episode.hints[index]), 'hint draft differs from episode hints');
}

/** Persist only editable state. Validation results and export authority are never saved. */
export function createWorkspaceSnapshot({ episode, comparison, player, uiLocale, hintDraft, mode = 'author' }) {
  return readWorkspaceSnapshot({ schema: WORKSPACE_SCHEMA, episode, comparison, player, uiLocale, hintDraft, mode });
}

/** Validate before touching live state. This is structural admission, not puzzle verification. */
export function readWorkspaceSnapshot(input) {
  let value;
  if (typeof input === 'string') {
    need(new TextEncoder().encode(input).byteLength <= MAX_WORKSPACE_BYTES, 'snapshot exceeds 20 MB');
    value = JSON.parse(input);
  } else value = input;
  // Canonical serialization rejects cycles, non-JSON values and custom prototypes,
  // and yields a detached plain-data clone without trusting toJSON hooks.
  const encoded = canonicalJSON(value);
  need(new TextEncoder().encode(encoded).byteLength <= MAX_WORKSPACE_BYTES, 'snapshot exceeds 20 MB');
  const snapshot = JSON.parse(encoded);
  validate(snapshot);
  return snapshot;
}
