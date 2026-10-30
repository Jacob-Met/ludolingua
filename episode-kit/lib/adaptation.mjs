import { validateEpisode } from './engine.mjs';
import { canonicalJSON, sourceDigest } from './export.mjs';

/** Start an authored adaptation; copied text is not a translation or approval. */
export async function createAdaptation(sourceEpisode, targetLocale, { id } = {}) {
  // Capture the complete caller-owned source before the first asynchronous step.
  const source = JSON.parse(canonicalJSON(sourceEpisode));
  const valid = validateEpisode(source);
  if (!valid.valid) throw new Error('Invalid adaptation source: ' + valid.errors.join('; '));
  if (!['en', 'es'].includes(targetLocale) || targetLocale === source.locale) {
    throw new Error('Choose a different supported content language for the adaptation.');
  }
  if (typeof id !== 'string' || !id.trim() || id === source.id) {
    throw new Error('The adaptation requires a new nonempty episode ID.');
  }
  const sourceSha256 = await sourceDigest(source);
  const target = structuredClone(source);
  target.id = id;
  target.revision = 1;
  target.locale = targetLocale;
  target.provenance = {
    ...structuredClone(source.provenance),
    kind: 'authored',
    source: `Authored adaptation starting point from episode ${JSON.stringify(source.id)}, revision ${source.revision}, locale ${source.locale}, SHA-256 ${sourceSha256}. Source attribution: ${source.provenance.source}`,
    modelRun: null,
    humanPlaytest: null,
    semanticChanges: [
      ...source.provenance.semanticChanges.map(change => `Inherited source history: ${change}`),
      `Target content language changed from ${source.locale} to ${targetLocale}. Title, story, labels, required action and hints were initially copied unchanged, not translated. Stable card roles, typed ordering relations, extraction and constraints were retained. Review and translate the copied wording; equivalent meaning, difficulty and language quality have not been established.`
    ]
  };
  target.hintReview = {
    status: 'needs-author-review', kind: 'author-self-declaration',
    reason: 'Labels, required action, ordering clues or hints changed.'
  };
  return { sourceEpisode: source, targetEpisode: target, sourceSha256 };
}
