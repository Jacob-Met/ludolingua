import { EPISODES } from '../fixtures/episodes.mjs';
import { analyzeEpisode, clueText, checkAttempt } from '../lib/engine.mjs';
import { explainClueConflict } from '../lib/clue-conflict.mjs';
import { createExport, readExport, sourceDigest } from '../lib/export.mjs';
import { setupComparison } from './comparison.mjs';
import { setupPlaytest } from './playtest-author.mjs';
import { createFixtureDrafts } from './draft-controller.mjs';
import { translate, translateDiagnostic, supportedLocale } from './i18n.mjs';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const names = { 'en-original': 'English · original episode', 'es-literal': 'Spanish · literal translation', 'es-adapted': 'Spanish · coordinated adaptation', 'es-frozen': 'Spanish · frozen-label challenge', 'en-ambiguous': 'English · incomplete clues', 'en-contradictory': 'English · conflicting clues' };
const MAX_EXPORT_BYTES = 20_000_000;
let episode, result = null, digest = '', version = 0, order = [], hintCount = 0, importSequence = 0;
let comparisonController, playtestController;
let conflictFor = null, conflictExplanation = null;
let importedEpisode = null, importedHintText = '', editingImport = false, editorHintText = '';
let uiLocale = supportedLocale((navigator.language ?? 'en').split('-')[0].toLowerCase());
let noticeState = { key: '', error: false, values: {} }, digestKey = 'Checked source · SHA-256 {hash}';
let playerFeedbackKey = '', revealedResult = null;
const t = (key, values = {}) => translate(uiLocale, key, values);
const diagnostic = message => translateDiagnostic(uiLocale, message);
function node(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
function notice(key, error = false, values = {}) { noticeState = { key, error, values }; renderNotice(); }
function renderNotice() {
  const { key, error, values } = noticeState;
  const localized = { ...values };
  if (Object.hasOwn(localized, 'message')) localized.message = diagnostic(localized.message);
  if (Object.hasOwn(localized, 'outcome')) localized.outcome = t(localized.outcome);
  $('notice').textContent = diagnostic(t(key, localized)); $('notice').classList.toggle('error', error);
}
function initial(label) { return Array.from(label.trim().normalize('NFC'))[0]?.toUpperCase() ?? ''; }
function revision() { $('revision').textContent = t('Revision {revision}', { revision: episode.revision }); }
function labels(ids) { return ids.map(id => episode.cards.find(card => card.id === id)?.label ?? id).join(' → '); }
function clues(target) {
  target.lang = episode.locale;
  try { target.replaceChildren(...episode.clues.map(clue => node('li', clueText(episode, clue)))); }
  catch { const fallback = node('li', t('Complete valid card labels before reading the generated clues.')); fallback.lang = uiLocale; target.replaceChildren(fallback); }
}
function renderWording() {
  $('episode-title').textContent = episode.title; $('episode-title').lang = episode.locale;
  $('episode-story').textContent = episode.story; $('episode-story').lang = episode.locale;
}
function changed({ reviewHints = false, reviewReason = 'Labels, required action, ordering clues or hints changed.' } = {}) {
  editorHintText = $('hint-editor').value;
  if (reviewHints) episode.hintReview = { status: 'needs-author-review', kind: 'author-self-declaration', reason: reviewReason };
  episode.revision += 1; version += 1; result = null; digest = ''; revision(); renderWording(); renderResult();
  $('digest').textContent = ''; $('export-button').disabled = true;
  clues($('author-clues')); refreshClueLabels(); renderHintReview(); comparisonController?.refreshTarget(); resetPlayer(); notice('This revision needs a new check. Previous results do not approve these edits.');
  if (editingImport) { importedEpisode = clone(episode); importedHintText = editorHintText; }
  else drafts.changed(episode, editorHintText);
}
function renderHintReview() {
  const review = episode.hintReview;
  $('hints-review-note').textContent = review?.status === 'needs-author-review' ? t('These edits may make the existing hints misleading. Review their wording and reveal order before sharing the puzzle.') : review?.status === 'author-reviewed' ? t('Author-declared hint review recorded at revision {revision}. Native-language playtesting remains unverified.', { revision: review.revision }) : t('These are authored fixture hints. Review them when changing the puzzle.');
}
function refreshClueLabels() {
  for (const select of $('clue-editor').querySelectorAll('select[data-field="left"],select[data-field="right"]')) {
    for (const option of select.options) { const card = episode.cards.find(c => c.id === option.value); if (card) option.textContent = `${card.label} (${card.id})`; }
  }
}
function renderClueEditor() {
  $('clue-editor').replaceChildren(...episode.clues.map((clue, index) => {
    const row = node('div', undefined, 'clue-row'); row.dataset.clueId = clue.id; row.id = 'clue-row-' + index;
    row.append(node('span', t('Clue {index}', { index: index + 1 }), 'clue-number'));
    for (const [field, labelText] of [['left', 'Left card'], ['kind', 'Relationship'], ['right', 'Right card']]) {
      const label = node('label', t(labelText)), select = node('select'); select.dataset.field = field; select.setAttribute('aria-label', `${t('Clue {index}', { index: index + 1 })} · ${t(labelText)}`);
      const options = field === 'kind' ? [['before', 'comes before'], ['immediately_before', 'comes immediately before'], ['after', 'comes after']] : episode.cards.map(c => [c.id, `${c.label} (${c.id})`]);
      for (const [value, text] of options) { const option = node('option', field === 'kind' ? t(text) : text); if (field !== 'kind') option.lang = episode.locale; option.value = value; select.append(option); }
      select.value = clue[field]; select.addEventListener('change', () => { clue[field] = select.value; changed({ reviewHints: true }); });
      label.append(select); row.append(label);
    }
    const remove = node('button', t('Remove'), 'text-button'); remove.type = 'button'; remove.dataset.action = 'remove-clue'; remove.setAttribute('aria-label', t('Remove clue {index}', { index: index + 1 }));
    remove.addEventListener('click', () => {
      episode.clues = episode.clues.filter(c => c !== clue); changed({ reviewHints: true }); renderClueEditor();
      const next = $('clue-editor').children[Math.min(index, episode.clues.length - 1)]; (next?.querySelector('select') ?? $('add-clue')).focus();
    });
    row.append(remove); return row;
  }));
}
function renderEditor() {
  for (const field of ['title', 'story']) { const input = $('episode-' + field + '-input'); input.value = episode[field]; input.lang = episode.locale; }
  $('cards-editor').replaceChildren(...episode.cards.map((card, i) => {
    const box = node('div', undefined, 'label-card');
    const top = node('div', undefined, 'card-top'); top.append(node('span', t('Keeper {index}', { index: String(i + 1).padStart(2, '0') })), node('span', initial(card.label), 'card-initial'));
    const label = node('label', t('Card label')); label.htmlFor = `label-${i}`;
    const input = node('input'); input.type = 'text'; input.id = `label-${i}`; input.value = card.label; input.lang = episode.locale; input.maxLength = 100; input.dataset.cardId = card.id; input.disabled = episode.constraints.labelsFrozen;
    input.addEventListener('input', () => { card.label = input.value; top.lastChild.textContent = initial(card.label); changed({ reviewHints: true }); });
    box.append(top, label, input); return box;
  }));
  $('freeze-labels').checked = episode.constraints.labelsFrozen;
  $('required-action').value = episode.action.expected; $('required-action').lang = episode.locale;
  clues($('author-clues'));
  renderClueEditor(); $('hint-editor').value = editorHintText; $('hint-editor').lang = episode.locale; renderHintReview();
  const changes = episode.provenance.semanticChanges;
  $('semantic-changes').replaceChildren(changes.length ? Object.assign(node('ul'), { }) : node('p', t('This authored source episode has no recorded adaptation changes.')));
  if (changes.length) $('semantic-changes').firstChild.append(...changes.map(text => node('li', text)));
  $('semantic-changes').lang = changes.length ? episode.locale : uiLocale;
}
const outcomeCopy = {
  invalid: ['Check the episode data', 'Some fields are outside this verifier’s supported contract.'],
  inconsistent: ['The clues cannot all be true', 'No ordering satisfies the encoded clues. Resolve the contradiction before evaluating the action.'],
  ambiguous: ['The clues leave room for guesswork', 'Several orders fit. A matching hidden answer cannot prove that the clues determine an order.'],
  'action-mismatch': ['The reasoning survives. The action does not.', 'The clue-consistent order produces a different token from the required action.'],
  verified: ['The encoded discovery holds', 'The order and extraction satisfy this episode’s mechanical requirements. Human language and difficulty review remain open.']
};
function clearConflictMarks() {
  for (const row of $('clue-editor').children) {
    row.classList.remove('in-conflict');
    row.querySelector('.clue-conflict-badge')?.remove();
    for (const select of row.querySelectorAll('select')) {
      const descriptions = (select.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== 'clue-conflict-help');
      if (descriptions.length) select.setAttribute('aria-describedby', descriptions.join(' '));
      else select.removeAttribute('aria-describedby');
    }
  }
}
function renderClueConflict(root) {
  if (conflictExplanation?.state === 'budget-exhausted') {
    root.append(node('p', t('A detailed clue explanation is unavailable for this puzzle.'), 'small'));
    return;
  }
  if (conflictExplanation?.state !== 'conflict') return;
  const box = node('section', undefined, 'clue-conflict'); box.id = 'clue-conflict';
  const heading = node('h4', t('These clues conflict when used together.'));
  const help = node('p', t('No ordering satisfies this set. Review these clues against the lesson you intend; other conflicts may remain after an edit.'));
  help.id = 'clue-conflict-help';
  const list = node('ul');
  for (const id of conflictExplanation.clueIds) {
    const index = episode.clues.findIndex(clue => clue.id === id), clue = episode.clues[index];
    const row = [...$('clue-editor').children].find(item => item.dataset.clueId === id);
    if (!clue || !row) continue;
    row.classList.add('in-conflict');
    row.querySelector('.clue-number').after(node('span', t('Part of this conflict'), 'clue-conflict-badge'));
    for (const select of row.querySelectorAll('select')) {
      select.setAttribute('aria-describedby', [select.getAttribute('aria-describedby'), help.id].filter(Boolean).join(' '));
    }
    const item = node('li'), text = node('p', clueText(episode, clue));
    text.lang = episode.locale;
    const edit = node('button', t('Edit clue {index}', { index: index + 1 }), 'text-button');
    edit.type = 'button'; edit.dataset.conflictClueId = id; edit.setAttribute('aria-controls', row.id);
    edit.addEventListener('click', () => {
      row.scrollIntoView({ block: 'center', behavior: 'auto' });
      row.querySelector('select[data-field="left"]').focus({ preventScroll: true });
    });
    item.append(text, edit); list.append(item);
  }
  box.append(heading, help, list); root.append(box);
}

function renderResult() {
  clearConflictMarks();
  if (result !== conflictFor) {
    conflictFor = result;
    conflictExplanation = result?.outcome === 'inconsistent' ? explainClueConflict(episode) : null;
  }
  const root = $('result'); root.replaceChildren();
  if (!result) { const box = node('div', undefined, 'result-state'); box.append(node('h4', t('Ready for a fresh check')), node('p', t('Check this exact revision to see all clue-consistent orders and the action they spell.'))); root.append(box); return; }
  const [heading, description] = outcomeCopy[result.outcome] ?? outcomeCopy.invalid;
  const box = node('div', undefined, `result-state ${result.outcome}`); box.append(node('h4', t(heading)), node('p', t(description))); root.append(box);
  if (!result.valid) { root.append(...result.errors.map(error => node('p', diagnostic(error), 'small'))); return; }
  const metrics = node('div', undefined, 'metrics');
  for (const [value, label] of [[result.clueOrderCount, 'Clue-consistent orders'], [result.actionMatchCount, 'Orders spelling the action'], [result.permutationCount, 'Orders examined']]) { const metric = node('div', undefined, 'metric'); metric.append(node('strong', String(value)), node('span', t(label))); metrics.append(metric); } root.append(metrics);
  for (const solution of result.solutions.slice(0, 4)) { root.append(node('p', labels(solution.order), 'path')); const row = node('div', undefined, 'token-row'); row.append(node('span', solution.token, 'token'), node('span', t('Required action: {action}', { action: episode.action.expected }), 'expected')); root.append(row); }
  if (result.solutions.length > 4) root.append(node('p', t('{count} further clue-consistent orders are retained in the export.', { count: result.solutions.length - 4 }), 'small'));
  renderClueConflict(root);
  if (result.frozenWitness) { const witness = node('div', undefined, 'witness'); witness.append(node('h4', t('A bounded impossibility witness')), node('p', t('Available initials: {available}. Missing required initials: {missing}.', { available: result.frozenWitness.available.join(', '), missing: result.frozenWitness.missing.join(', ') })), node('p', diagnostic(result.frozenWitness.scope))); root.append(witness); }
}
async function checkCurrent() {
  const checkpoint = version, current = clone(episode); result = analyzeEpisode(current); renderResult(); $('export-button').disabled = !result.valid;
  if (!result.valid) { digest = ''; $('digest').textContent = ''; return; }
  try { const hash = await sourceDigest(current); if (checkpoint !== version) return; digest = hash; digestKey = 'Checked source · SHA-256 {hash}'; renderDigest(); notice('Revision {revision} checked. The export will preserve this result, including any failure or ambiguity.', false, { revision: current.revision }); } catch (error) { if (checkpoint === version) { $('export-button').disabled = true; notice(error.message, true); } }
}
function resetPlayer() {
  const ids = episode.cards.map(c => c.id); order = [ids.at(-1), ...ids.slice(0, -1)]; hintCount = 0;
  $('answer').value = ''; playerFeedbackKey = ''; revealedResult = null; $('player-feedback').textContent = ''; $('hints').replaceChildren(); $('reveal').hidden = true; $('reveal').replaceChildren(); $('hint-button').disabled = episode.hints.length === 0;
  clues($('player-clues')); drawPlayer();
  $('hints').lang = episode.locale;

}
function drawPlayer() {
  $('player-order').replaceChildren(...order.map((id, i) => {
    const card = episode.cards.find(c => c.id === id), li = node('li'); li.dataset.cardId = id;
    li.append(node('span', String(i + 1).padStart(2, '0'), 'position'), Object.assign(node('span', card.label, 'keeper-label'), { lang: episode.locale }));
    for (const [delta, arrow, direction] of [[-1, '↑', 'up'], [1, '↓', 'down']]) {
      const button = node('button', arrow, 'move-button'); button.type = 'button'; button.disabled = i + delta < 0 || i + delta >= order.length; button.dataset.direction = direction; button.setAttribute('aria-label', t(delta < 0 ? 'Move {label} up' : 'Move {label} down', { label: card.label }));
      button.addEventListener('click', () => { [order[i], order[i + delta]] = [order[i + delta], order[i]]; playerFeedbackKey = ''; revealedResult = null; $('player-feedback').textContent = ''; $('reveal').hidden = true; drawPlayer(); const row = [...$('player-order').children].find(n => n.dataset.cardId === id); const focus = [...row.querySelectorAll('button')].find(n => n.dataset.direction === direction && !n.disabled) ?? [...row.querySelectorAll('button')].find(n => !n.disabled); focus?.focus(); });
      li.append(button);
    } return li;
  }));
}
function installEpisode(ep, hintText = ep.hints.join('\n')) {
  editorHintText = hintText;
  episode = clone(ep); version += 1; result = null; digest = ''; revision();
  $('episode-locale').textContent = t(episode.locale === 'es' ? 'SPANISH / ORIGINAL PUZZLE MATERIAL' : 'ENGLISH / ORIGINAL PUZZLE MATERIAL');
  renderWording(); $('answer').lang = episode.locale; $('digest').textContent = ''; $('export-button').disabled = true;
  renderEditor(); renderResult(); resetPlayer(); comparisonController?.refreshTarget(true); notice('');
}
function selectEpisode(ep, detached = false, hintText = ep.hints.join('\n')) {
  editingImport = detached;
  if (detached) {
    importedEpisode = clone(ep); importedHintText = hintText;
    drafts.detach(); installEpisode(ep, hintText);
  } else {
    const restored = drafts.open(ep);
    installEpisode(restored, drafts.hintText());
  }
}
function rememberImportedEpisode(ep, label = 'Reopened · verified export') {
  importedEpisode = clone(ep); importedHintText = editorHintText;
  $('case-select').querySelector('option[value="imported"]')?.remove();
  const option = node('option', t(label)); option.dataset.labelKey = label; option.value = 'imported'; $('case-select').append(option); $('case-select').value = 'imported';
}
function tab(mode) {
  for (const name of ['author', 'player']) { const active = mode === name; $(name).hidden = !active; $(`${name}-tab`).setAttribute('aria-selected', String(active)); $(`${name}-tab`).tabIndex = active ? 0 : -1; }
}
const drafts = await createFixtureDrafts(EPISODES, (ep, hintText) => {
  installEpisode(ep, hintText); $('editor-heading').focus();
}, t);
for (const ep of EPISODES) { const option = node('option', t(names[ep.id] ?? ep.title)); option.dataset.labelKey = names[ep.id] ?? ep.title; option.value = ep.id; $('case-select').append(option); }
$('case-select').addEventListener('change', () => {
  const detached = $('case-select').value === 'imported';
  const ep = detached ? importedEpisode : EPISODES.find(value => value.id === $('case-select').value);
  if (ep) selectEpisode(ep, detached, detached ? importedHintText : undefined);
});
$('freeze-labels').addEventListener('change', () => { episode.constraints.labelsFrozen = $('freeze-labels').checked; changed(); renderEditor(); });
$('required-action').addEventListener('input', () => { episode.action.expected = $('required-action').value; changed({ reviewHints: true }); });
for (const field of ['title', 'story']) {
  const input = $('episode-' + field + '-input');
  input.addEventListener('input', () => {
    if (input.value === episode[field]) return;
    episode[field] = input.value;
    changed({ reviewHints: true, reviewReason: 'Episode title or story changed.' });
  });
}
$('add-clue').addEventListener('click', () => {
  let next = 1; while (episode.clues.some(c => c.id === `authored-${next}`)) next += 1;
  episode.clues.push({ id: `authored-${next}`, kind: 'before', left: episode.cards[0].id, right: episode.cards[1].id });
  changed({ reviewHints: true }); renderClueEditor(); $('clue-editor').lastChild.querySelector('select').focus();
});
$('hint-editor').addEventListener('input', () => { episode.hints = $('hint-editor').value.split('\n').filter(line => line.trim().length); changed({ reviewHints: true }); });
$('review-hints').addEventListener('click', () => { episode.hintReview = { status: 'author-reviewed', kind: 'author-self-declaration', revision: episode.revision + 1 }; changed(); notice('Recorded the author’s hint-review declaration. Mechanical checks and native-language playtests remain separate.'); });
$('check-button').addEventListener('click', checkCurrent);
$('author-tab').addEventListener('click', () => tab('author')); $('player-tab').addEventListener('click', () => tab('player'));
for (const mode of ['author', 'player']) $(`${mode}-tab`).addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'author' : event.key === 'End' ? 'player' : mode === 'author' ? 'player' : 'author'; tab(next); $(`${next}-tab`).focus(); } });
$('reset-order').addEventListener('click', resetPlayer);
$('hint-button').addEventListener('click', () => { if (hintCount < episode.hints.length) $('hints').append(node('p', episode.hints[hintCount++])); $('hint-button').disabled = hintCount >= episode.hints.length; });
function renderPlayerFeedback() { $('player-feedback').textContent = t(playerFeedbackKey); }
function renderReveal() {
  const r = revealedResult; if (!r) return;
  $('reveal').replaceChildren(node('h4', t('Revealed mechanical result')), node('p', t('{count} clue-consistent order(s). Required action: {action}.', { count: r.clueOrderCount, action: episode.action.expected }), 'reveal-note'));
  for (const solution of r.solutions.slice(0, 4)) $('reveal').append(Object.assign(node('p', `${labels(solution.order)} → ${solution.token}`, 'path'), { lang: episode.locale }));
  if (!r.mechanicalSuccess) $('reveal').append(node('p', t('This episode does not pass its encoded requirements. Solving attempts do not repair its authoring constraints.'), 'reveal-note'));
}
$('answer-form').addEventListener('submit', event => {
  event.preventDefault(); const attempt = checkAttempt(episode, order, $('answer').value);
  playerFeedbackKey = attempt.success
    ? 'The action works. Your order fits the clues and its initials match.'
    : !attempt.cluesSatisfied
      ? 'This order does not yet satisfy all the clues.'
      : !attempt.tokenMatches
        ? 'The order fits the clues, but the action does not match. This adaptation may need changes.'
        : 'The order fits the clues. Try the action again using its initials.';
  renderPlayerFeedback();
});
$('reveal-button').addEventListener('click', () => { revealedResult = analyzeEpisode(episode); $('reveal').hidden = false; renderReveal(); });
$('export-button').addEventListener('click', async () => {
  const checkpoint = version, current = clone(episode);
  try { if (!result?.valid) throw new Error('Check the current revision before exporting.'); const data = await createExport(current); if (checkpoint !== version) throw new Error('The episode changed during export. Check the new revision first.'); const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }); if (blob.size > MAX_EXPORT_BYTES) throw new Error('This export exceeds the 20 MB receiver limit. Reduce episode content before downloading.'); const url = URL.createObjectURL(blob); const a = node('a'); a.href = url; a.download = `ludolingua-${current.id.replace(/[^a-z0-9_-]/gi, '-')}-r${current.revision}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Exported revision {revision}, including its {outcome} result.', false, { revision: current.revision, outcome: result.outcome }); } catch (error) { notice(error.message, true); }
});
$('import-button').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async () => {
  const file = $('import-file').files[0]; if (!file) return;
  const checkpoint = version, sequence = ++importSequence;
  try {
    if (file.size > MAX_EXPORT_BYTES) throw new Error('The episode export exceeds the 20 MB receiver limit.');
    const received = await readExport(await file.text());
    if (sequence !== importSequence) return;
    if (checkpoint !== version) throw new Error('The episode changed while this file was being verified. Reopen it again to replace the current revision.');
    selectEpisode(received.episode, true);
    rememberImportedEpisode(received.episode);
    result = received.validation.result; digest = received.integrity.episodeSha256; renderResult(); $('export-button').disabled = false;
    digestKey = 'Reopened source · SHA-256 {hash}'; renderDigest(); tab('author'); notice('Reopened revision {revision}. Source digest and mechanical result verified.', false, { revision: episode.revision });
  } catch (error) { if (sequence === importSequence) notice('Cannot reopen: {message}', true, { message: error.message }); }
  finally { if (sequence === importSequence) $('import-file').value = ''; }
});
comparisonController = setupComparison({ getEpisode: () => episode, selectEpisode: ep => selectEpisode(ep, true), rememberImportedEpisode, notice, showAuthor: () => tab('author'), maxBytes: MAX_EXPORT_BYTES, t, diagnostic });
playtestController = setupPlaytest({ getEpisode: () => episode, notice, maxBytes: MAX_EXPORT_BYTES, t, diagnostic, getUILocale: () => uiLocale });
function renderDigest() { $('digest').textContent = digest ? t(digestKey, { hash: digest }) : ''; }
function relocalize() {
  // Locale is presentation state: do not alter version, revisions, checks or import epochs.
  const active = document.activeElement;
  const focusId = active?.id;
  const move = active?.matches('.move-button') ? { card: active.closest('li').dataset.cardId, direction: active.dataset.direction } : null;
  const clue = active?.closest('.clue-row') ? { id: active.closest('.clue-row').dataset.clueId, field: active.dataset.field, remove: active.dataset.action === 'remove-clue' } : null;
  const selection = active && 'selectionStart' in active ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
  document.documentElement.lang = uiLocale; $('ui-language').value = uiLocale;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-content]')) element.setAttribute('content', t(element.dataset.i18nContent));
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  for (const option of $('case-select').options) option.textContent = t(option.dataset.labelKey);
  if (episode) {
    revision(); $('episode-locale').textContent = t(episode.locale === 'es' ? 'SPANISH / ORIGINAL PUZZLE MATERIAL' : 'ENGLISH / ORIGINAL PUZZLE MATERIAL');
    for (const [i, card] of [...$('cards-editor').children].entries()) {
      card.querySelector('.card-top span').textContent = t('Keeper {index}', { index: String(i + 1).padStart(2, '0') });
      card.querySelector('label').textContent = t('Card label');
    }
    renderClueEditor(); renderHintReview(); clues($('author-clues')); clues($('player-clues'));
    if (!episode.provenance.semanticChanges.length) { $('semantic-changes').firstChild.textContent = t('This authored source episode has no recorded adaptation changes.'); $('semantic-changes').lang = uiLocale; }
    renderResult(); renderDigest(); drawPlayer(); renderPlayerFeedback(); renderReveal(); comparisonController?.relocalize();
  }
  playtestController?.relocalize();
  renderNotice(); drafts.relocalize();
  let focus = active?.isConnected ? active : focusId ? $(focusId) : null;
  if (!focus && move) focus = [...$('player-order').children].find(row => row.dataset.cardId === move.card)?.querySelector(`[data-direction="${move.direction}"]`);
  if (!focus && clue) { const row = [...$('clue-editor').children].find(row => row.dataset.clueId === clue.id); focus = clue.remove ? row?.querySelector('[data-action="remove-clue"]') : [...(row?.querySelectorAll('select') ?? [])].find(select => select.dataset.field === clue.field); }
  if (focus && focus !== document.body) { focus.focus({ preventScroll: true }); if (selection?.start !== null && selection?.start !== undefined) focus.setSelectionRange?.(selection.start, selection.end, selection.direction); }
}
$('ui-language').addEventListener('change', () => { uiLocale = supportedLocale($('ui-language').value); relocalize(); });
const initialEpisode = EPISODES.find(ep => ep.id === drafts.selectedId) ?? EPISODES[0];
$('case-select').value = initialEpisode.id;
selectEpisode(initialEpisode);
relocalize();
