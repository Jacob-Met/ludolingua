import { readExport } from '../lib/export.mjs';

/** Adapt the maintained file picker; player state and replay stay in playtest.mjs. */
export async function bootPortablePlayer() {
  const $ = id => document.getElementById(id);
  const entry = $('playtest-import'), session = $('playtest-session');
  const file = $('playtest-file'), resume = $('playtest-resume-file'), language = $('playtest-ui-language');
  const wasInert = entry.inert;
  const start = document.createElement('button');
  start.id = 'portable-start'; start.type = 'button'; start.className = 'primary'; start.disabled = true;
  const explanation = document.createElement('p'); explanation.className = 'small';
  explanation.id = 'portable-start-help';
  start.setAttribute('aria-describedby', explanation.id);
  file.parentElement.prepend(explanation, start);
  file.hidden = true; $('playtest-file-label').hidden = true;
  const notice = document.createElement('p');
  notice.id = 'portable-status'; notice.className = 'notice'; notice.setAttribute('role', 'status');
  entry.before(notice); entry.inert = true;
  let chosen = null, preparedText = '', booting = true, failure = '';
  const words = (en, es) => language.value === 'es' ? es : en;
  function render() {
    start.textContent = words('Start this puzzle', 'Empezar este enigma');
    explanation.textContent = words('Start a new play record for the included puzzle.', 'Empieza un registro nuevo para el enigma incluido.');
    notice.classList.toggle('error', Boolean(failure));
    if (!session.hidden) {
      start.disabled = true; notice.classList.remove('error'); notice.dataset.state = 'playing';
      notice.textContent = words('This player works offline. Download your newest play record before closing. Reopen this file to continue that record.', 'Este reproductor funciona sin conexión. Descarga tu registro más reciente antes de cerrar. Vuelve a abrir este archivo para continuar ese registro.');
      return;
    }
    const loading = file.disabled || resume.disabled;
    start.disabled = booting || !preparedText || loading;
    notice.dataset.state = booting ? 'loading' : failure ? 'error' : 'ready';
    if (booting) notice.textContent = words('Checking the puzzle included in this file…', 'Comprobando el enigma incluido en este archivo…');
    else if (failure) notice.textContent = words('The included puzzle cannot be opened: ', 'No se puede abrir el enigma incluido: ') + failure + words(' You can still continue a valid saved play record.', ' Aún puedes continuar un registro de juego válido.');
    else notice.textContent = words('Start the included puzzle, or continue a saved play record. Continuing opens the puzzle captured in that record.', 'Empieza el enigma incluido o continúa un registro de juego guardado. Al continuar se abre el enigma capturado en ese registro.');
    // Once native receiving starts, it owns all scene and session presentation.
    if (chosen && !loading && !booting) {
      $('playtest-title').textContent = chosen.title; $('playtest-title').lang = chosen.locale;
      $('playtest-story').textContent = chosen.story; $('playtest-story').lang = chosen.locale;
      $('playtest-revision').textContent = words('Included puzzle · revision ', 'Enigma incluido · revisión ') + chosen.revision + ' · ' + chosen.locale.toUpperCase();
      document.title = 'LUDOLINGUA · ' + chosen.title;
    }
  }
  language.addEventListener('change', render);
  const observer = new MutationObserver(render);
  observer.observe(session, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(file, { attributes: true, attributeFilter: ['disabled'] });
  observer.observe(resume, { attributes: true, attributeFilter: ['disabled'] });
  start.addEventListener('click', () => {
    if (!preparedText || start.disabled || !session.hidden) return;
    start.disabled = true; failure = '';
    try {
      const transfer = new DataTransfer();
      transfer.items.add(new File([preparedText], 'ludolingua-included-episode.json', { type: 'application/json' }));
      file.files = transfer.files;
      file.dispatchEvent(new Event('change', { bubbles: true }));
      render();
    } catch (error) { failure = error.message; render(); }
  });
  window.addEventListener('pagehide', event => { if (!event.persisted) observer.disconnect(); });
  render();
  try {
    const payload = JSON.parse($('ludolingua-portable-data').textContent);
    if (payload?.schema !== 'ludolingua.portable-player-data.v1' || !['en', 'es'].includes(payload.uiLocale)) throw new Error('Invalid playable file data.');
    // Apply the captured default before awaiting; later learner choices are retained.
    language.value = payload.uiLocale; language.dispatchEvent(new Event('change', { bubbles: true }));
    const snapshot = JSON.stringify(payload.episodeExport);
    const checked = await readExport(snapshot);
    chosen = checked.episode; preparedText = snapshot;
  } catch (error) { failure = error.message; }
  finally {
    booting = false; entry.inert = wasInert; render();
    if (document.activeElement === document.body && !start.disabled) start.focus();
  }
}
