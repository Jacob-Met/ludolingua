import { EPISODES } from '../fixtures/episodes.mjs';
import { analyzeEpisode, clueText, checkAttempt } from '../lib/engine.mjs';
import { createExport, readExport, sourceDigest } from '../lib/export.mjs';
import { setupComparison } from './comparison.mjs';
import { setupPlaytest } from './playtest-author.mjs';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const names = { 'en-original': 'English · original episode', 'es-literal': 'Spanish · literal translation', 'es-adapted': 'Spanish · coordinated adaptation', 'es-frozen': 'Spanish · frozen-label challenge', 'en-ambiguous': 'English · incomplete clues', 'en-contradictory': 'English · conflicting clues' };
const MAX_EXPORT_BYTES = 20_000_000;
let episode, result = null, digest = '', version = 0, order = [], hintCount = 0, importSequence = 0;
let comparisonController;
let importedEpisode = null;
function node(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function initial(label) { return Array.from(label.trim().normalize('NFC'))[0]?.toUpperCase() ?? ''; }
function revision() { $('revision').textContent = `Revision ${episode.revision}`; }
function labels(ids) { return ids.map(id => episode.cards.find(card => card.id === id)?.label ?? id).join(' → '); }
function clues(target) { try { target.replaceChildren(...episode.clues.map(clue => node('li', clueText(episode, clue)))); } catch { target.replaceChildren(node('li', 'Complete valid card labels before reading the generated clues.')); } }
function changed({ reviewHints = false } = {}) {
  if (reviewHints) episode.hintReview = { status: 'needs-author-review', kind: 'author-self-declaration', reason: 'Labels, ordering clues or hints changed.' };
  episode.revision += 1; version += 1; result = null; digest = ''; revision(); renderResult();
  $('digest').textContent = ''; $('export-button').disabled = true;
  clues($('author-clues')); refreshClueLabels(); renderHintReview(); comparisonController?.refreshTarget(); resetPlayer(); notice('This revision needs a new check. Previous results do not approve these edits.');
}
function renderHintReview() {
  const review = episode.hintReview;
  $('hints-review-note').textContent = review?.status === 'needs-author-review' ? 'These edits may make the existing hints misleading. Review their wording and reveal order before sharing the puzzle.' : review?.status === 'author-reviewed' ? `Author-declared hint review recorded at revision ${review.revision}. Native-language playtesting remains unverified.` : 'These are authored fixture hints. Review them when changing the puzzle.';
}
function refreshClueLabels() {
  for (const select of $('clue-editor').querySelectorAll('select[data-field="left"],select[data-field="right"]')) {
    for (const option of select.options) { const card = episode.cards.find(c => c.id === option.value); if (card) option.textContent = `${card.label} (${card.id})`; }
  }
}
function renderClueEditor() {
  $('clue-editor').replaceChildren(...episode.clues.map((clue, index) => {
    const row = node('div', undefined, 'clue-row'); row.dataset.clueId = clue.id;
    row.append(node('span', `Clue ${index + 1}`, 'clue-number'));
    for (const [field, labelText] of [['left', 'Left card'], ['kind', 'Relationship'], ['right', 'Right card']]) {
      const label = node('label', labelText), select = node('select'); select.dataset.field = field; select.setAttribute('aria-label', `Clue ${index + 1} · ${labelText.toLowerCase()}`);
      const options = field === 'kind' ? [['before', 'comes before'], ['immediately_before', 'comes immediately before'], ['after', 'comes after']] : episode.cards.map(c => [c.id, `${c.label} (${c.id})`]);
      for (const [value, text] of options) { const option = node('option', text); option.value = value; select.append(option); }
      select.value = clue[field]; select.addEventListener('change', () => { clue[field] = select.value; changed({ reviewHints: true }); });
      label.append(select); row.append(label);
    }
    const remove = node('button', 'Remove', 'text-button'); remove.type = 'button'; remove.dataset.action = 'remove-clue'; remove.setAttribute('aria-label', `Remove clue ${index + 1}`);
    remove.addEventListener('click', () => {
      episode.clues = episode.clues.filter(c => c !== clue); changed({ reviewHints: true }); renderClueEditor();
      const next = $('clue-editor').children[Math.min(index, episode.clues.length - 1)]; (next?.querySelector('select') ?? $('add-clue')).focus();
    });
    row.append(remove); return row;
  }));
}
function renderEditor() {
  $('cards-editor').replaceChildren(...episode.cards.map((card, i) => {
    const box = node('div', undefined, 'label-card');
    const top = node('div', undefined, 'card-top'); top.append(node('span', `Keeper ${String(i + 1).padStart(2, '0')}`), node('span', initial(card.label), 'card-initial'));
    const label = node('label', 'Card label'); label.htmlFor = `label-${i}`;
    const input = node('input'); input.type = 'text'; input.id = `label-${i}`; input.value = card.label; input.maxLength = 100; input.dataset.cardId = card.id; input.disabled = episode.constraints.labelsFrozen;
    input.addEventListener('input', () => { card.label = input.value; top.lastChild.textContent = initial(card.label); changed({ reviewHints: true }); });
    box.append(top, label, input); return box;
  }));
  $('freeze-labels').checked = episode.constraints.labelsFrozen;
  clues($('author-clues'));
  renderClueEditor(); $('hint-editor').value = episode.hints.join('\n'); renderHintReview();
  const changes = episode.provenance.semanticChanges;
  $('semantic-changes').replaceChildren(changes.length ? Object.assign(node('ul'), { }) : node('p', 'This authored source episode has no recorded adaptation changes.'));
  if (changes.length) $('semantic-changes').firstChild.append(...changes.map(text => node('li', text)));
}
const outcomeCopy = {
  invalid: ['Check the episode data', 'Some fields are outside this verifier’s supported contract.'],
  inconsistent: ['The clues cannot all be true', 'No ordering satisfies the encoded clues. Resolve the contradiction before evaluating the action.'],
  ambiguous: ['The clues leave room for guesswork', 'Several orders fit. A matching hidden answer cannot prove that the clues determine an order.'],
  'action-mismatch': ['The reasoning survives. The action does not.', 'The clue-consistent order produces a different token from the required action.'],
  verified: ['The encoded discovery holds', 'The order and extraction satisfy this episode’s mechanical requirements. Human language and difficulty review remain open.']
};
function renderResult() {
  const root = $('result'); root.replaceChildren();
  if (!result) { const box = node('div', undefined, 'result-state'); box.append(node('h4', 'Ready for a fresh check'), node('p', 'Check this exact revision to see all clue-consistent orders and the action they spell.')); root.append(box); return; }
  const [heading, description] = outcomeCopy[result.outcome] ?? outcomeCopy.invalid;
  const box = node('div', undefined, `result-state ${result.outcome}`); box.append(node('h4', heading), node('p', description)); root.append(box);
  if (!result.valid) { root.append(...result.errors.map(error => node('p', error, 'small'))); return; }
  const metrics = node('div', undefined, 'metrics');
  for (const [value, label] of [[result.clueOrderCount, 'Clue-consistent orders'], [result.actionMatchCount, 'Orders spelling the action'], [result.permutationCount, 'Orders examined']]) { const metric = node('div', undefined, 'metric'); metric.append(node('strong', String(value)), node('span', label)); metrics.append(metric); } root.append(metrics);
  for (const solution of result.solutions.slice(0, 4)) { root.append(node('p', labels(solution.order), 'path')); const row = node('div', undefined, 'token-row'); row.append(node('span', solution.token, 'token'), node('span', `Required action: ${episode.action.expected}`, 'expected')); root.append(row); }
  if (result.solutions.length > 4) root.append(node('p', `${result.solutions.length - 4} further clue-consistent orders are retained in the export.`, 'small'));
  if (result.frozenWitness) { const witness = node('div', undefined, 'witness'); witness.append(node('h4', 'A bounded impossibility witness'), node('p', `Available initials: ${result.frozenWitness.available.join(', ')}. Missing required initials: ${result.frozenWitness.missing.join(', ')}.`), node('p', result.frozenWitness.scope)); root.append(witness); }
}
async function checkCurrent() {
  const checkpoint = version, current = clone(episode); result = analyzeEpisode(current); renderResult(); $('export-button').disabled = !result.valid;
  if (!result.valid) { digest = ''; $('digest').textContent = ''; return; }
  try { const hash = await sourceDigest(current); if (checkpoint !== version) return; digest = hash; $('digest').textContent = `Checked source · SHA-256 ${hash}`; notice(`Revision ${current.revision} checked. The export will preserve this result, including any failure or ambiguity.`); } catch (error) { if (checkpoint === version) { $('export-button').disabled = true; notice(error.message, true); } }
}
function resetPlayer() {
  const ids = episode.cards.map(c => c.id); order = [ids.at(-1), ...ids.slice(0, -1)]; hintCount = 0;
  $('answer').value = ''; $('player-feedback').textContent = ''; $('hints').replaceChildren(); $('reveal').hidden = true; $('reveal').replaceChildren(); $('hint-button').disabled = episode.hints.length === 0;
  clues($('player-clues')); drawPlayer();
  const es = episode.locale === 'es';
  $('player-arrange-heading').textContent = es ? 'Ordena a los guardianes' : 'Arrange the keepers';
  $('player-instructions').textContent = es ? 'Usa las pistas para ordenar las tarjetas. Lee la primera letra de cada nombre y escribe la acción.' : 'Use the clues to find an order. Read the first letter of each label, then enter the action.';
  $('player-clue-heading').textContent = es ? 'Tus pistas' : 'Your clues';
  $('answer-label').textContent = es ? '¿Qué acción forman las iniciales?' : 'What action do the keepers spell?';
  $('answer-button').textContent = es ? 'Probar acción' : 'Try action';
  $('reset-order').textContent = es ? 'Restablecer orden' : 'Reset the order';
  $('hint-button').textContent = es ? 'Mostrar una pista' : 'Show a hint';
  $('reveal-button').textContent = es ? 'Revelar la solución' : 'Reveal the solution';
  $('player').lang = episode.locale;
}
function drawPlayer() {
  $('player-order').replaceChildren(...order.map((id, i) => {
    const card = episode.cards.find(c => c.id === id), li = node('li'); li.dataset.cardId = id;
    li.append(node('span', String(i + 1).padStart(2, '0'), 'position'), node('span', card.label, 'keeper-label'));
    for (const [delta, arrow, direction] of [[-1, '↑', 'up'], [1, '↓', 'down']]) {
      const button = node('button', arrow, 'move-button'); button.type = 'button'; button.disabled = i + delta < 0 || i + delta >= order.length; button.dataset.direction = direction; button.setAttribute('aria-label', episode.locale === 'es' ? `${delta < 0 ? 'Subir' : 'Bajar'} ${card.label}` : `Move ${card.label} ${direction}`);
      button.addEventListener('click', () => { [order[i], order[i + delta]] = [order[i + delta], order[i]]; $('player-feedback').textContent = ''; $('reveal').hidden = true; drawPlayer(); const row = [...$('player-order').children].find(n => n.dataset.cardId === id); const focus = [...row.querySelectorAll('button')].find(n => n.dataset.direction === direction && !n.disabled) ?? [...row.querySelectorAll('button')].find(n => !n.disabled); focus?.focus(); });
      li.append(button);
    } return li;
  }));
}
function selectEpisode(ep) {
  episode = clone(ep); version += 1; result = null; digest = ''; revision();
  $('episode-locale').textContent = `${episode.locale === 'es' ? 'SPANISH' : 'ENGLISH'} / ORIGINAL PUZZLE MATERIAL`;
  $('episode-title').textContent = episode.title; $('episode-story').textContent = episode.story;
  $('episode-story').lang = episode.locale; $('digest').textContent = ''; $('export-button').disabled = true;
  renderEditor(); renderResult(); resetPlayer(); comparisonController?.refreshTarget(true); notice('');
}
function rememberImportedEpisode(ep, label = 'Reopened · verified export') {
  importedEpisode = clone(ep);
  $('case-select').querySelector('option[value="imported"]')?.remove();
  const option = node('option', label); option.value = 'imported'; $('case-select').append(option); $('case-select').value = 'imported';
}
function tab(mode) {
  for (const name of ['author', 'player']) { const active = mode === name; $(name).hidden = !active; $(`${name}-tab`).setAttribute('aria-selected', String(active)); $(`${name}-tab`).tabIndex = active ? 0 : -1; }
}
for (const ep of EPISODES) { const option = node('option', names[ep.id] ?? ep.title); option.value = ep.id; $('case-select').append(option); }
$('case-select').addEventListener('change', () => { const ep = $('case-select').value === 'imported' ? importedEpisode : EPISODES.find(value => value.id === $('case-select').value); if (ep) selectEpisode(ep); });
$('freeze-labels').addEventListener('change', () => { episode.constraints.labelsFrozen = $('freeze-labels').checked; changed(); renderEditor(); });
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
$('answer-form').addEventListener('submit', event => { event.preventDefault(); const attempt = checkAttempt(episode, order, $('answer').value); const es = episode.locale === 'es'; $('player-feedback').textContent = attempt.success ? (es ? 'La acción funciona. Las pistas y las iniciales coinciden.' : 'The action works. Your order fits the clues and its initials match.') : !attempt.cluesSatisfied ? (es ? 'El orden todavía no cumple todas las pistas.' : 'This order does not yet satisfy all the clues.') : (es ? 'El orden cumple las pistas, pero la acción no coincide. Esta adaptación puede necesitar cambios.' : 'The order fits the clues, but the action does not match. This adaptation may need changes.'); });
$('reveal-button').addEventListener('click', () => {
  const r = analyzeEpisode(episode), es = episode.locale === 'es'; $('reveal').hidden = false;
  $('reveal').replaceChildren(node('h4', es ? 'Resultado mecánico revelado' : 'Revealed mechanical result'), node('p', es ? `${r.clueOrderCount} orden(es) compatible(s) con las pistas. Acción requerida: ${episode.action.expected}.` : `${r.clueOrderCount} clue-consistent order(s). Required action: ${episode.action.expected}.`, 'reveal-note'));
  for (const solution of r.solutions.slice(0, 4)) $('reveal').append(node('p', `${labels(solution.order)} → ${solution.token}`, 'path'));
  if (!r.mechanicalSuccess) $('reveal').append(node('p', es ? 'Este episodio no cumple sus requisitos codificados. Los intentos de resolverlo no reparan sus restricciones.' : 'This episode does not pass its encoded requirements. Solving attempts do not repair its authoring constraints.', 'reveal-note'));
});
$('export-button').addEventListener('click', async () => {
  const checkpoint = version, current = clone(episode);
  try { if (!result?.valid) throw new Error('Check the current revision before exporting.'); const data = await createExport(current); if (checkpoint !== version) throw new Error('The episode changed during export. Check the new revision first.'); const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }); if (blob.size > MAX_EXPORT_BYTES) throw new Error('This export exceeds the 20 MB receiver limit. Reduce episode content before downloading.'); const url = URL.createObjectURL(blob); const a = node('a'); a.href = url; a.download = `ludolingua-${current.id.replace(/[^a-z0-9_-]/gi, '-')}-r${current.revision}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice(`Exported revision ${current.revision}, including its ${result.outcome} result.`); } catch (error) { notice(error.message, true); }
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
    selectEpisode(received.episode);
    rememberImportedEpisode(received.episode);
    result = received.validation.result; digest = received.integrity.episodeSha256; renderResult(); $('export-button').disabled = false;
    $('digest').textContent = `Reopened source · SHA-256 ${digest}`; tab('author'); notice(`Reopened revision ${episode.revision}. Source digest and mechanical result verified.`);
  } catch (error) { if (sequence === importSequence) notice(`Cannot reopen: ${error.message}`, true); }
  finally { if (sequence === importSequence) $('import-file').value = ''; }
});
comparisonController = setupComparison({ getEpisode: () => episode, selectEpisode, rememberImportedEpisode, notice, showAuthor: () => tab('author'), maxBytes: MAX_EXPORT_BYTES });
setupPlaytest({ getEpisode: () => episode, notice, maxBytes: MAX_EXPORT_BYTES });
selectEpisode(EPISODES[0]);
