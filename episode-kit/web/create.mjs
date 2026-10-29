import { createOriginalEpisode } from '../lib/authoring.mjs';
import { createExport } from '../lib/export.mjs';
import { supportedLocale, translateDiagnostic } from './i18n.mjs';
import { openAuthorWorkbench } from './author-handoff.mjs';

const $ = id => document.getElementById(id), MAX_BYTES = 20_000_000;
let locale = supportedLocale(new URL(location.href).searchParams.get('ui') ?? (navigator.language ?? 'en').split('-')[0].toLowerCase());
let generation = 0, prepared = null, preparing = false, opening = false, statusKey = '', statusValues = {};
const copy = {
  edition: ['AN ORIGINAL EPISODE', 'UN EPISODIO ORIGINAL'],
  eyebrow: ['YOUR WORDS. YOUR DISCOVERY.', 'TUS PALABRAS. TU DESCUBRIMIENTO.'],
  heading: ['Start with your own cards.', 'Empieza con tus propias tarjetas.'],
  lede: ['Give your puzzle a scene, two to eight card names, and an action. Then write its ordering clues in a fresh workbench.', 'Dale a tu enigma una historia, de dos a ocho nombres de tarjetas y una acción. Después escribe sus pistas de orden en un taller nuevo.'],
  uiLanguage: ['Interface language', 'Idioma de la interfaz'],
  preserve: ['Your existing workbench and its drafts stay where they are. This page creates a separate original episode.', 'El taller existente y sus borradores permanecen intactos. Esta página crea un episodio original independiente.'],
  sceneEyebrow: ['01 · SET THE SCENE', '01 · PREPARA LA ESCENA'],
  sceneHeading: ['A reason to arrange the cards.', 'Un motivo para ordenar las tarjetas.'],
  titleLabel: ['Episode title', 'Título del episodio'],
  storyLabel: ['Story for the player', 'Historia para quien juega'],
  puzzleLanguage: ['Language of the puzzle', 'Idioma del enigma'],
  languageHelp: ['This controls the generated clue wording. Changing the interface does not translate your writing.', 'Esto determina el idioma de las pistas generadas. Cambiar la interfaz no traduce lo que escribes.'],
  cardsEyebrow: ['02 · CHOOSE THE WORDS', '02 · ELIGE LAS PALABRAS'],
  cardsHeading: ['Names that carry an action.', 'Nombres que contienen una acción.'],
  labelsLabel: ['Card names · one per line', 'Nombres de tarjetas · uno por línea'],
  labelsHelp: ['Use two to eight names, each starting with a letter. Keep every card on its own line, without empty lines. This list does not declare a solution order.', 'Usa de dos a ocho nombres que empiecen con una letra. Escribe uno por línea, sin líneas vacías. Esta lista no declara el orden de la solución.'],
  actionLabel: ['Required action', 'Acción requerida'],
  actionHelp: ['Choose what the ordered initials should spell. The workbench will check your clues and action together.', 'Elige qué deben formar las iniciales ordenadas. El taller comprobará las pistas y la acción conjuntamente.'],
  buildHeading: ['Make room for the reasoning.', 'Deja espacio para el razonamiento.'],
  buildHelp: ['The starting episode has no clues or hints. It is intentionally unfinished: add clues and check the discovery in the workbench.', 'El episodio inicial no tiene pistas ni ayudas. Está por completar: añade pistas y comprueba el descubrimiento en el taller.'],
  createButton: ['Create starting episode', 'Crear episodio inicial'],
  readyEyebrow: ['A STARTING POINT, NOT A SOLVED PUZZLE', 'UN PUNTO DE PARTIDA, AÚN POR RESOLVER'],
  openButton: ['Open in a new workbench', 'Abrir en un taller nuevo'],
  downloadButton: ['Download starting episode', 'Descargar episodio inicial'],
  nextHelp: ['Add clues, check the revision, then export your work. The new workbench keeps this episode in its tab; it does not save a fixture draft.', 'Añade pistas, comprueba la revisión y exporta tu trabajo. El taller nuevo conserva el episodio en su pestaña; no guarda un borrador de ejemplo.'],
  fallbackHelp: ['If a new window cannot open, download this episode. In a workbench, choose Reopen an export and select the downloaded file.', 'Si no se abre una ventana nueva, descarga el episodio. En un taller, elige Reabrir una exportación y selecciona el archivo descargado.'],
  workbenchLink: ['Open a workbench for file import ↗', 'Abrir un taller para importar el archivo ↗'],
  footer: ['AN ORIGINAL BEGINNING', 'UN COMIENZO ORIGINAL'],
  limits: ['Mechanical checks leave room for human judgment.', 'Las comprobaciones mecánicas dejan espacio al juicio humano.']
};
const words = (en, es) => locale === 'es' ? es : en;
function showStatus(key, values = {}) { statusKey = key; statusValues = values; renderStatus(); }
function renderStatus() {
  const { title = '', message = '' } = statusValues;
  const texts = {
    preparing: words('Preparing the exact starting episode…', 'Preparando el episodio inicial exacto…'),
    dirty: words('Your inputs changed. Create a new starting episode before opening or downloading.', 'Los datos han cambiado. Crea un episodio inicial nuevo antes de abrirlo o descargarlo.'),
    ready: words('Starting episode ready. Its ordering clues still need to be authored.', 'Episodio inicial listo. Aún tienes que escribir sus pistas de orden.'),
    waiting: words('Opening “' + title + '” in a separate workbench…', 'Abriendo «' + title + '» en un taller independiente…'),
    opened: words('“' + title + '” is open in its own workbench. Later edits here do not change it.', '«' + title + '» está abierto en su propio taller. Los cambios posteriores aquí no lo modifican.'),
    blocked: words('The browser blocked the new window. Download this starting episode and reopen it in a workbench.', 'El navegador bloqueó la ventana nueva. Descarga el episodio inicial y ábrelo en un taller.'),
    closed: words('The new workbench closed before opening was confirmed. You can open a fresh window or download the episode.', 'El taller nuevo se cerró antes de confirmar la apertura. Puedes abrir otra ventana o descargar el episodio.'),
    unconfirmed: words('Opening could not be confirmed. Check the opened tab; you can also download and reopen the starting episode.', 'No se pudo confirmar la apertura. Revisa la pestaña abierta; también puedes descargar y volver a abrir el episodio inicial.'),
    rejected: words('The new workbench could not receive the episode. ', 'El taller nuevo no pudo recibir el episodio. ') + message,
    downloaded: words('Starting episode downloaded. Reopen that file in a workbench to add clues.', 'Episodio inicial descargado. Abre ese archivo en un taller para añadir pistas.'),
    error: words('Cannot create: ', 'No se puede crear: ') + translateDiagnostic(locale, message)
  };
  $('creator-status').textContent = texts[statusKey] ?? '';
  $('creator-status').classList.toggle('error', ['error', 'blocked', 'closed', 'unconfirmed', 'rejected'].includes(statusKey));
}
function render() {
  document.documentElement.lang = locale; $('creator-ui-language').value = locale;
  for (const id of ['new-episode-title', 'new-episode-story', 'new-episode-labels', 'new-episode-action']) $(id).lang = $('new-episode-locale').value;
  document.title = 'LUDOLINGUA · ' + words('Create an original episode', 'Crea un episodio original');
  for (const element of document.querySelectorAll('[data-copy]')) element.textContent = copy[element.dataset.copy][locale === 'es' ? 1 : 0];
  $('create-starting-episode').disabled = preparing;
  $('open-created-workbench').disabled = !prepared || opening;
  $('download-starting-episode').disabled = !prepared;
  $('created-episode').hidden = !prepared;
  if (prepared) {
    const episode = prepared.episode, count = episode.cards.length;
    $('created-title').textContent = episode.title; $('created-title').lang = episode.locale;
    $('created-summary').textContent = words(count + ' cards · ' + episode.locale.toUpperCase() + ' · revision 1', count + ' tarjetas · ' + episode.locale.toUpperCase() + ' · revisión 1');
    $('created-reasoning').textContent = words(
      prepared.validation.result.clueOrderCount + ' possible orders remain because no ordering clues have been added. No solution or language-quality approval is claimed.',
      'Quedan ' + prepared.validation.result.clueOrderCount + ' órdenes posibles porque aún no has añadido pistas de orden. No se afirma que el enigma esté resuelto ni que se haya evaluado su calidad lingüística.');
    $('created-cards').replaceChildren(...episode.cards.map(card => { const li = document.createElement('li'); li.textContent = card.label; li.lang = episode.locale; return li; }));
    $('created-digest').textContent = 'SHA-256 ' + prepared.validation.episodeSha256;
  }
  renderStatus();
}
for (const id of ['new-episode-title', 'new-episode-story', 'new-episode-labels', 'new-episode-action', 'new-episode-locale']) {
  $(id).addEventListener('input', () => { generation++; prepared = null; preparing = false; showStatus('dirty'); render(); });
}
$('creator-ui-language').addEventListener('change', () => { locale = supportedLocale($('creator-ui-language').value); render(); });
$('new-episode-locale').addEventListener('change', () => {
  for (const id of ['new-episode-title', 'new-episode-story', 'new-episode-labels', 'new-episode-action']) $(id).lang = $('new-episode-locale').value;
});
$('create-episode-form').addEventListener('submit', async event => {
  event.preventDefault();
  const current = ++generation; prepared = null; preparing = true; showStatus('preparing'); render();
  try {
    const episode = createOriginalEpisode({
      title: $('new-episode-title').value, story: $('new-episode-story').value,
      locale: $('new-episode-locale').value, labels: $('new-episode-labels').value.split('\n'),
      action: $('new-episode-action').value
    }, { id: 'original-' + crypto.randomUUID() });
    const value = await createExport(episode);
    if (current !== generation) return;
    if (new Blob([JSON.stringify(value)]).size > MAX_BYTES) throw new Error('This episode exceeds the 20 MB receiver limit.');
    prepared = value; showStatus('ready');
  } catch (error) { if (current === generation) showStatus('error', { message: error.message }); }
  finally {
    if (current === generation) { preparing = false; render(); $('creator-status').focus({ preventScroll: true }); }
  }
});
$('open-created-workbench').addEventListener('click', () => {
  if (!prepared || opening) return;
  opening = true; render();
  try {
    openAuthorWorkbench(prepared, {
      locale,
      onStatus(value) { showStatus(value.type, { title: value.title, message: value.detail }); },
      onDone() { opening = false; render(); }
    });
  } catch (error) { opening = false; showStatus('error', { message: error.message }); render(); }
});
$('download-starting-episode').addEventListener('click', () => {
  if (!prepared) return;
  const blob = new Blob([JSON.stringify(prepared, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'ludolingua-' + prepared.episode.id + '-r1.json';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showStatus('downloaded');
});
render();
