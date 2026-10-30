import { createAdaptation } from '../lib/adaptation.mjs';

const $ = id => document.getElementById(id);
export function setupAdaptation({ getEpisode, getHintText, getVersion, beginIntent, getIntent, comparison, notice, showAuthor, t, diagnostic }) {
  let choiceVersion = 0, request = 0, lastTarget = null, status = null;
  const language = $('adaptation-language'), button = $('start-adaptation'), output = $('adaptation-status');
  const ready = 'The adaptation is ready to edit. Its text was copied unchanged; translate and review it. The original revision was captured as a comparison source.';
  function renderStatus() {
    const values = { ...(status?.values ?? {}) };
    if (Object.hasOwn(values, 'message')) values.message = diagnostic(values.message);
    output.textContent = status ? t(status.key, values) : '';
    output.classList.toggle('error', Boolean(status?.error));
  }
  function refresh() {
    const ep = getEpisode(); if (!ep) return;
    choiceVersion += 1; language.value = ep.locale === 'es' ? 'en' : 'es';
    status = ep.id === lastTarget ? { key: ready } : null; renderStatus();
  }
  language.addEventListener('change', () => { choiceVersion += 1; });
  button.addEventListener('click', async () => {
    const sequence = ++request, selected = language.value, choice = choiceVersion;
    const version = getVersion(), epoch = comparison.getEpoch(), intent = beginIntent();
    const hintText = getHintText(); button.disabled = true;
    status = { key: 'Preparing an adaptation of this revision…' }; renderStatus();
    try {
      const value = await createAdaptation(getEpisode(), selected, { id: 'adapted-' + crypto.randomUUID() });
      if (sequence !== request || intent !== getIntent()) return;
      if (version !== getVersion() || epoch !== comparison.getEpoch() || choice !== choiceVersion) {
        throw new Error('The episode, comparison source or language choice changed. Start the adaptation again.');
      }
      comparison.adoptAdaptation(value.sourceEpisode, value.targetEpisode, hintText);
      lastTarget = value.targetEpisode.id; status = { key: ready }; renderStatus();
      showAuthor(); notice(ready); $('episode-title-input').focus();
    } catch (error) {
      if (sequence === request && intent === getIntent()) {
        status = { key: 'Cannot start adaptation: {message}', error: true, values: { message: error.message } };
        renderStatus(); notice(status.key, true, status.values);
      }
    } finally {
      if (sequence === request) {
        button.disabled = false;
        if (intent !== getIntent() && status?.key === 'Preparing an adaptation of this revision…') { status = null; renderStatus(); }
      }
    }
  });
  return { refresh, relocalize: renderStatus };
}
