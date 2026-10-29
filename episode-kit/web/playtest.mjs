import { analyzeEpisode, clueText } from '../lib/engine.mjs';
import { readExport } from '../lib/export.mjs';
import { replayPlaytest, MAX_PLAYTEST_EVENTS } from '../lib/playtest.mjs';
import { createPlaytestRecord } from '../lib/playtest-export.mjs';

const $ = id => document.getElementById(id);
const MAX_BYTES = 20_000_000;
let episode = null, events = [], replay = null, sessionId = '', startedAt = 0, loading = false, exporting = false;
const token = new URL(location.href).searchParams.get('handoff');
const es = () => episode?.locale === 'es';
function node(tag, text, cls) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (cls) value.className = cls; return value; }
function words(english, spanish) { return es() ? spanish : english; }
function labels(order) { return order.map(id => episode.cards.find(card => card.id === id).label).join(' → '); }
function status(text, state = 'ready') { $('playtest-status').textContent = text; $('playtest-status').dataset.state = state; $('playtest-status').classList.toggle('error', state === 'error'); }
function localizedCopy() {
  document.documentElement.lang = episode.locale;
  const copy = {
    'playtest-eyebrow': ['A PUZZLE TO DISCOVER', 'UN ENIGMA POR DESCUBRIR'],
    'playtest-arrange-heading': ['Arrange the keepers', 'Ordena a los guardianes'],
    'playtest-instructions': ['Use the clues to find an order. Read the first letter of each label, then enter the action.', 'Usa las pistas para ordenar las tarjetas. Lee la primera letra de cada nombre y escribe la acción.'],
    'playtest-clue-heading': ['Your clues', 'Tus pistas'],
    'playtest-answer-label': ['What action do the keepers spell?', '¿Qué acción forman las iniciales?'],
    'playtest-attempt': ['Try action', 'Probar acción'],
    'playtest-reset': ['Reset the order', 'Restablecer orden'],
    'playtest-hint': ['Show a hint', 'Mostrar una pista'],
    'playtest-reveal': ['Reveal the solution', 'Revelar la solución'],
    'playtest-record-heading': ['Keep a record of the journey.', 'Conserva el recorrido.'],
    'playtest-download': ['Download play record', 'Descargar registro de juego'],
    'playtest-record-note': ['Resetting keeps the earlier attempts, hints and reveals in the record. Download before closing this window; the session is not saved after you leave.', 'Restablecer conserva los intentos, las pistas y las soluciones reveladas en el registro. Descárgalo antes de cerrar esta ventana; la sesión no se guarda al salir.'],
    'playtest-evidence-note': ['This records actions and elapsed times reported by this browser. It does not verify who played, unaided solving, native-language fluency or puzzle quality.', 'El registro contiene las acciones y los tiempos que comunica este navegador. No verifica quién jugó, si resolvió sin ayuda, su dominio nativo del idioma ni la calidad del enigma.'],
    'playtest-footer': ['Follow the clues. Keep your own pace.', 'Sigue las pistas. A tu ritmo.']
  };
  for (const [id, values] of Object.entries(copy)) $(id).textContent = values[es() ? 1 : 0];
}
function record(event) {
  if (!episode || events.length >= MAX_PLAYTEST_EVENTS) return false;
  const elapsedMs = Math.max(replay.summary.elapsedMs, Math.floor(performance.now() - startedAt));
  const candidate = [...events, { ...event, elapsedMs }], checked = replayPlaytest(episode, candidate);
  if (!checked.valid) { status(checked.errors.join('; '), 'error'); return false; }
  events = candidate; replay = checked; render(); return true;
}
function render() {
  const state = replay.finalState, summary = replay.summary, full = events.length >= MAX_PLAYTEST_EVENTS;
  $('playtest-cards').replaceChildren(...state.order.map((id, index) => {
    const card = episode.cards.find(value => value.id === id), li = node('li'); li.dataset.cardId = id;
    li.append(node('span', String(index + 1).padStart(2, '0'), 'position'), node('span', card.label, 'keeper-label'));
    for (const [direction, delta, arrow] of [['up', -1, '↑'], ['down', 1, '↓']]) {
      const button = node('button', arrow, 'move-button'); button.type = 'button'; button.dataset.direction = direction;
      button.disabled = full || index + delta < 0 || index + delta >= state.order.length;
      button.setAttribute('aria-label', words(`Move ${card.label} ${direction}`, `${delta < 0 ? 'Subir' : 'Bajar'} ${card.label}`));
      button.addEventListener('click', () => {
        if (!record({ type: 'move', cardId: id, direction })) return;
        const row = [...$('playtest-cards').children].find(value => value.dataset.cardId === id);
        const buttons = [...row.querySelectorAll('button')];
        (buttons.find(value => value.dataset.direction === direction && !value.disabled) ?? buttons.find(value => !value.disabled))?.focus();
      });
      li.append(button);
    }
    return li;
  }));
  $('playtest-hints').replaceChildren(...episode.hints.slice(0, state.visibleHintCount).map(text => node('p', text)));
  $('playtest-hint').disabled = full || state.visibleHintCount >= episode.hints.length;
  $('playtest-reset').disabled = full; $('playtest-reveal').disabled = full || state.revealed;
  $('playtest-answer').disabled = full; $('playtest-attempt').disabled = full;
  $('playtest-download').disabled = exporting;
  const attempt = state.lastAttempt;
  $('playtest-feedback').textContent = !attempt ? '' : attempt.success
    ? words('The action works. Your order fits the clues and its initials match.', 'La acción funciona. Las pistas y las iniciales coinciden.')
    : !attempt.cluesSatisfied
      ? words('This order does not yet satisfy all the clues.', 'El orden todavía no cumple todas las pistas.')
      : words('The order fits the clues, but the action does not match. The episode may need changes.', 'El orden cumple las pistas, pero la acción no coincide. Puede que el episodio necesite cambios.');
  $('playtest-solution').hidden = !state.revealed; $('playtest-solution').replaceChildren();
  if (state.revealed) {
    const result = analyzeEpisode(episode);
    $('playtest-solution').append(node('h3', words('Revealed mechanical result', 'Resultado mecánico revelado')), node('p', words(`${result.clueOrderCount} clue-consistent order(s). Required action: ${episode.action.expected}.`, `${result.clueOrderCount} orden(es) compatible(s) con las pistas. Acción requerida: ${episode.action.expected}.`), 'reveal-note'));
    for (const solution of result.solutions.slice(0, 4)) $('playtest-solution').append(node('p', `${labels(solution.order)} → ${solution.token}`, 'path'));
    if (!result.mechanicalSuccess) $('playtest-solution').append(node('p', words('This episode does not pass its encoded requirements. A matching attempt does not repair the episode.', 'Este episodio no cumple sus requisitos codificados. Un intento que coincida no repara el episodio.'), 'reveal-note'));
  }
  $('playtest-journal-summary').textContent = words(`${summary.attempts} attempts · ${summary.hintsShown} hints shown · ${summary.resets} resets · solution ${summary.revealUsed ? 'revealed' : 'not revealed'} in this record`, `${summary.attempts} intentos · ${summary.hintsShown} pistas mostradas · ${summary.resets} restablecimientos · solución ${summary.revealUsed ? 'revelada' : 'no revelada'} en este registro`);
  if (full) status(words('The 10,000-event record is full. Download it before starting another window.', 'El registro de 10.000 eventos está lleno. Descárgalo antes de empezar en otra ventana.'), 'full');
}
async function receive(source) {
  if (episode || loading) return;
  loading = true; $('playtest-file').disabled = true;
  try {
    const value = typeof source === 'function' ? await source() : source;
    if (new Blob([typeof value === 'string' ? value : JSON.stringify(value)]).size > MAX_BYTES) throw new Error('The episode export exceeds the 20 MB receiver limit.');
    const received = await readExport(value);
    const checked = replayPlaytest(received.episode, []);
    if (!checked.valid) throw new Error(checked.errors.join('; '));
    episode = structuredClone(received.episode); events = []; replay = checked; sessionId = crypto.randomUUID(); startedAt = performance.now();
    localizedCopy(); document.title = `LUDOLINGUA · ${episode.title}`;
    $('playtest-title').textContent = episode.title; $('playtest-story').textContent = episode.story;
    $('playtest-revision').textContent = words(`Revision ${episode.revision} · ${episode.locale.toUpperCase()} · fixed for this session`, `Revisión ${episode.revision} · ${episode.locale.toUpperCase()} · fija para esta sesión`);
    $('playtest-clues').replaceChildren(...episode.clues.map(clue => node('li', clueText(episode, clue))));
    $('playtest-import').hidden = true; $('playtest-session').hidden = false;
    render(); status(words('Ready. This window keeps the revision you opened.', 'Listo. Esta ventana conserva la revisión que abriste.'));
  } catch (error) {
    $('playtest-import-status').textContent = `Cannot open: ${error.message}`; status('Choose a valid episode export to begin.', 'error');
  } finally { loading = false; $('playtest-file').disabled = Boolean(episode); $('playtest-file').value = ''; }
}
$('playtest-file').addEventListener('change', async () => {
  const file = $('playtest-file').files[0]; if (!file || episode || loading) return;
  if (file.size > MAX_BYTES) { $('playtest-import-status').textContent = 'Cannot open: the episode export exceeds the 20 MB receiver limit.'; $('playtest-file').value = ''; return; }
  await receive(() => file.text());
});
$('playtest-answer-form').addEventListener('submit', event => { event.preventDefault(); record({ type: 'attempt', answer: $('playtest-answer').value }); });
$('playtest-hint').addEventListener('click', () => record({ type: 'hint' }));
$('playtest-reveal').addEventListener('click', () => record({ type: 'reveal' }));
$('playtest-reset').addEventListener('click', () => { if (record({ type: 'reset' })) $('playtest-answer').value = ''; });
$('playtest-download').addEventListener('click', async () => {
  if (!episode || exporting) return;
  exporting = true; $('playtest-download').disabled = true;
  try {
    const data = await createPlaytestRecord(episode, sessionId, events);
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    if (blob.size > MAX_BYTES) throw new Error('This record exceeds the 20 MB receiver limit.');
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url;
    link.download = `ludolingua-play-${episode.id.replace(/[^a-z0-9_-]/gi, '-')}-r${episode.revision}-${sessionId}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('playtest-download-status').textContent = words(`Downloaded ${data.events.length} recorded events. Later actions need another download.`, `Se descargaron ${data.events.length} eventos. Las acciones posteriores requieren otra descarga.`);
    $('playtest-download-status').classList.remove('error');
  } catch (error) { $('playtest-download-status').textContent = error.message; $('playtest-download-status').classList.add('error'); }
  finally { exporting = false; $('playtest-download').disabled = false; }
});
window.addEventListener('message', event => {
  if (!token || !window.opener || event.origin !== location.origin || event.source !== window.opener || event.data?.type !== 'ludolingua.playtest.episode' || event.data?.token !== token) return;
  receive(event.data.episodeExport);
});
if (token && window.opener) { status('Waiting for the chosen revision.', 'waiting'); window.opener.postMessage({ type: 'ludolingua.playtest.ready', token }, location.origin); }
