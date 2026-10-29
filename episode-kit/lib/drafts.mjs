import { canonicalJSON } from './export.mjs';

export const DRAFT_SCHEMA = 'ludolingua.author-draft.v1';
const SHA256 = /^[0-9a-f]{64}$/i;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nonemptyString = value => typeof value === 'string' && value.length > 0;
const validDigest = value => typeof value === 'string' && SHA256.test(value);

function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every(key => own(value, key));
}
function validSource(source) {
  if (!isObject(source) || !nonemptyString(source.id) || !positiveInteger(source.revision) ||
      !Array.isArray(source.cards) || source.cards.length < 2 || source.cards.length > 8 ||
      !isObject(source.constraints) || typeof source.constraints.labelsFrozen !== 'boolean' ||
      !isObject(source.action) || typeof source.action.expected !== 'string') return false;
  const ids = new Set();
  for (const card of source.cards) {
    if (!isObject(card) || !nonemptyString(card.id) || typeof card.label !== 'string' || ids.has(card.id)) return false;
    ids.add(card.id);
  }
  return true;
}
const REVIEW_REASON = 'Labels, ordering clues or hints changed.';
const CLUE_KINDS = new Set(['before', 'after', 'immediately_before']);
const validHints = hints => Array.isArray(hints) && hints.every(hint => typeof hint === 'string');
const hintsFromText = text => text.split('\n').filter(line => line.trim().length > 0);
const sameStrings = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
function validClues(clues, cards) {
  if (!Array.isArray(clues) || !Array.isArray(cards)) return false;
  const cardIds = new Set(cards.map(card => card.id)), clueIds = new Set();
  for (const clue of clues) {
    if (!exactKeys(clue, ['id', 'kind', 'left', 'right']) || !nonemptyString(clue.id) ||
        clueIds.has(clue.id) || !CLUE_KINDS.has(clue.kind) ||
        !cardIds.has(clue.left) || !cardIds.has(clue.right)) return false;
    clueIds.add(clue.id);
  }
  return true;
}
function validHintReview(review, revision) {
  if (review === null) return true;
  if (!isObject(review)) return false;
  if (review.status === 'needs-author-review') return exactKeys(review, ['status', 'kind', 'reason']) &&
    review.kind === 'author-self-declaration' && review.reason === REVIEW_REASON;
  return exactKeys(review, ['status', 'kind', 'revision']) && review.status === 'author-reviewed' &&
    review.kind === 'author-self-declaration' && positiveInteger(review.revision) && review.revision <= revision;
}
function validRecord(record) {
  if (!exactKeys(record, ['schema', 'source', 'token', 'revision', 'cards', 'labelsFrozen', 'clues', 'hintText', 'hintReview', 'actionExpected']) ||
      record.schema !== DRAFT_SCHEMA || !exactKeys(record.source, ['id', 'sha256']) ||
      !nonemptyString(record.source.id) || !validDigest(record.source.sha256) ||
      !nonemptyString(record.token) || !positiveInteger(record.revision) ||
      typeof record.labelsFrozen !== 'boolean' || typeof record.hintText !== 'string' || typeof record.actionExpected !== 'string' || !Array.isArray(record.cards) ||
      record.cards.length < 2 || record.cards.length > 8) return false;
  const ids = new Set();
  for (const card of record.cards) {
    if (!exactKeys(card, ['id', 'label']) || !nonemptyString(card.id) || typeof card.label !== 'string' || ids.has(card.id)) return false;
    ids.add(card.id);
  }
  return validClues(record.clues, record.cards) && validHintReview(record.hintReview, record.revision);
}
function matchingCards(cards, sourceCards) {
  return cards.length === sourceCards.length &&
    cards.every((card, index) => isObject(card) && card.id === sourceCards[index].id);
}

// Stable fixture identity; source-content compatibility is checked in the record.
export function draftKey(sourceId) {
  if (!nonemptyString(sourceId)) throw new TypeError('A nonempty source ID is required.');
  return 'ludolingua.author-draft:' + encodeURIComponent(sourceId);
}

// Capture author inputs only. Invalid programmer inputs and immutable edits throw.
export function captureDraft(sourceEpisode, sourceSha256, editedEpisode, token, hintText) {
  if (!validSource(sourceEpisode) || !validHints(sourceEpisode.hints) || !validDigest(sourceSha256) ||
      !nonemptyString(token) || !isObject(editedEpisode) || !positiveInteger(editedEpisode.revision) ||
      editedEpisode.revision < sourceEpisode.revision || !Array.isArray(editedEpisode.cards) ||
      !matchingCards(editedEpisode.cards, sourceEpisode.cards) ||
      !editedEpisode.cards.every(card => isObject(card) && typeof card.label === 'string') ||
      !isObject(editedEpisode.constraints) || typeof editedEpisode.constraints.labelsFrozen !== 'boolean' ||
      !validHints(editedEpisode.hints) || !validClues(editedEpisode.clues, sourceEpisode.cards) ||
      !isObject(editedEpisode.action) || typeof editedEpisode.action.expected !== 'string') {
    throw new TypeError('Invalid author draft inputs.');
  }
  if (hintText === undefined) hintText = editedEpisode.hints.join('\n');
  const hintReview = editedEpisode.hintReview ?? null;
  if (typeof hintText !== 'string' || !sameStrings(hintsFromText(hintText), editedEpisode.hints) ||
      !validHintReview(hintReview, editedEpisode.revision)) throw new TypeError('Invalid author draft hints or review.');
  const normalized = structuredClone(editedEpisode);
  normalized.revision = sourceEpisode.revision;
  normalized.cards.forEach((card, index) => { card.label = sourceEpisode.cards[index].label; });
  normalized.constraints.labelsFrozen = sourceEpisode.constraints.labelsFrozen;
  normalized.clues = structuredClone(sourceEpisode.clues);
  normalized.hints = structuredClone(sourceEpisode.hints);
  normalized.action.expected = sourceEpisode.action.expected;
  if (own(sourceEpisode, 'hintReview')) normalized.hintReview = structuredClone(sourceEpisode.hintReview);
  else delete normalized.hintReview;
  if (canonicalJSON(normalized) !== canonicalJSON(sourceEpisode)) {
    throw new TypeError('Author draft changes immutable episode fields.');
  }
  return {
    schema: DRAFT_SCHEMA, source: { id: sourceEpisode.id, sha256: sourceSha256.toLowerCase() },
    token, revision: editedEpisode.revision,
    cards: editedEpisode.cards.map(card => ({ id: card.id, label: card.label })),
    labelsFrozen: editedEpisode.constraints.labelsFrozen,
    clues: editedEpisode.clues.map(({ id, kind, left, right }) => ({ id, kind, left, right })),
    hintText, hintReview: hintReview === null ? null : structuredClone(hintReview), actionExpected: editedEpisode.action.expected
  };
}

// Do not validate completeness: unfinished empty/whitespace labels must survive.
// Neither corruption nor incompatibility deletes or changes stored bytes.
export function readDraft(raw, sourceEpisode, sourceSha256) {
  if (raw === null) return { state: 'missing' };
  try {
    if (typeof raw !== 'string' || !validSource(sourceEpisode) || !validHints(sourceEpisode.hints) || !validDigest(sourceSha256)) return { state: 'invalid' };
    const record = JSON.parse(raw);
    if (!validRecord(record)) return { state: 'invalid' };
    if (record.source.id !== sourceEpisode.id || record.source.sha256.toLowerCase() !== sourceSha256.toLowerCase()) {
      return { state: 'incompatible' };
    }
    if (record.revision < sourceEpisode.revision || !matchingCards(record.cards, sourceEpisode.cards)) return { state: 'invalid' };
    const episode = structuredClone(sourceEpisode);
    episode.revision = record.revision;
    episode.cards.forEach((card, index) => { card.label = record.cards[index].label; });
    episode.constraints.labelsFrozen = record.labelsFrozen;
    episode.clues = structuredClone(record.clues); episode.hints = hintsFromText(record.hintText);
    episode.action.expected = record.actionExpected;
    if (record.hintReview === null) delete episode.hintReview;
    else episode.hintReview = structuredClone(record.hintReview);
    return { state: 'ready', episode, hintText: record.hintText };
  } catch { return { state: 'invalid' }; }
}

function validStorageArguments(key, expectedRaw) {
  return nonemptyString(key) && (expectedRaw === null || typeof expectedRaw === 'string');
}

// Guarded operations, NOT atomic compare-and-swap. The caller must hold the
// shared per-key Web Lock over the entire read/compare/write or removal.
export function writeDraft(storage, key, expectedRaw, record) {
  try {
    if (!validStorageArguments(key, expectedRaw) || !validRecord(record)) return { state: 'unavailable' };
    const raw = JSON.stringify(record), currentRaw = storage.getItem(key);
    if (currentRaw !== expectedRaw) return { state: 'conflict', raw: currentRaw };
    storage.setItem(key, raw);
    return { state: 'saved', raw };
  } catch { return { state: 'unavailable' }; }
}
export function removeDraft(storage, key, expectedRaw) {
  try {
    if (!validStorageArguments(key, expectedRaw)) return { state: 'unavailable' };
    const currentRaw = storage.getItem(key);
    if (currentRaw !== expectedRaw) return { state: 'conflict', raw: currentRaw };
    storage.removeItem(key);
    return { state: 'saved', raw: null };
  } catch { return { state: 'unavailable' }; }
}
