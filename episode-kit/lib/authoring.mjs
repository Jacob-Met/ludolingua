import { validateEpisode } from './engine.mjs';

/** Construct a new authored episode, without inventing clues or a solution. */
export function createOriginalEpisode(input, { id } = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Original episode input must be an object.');
  }
  if (!Array.isArray(input.labels)) {
    throw new TypeError('Original episode labels must be an array.');
  }
  if (input.labels.length < 2 || input.labels.length > 8) {
    throw new Error('Invalid episode: cards must contain 2..8 cards.');
  }
  const episode = {
    schema: 'ludolingua.episode.v1', id, revision: 1,
    title: input.title, story: input.story, locale: input.locale,
    cards: Array.from(input.labels, (label, index) => ({ id: 'keeper-' + (index + 1), label })),
    clues: [], hints: [],
    constraints: { labelsFrozen: false, requireUnique: true },
    extraction: { kind: 'first_letter', normalization: 'NFC-uppercase' },
    action: { expected: input.action, answerNormalization: 'NFC-trim-uppercase' },
    provenance: {
      kind: 'authored',
      source: 'Original episode created in the LUDOLINGUA authoring form.',
      modelRun: null, humanPlaytest: null, semanticChanges: []
    }
  };
  const checked = validateEpisode(episode);
  if (!checked.valid) throw new Error('Invalid episode: ' + checked.errors.join('; '));
  return episode;
}
