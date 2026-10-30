import { createLocalizationNotes, readLocalizationNotes, MAX_LOCALIZATION_NOTES_BYTES, MAX_LOCALIZATION_NOTES_CHARS } from '../lib/localization-notes.mjs';

const $ = id => document.getElementById(id);
export function setupLocalizationNotes({ comparison, beginIntent, getIntent, showAuthor, t, diagnostic }) {
  const text = $('localization-notes-text'), attach = $('attach-localization-notes'), download = $('download-localization-notes');
  const input = $('localization-notes-file'), status = $('localization-notes-status'), pair = $('localization-notes-pair'), feedback = $('localization-notes-feedback');
  let bound = null, rawNotesText = text.value, version = 0, importSequence = 0, downloadSequence = 0, downloading = false, message = null;
  function renderMessage() {
    const values = { ...(message?.values ?? {}) };
    if (Object.hasOwn(values, 'message')) values.message = diagnostic(values.message);
    feedback.textContent = message ? t(message.key, values) : '';
    feedback.classList.toggle('error', Boolean(message?.error));
  }
  function tell(key, error = false, values = {}) { message = { key, error, values }; renderMessage(); }
  function render() {
    const current = comparison.getChecked();
    attach.disabled = !current;
    download.disabled = downloading || !bound || !rawNotesText.trim() || rawNotesText.length > MAX_LOCALIZATION_NOTES_CHARS;
    const same = Boolean(bound && current?.validation.bindingSha256 === bound.validation.bindingSha256);
    status.dataset.binding = bound ? (same ? 'current' : 'earlier') : 'none';
    status.textContent = t(!bound ? 'Compare a pair, then attach your notes to those checked revisions.' : same ?
      'These notes are attached to the current checked pair.' :
      'The current pair has changed or needs a fresh comparison. These notes still describe the captured pair below.');
    pair.textContent = bound ? t('Captured pair: {source} ({sourceLocale}, revision {sourceRevision}) → {target} ({targetLocale}, revision {targetRevision})', {
      source: bound.source.title, sourceLocale: bound.source.locale.toUpperCase(), sourceRevision: bound.source.revision,
      target: bound.target.title, targetLocale: bound.target.locale.toUpperCase(), targetRevision: bound.target.revision
    }) : '';
  }
  text.addEventListener('input', () => { rawNotesText = text.value; version += 1; message = null; renderMessage(); render(); });
  attach.addEventListener('click', () => {
    const current = comparison.getChecked();
    if (!current) { tell('Compare the current pair before attaching localization notes.', true); return; }
    beginIntent(); version += 1; bound = current;
    tell('Attached the current checked pair. Review your notes for these revisions before downloading.'); render();
  });
  download.addEventListener('click', async () => {
    const sequence = ++downloadSequence, edit = version, intent = getIntent();
    downloading = true; render();
    try {
      if (!bound) throw new Error('Compare the current pair before attaching localization notes.');
      const envelope = await createLocalizationNotes(bound, rawNotesText);
      if (sequence !== downloadSequence || edit !== version || intent !== getIntent()) return;
      const blob = new Blob([JSON.stringify(envelope, null, 2) + '\n'], { type: 'application/json' });
      if (blob.size > MAX_LOCALIZATION_NOTES_BYTES) throw new Error('Localization notes file exceeds the 20 MiB limit.');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'ludolingua-localization-notes.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      tell('Notes download prepared with the captured pair. Later notes or episode edits need a new file.');
    } catch (error) {
      if (sequence === downloadSequence && edit === version && intent === getIntent()) tell('Cannot download localization notes: {message}', true, { message: error.message });
    } finally { if (sequence === downloadSequence) { downloading = false; render(); } }
  });
  $('reopen-localization-notes').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    const sequence = ++importSequence, intent = beginIntent(), epoch = comparison.getEpoch(), edit = version;
    try {
      if (file.size > MAX_LOCALIZATION_NOTES_BYTES) throw new Error('Localization notes file exceeds the 20 MiB limit.');
      const received = await readLocalizationNotes(await file.text());
      if (sequence !== importSequence || intent !== getIntent()) return;
      if (epoch !== comparison.getEpoch() || edit !== version) throw new Error('The pair or notes changed while this file was being verified. Reopen it again to replace them.');
      comparison.adoptCheckedPair(received.comparison); bound = received.comparison; rawNotesText = received.notesText; text.value = rawNotesText; version += 1;
      render(); $('localization-notes').open = true; showAuthor(); text.focus();
      tell('Reopened the captured pair and exact authored notes. Their content is verified; their judgments remain author statements.');
    } catch (error) {
      if (sequence === importSequence && intent === getIntent()) tell('Cannot reopen localization notes: {message}', true, { message: error.message });
    } finally { if (sequence === importSequence) input.value = ''; }
  });
  comparison.subscribe(render); render();
  return { relocalize: () => { render(); renderMessage(); } };
}
