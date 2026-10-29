import { readExport } from '../lib/export.mjs';

const LIMIT = 20_000_000, LIFETIME = 60_000;
const READY = 'ludolingua.author.ready', EPISODE = 'ludolingua.author.episode';
const ACCEPTED = 'ludolingua.author.accepted', REJECTED = 'ludolingua.author.rejected';

/** Each click owns its own captured payload, window, token and terminal lifetime. */
export function openAuthorWorkbench(episodeExport, { locale = 'en', onStatus = () => {}, onDone = () => {} } = {}) {
  const captured = structuredClone(episodeExport);
  const expectedDigest = captured?.validation?.episodeSha256;
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '') || typeof captured?.episode?.title !== 'string') throw new Error('Expected a checked episode export.');
  if (new Blob([JSON.stringify(captured)]).size > LIMIT) throw new Error('This episode exceeds the 20 MB receiver limit.');
  if (!['en', 'es'].includes(locale)) throw new Error('Unsupported interface language.');
  const token = crypto.randomUUID(), target = new URL('./index.html', import.meta.url);
  target.searchParams.set('author-handoff', token);
  target.searchParams.set('author-ui', locale);
  let popup = null, sent = false, terminal = false, timer, closedTimer;
  const deadline = Date.now() + LIFETIME;
  function cleanup() {
    window.removeEventListener('message', message);
    window.removeEventListener('pagehide', departed);
    clearTimeout(timer); clearInterval(closedTimer);
  }
  function finish(type, detail) {
    if (terminal) return;
    terminal = true; cleanup(); onStatus({ type, detail, title: captured.episode.title }); onDone();
  }
  function departed() { if (!terminal) { terminal = true; cleanup(); } }
  function message(event) {
    if (terminal || event.origin !== location.origin || event.source !== popup || event.data?.token !== token) return;
    if (Date.now() >= deadline) { finish('unconfirmed'); return; }
    if (event.data.type === READY && !sent) {
      sent = true;
      try { popup.postMessage({ type: EPISODE, token, uiLocale: locale, episodeExport: captured }, location.origin); }
      catch { finish('unconfirmed'); }
    } else if (event.data.type === ACCEPTED && sent) {
      if (event.data.episodeSha256 !== expectedDigest) { finish('unconfirmed'); return; }
      finish('opened');
    } else if (event.data.type === REJECTED) {
      finish('rejected', typeof event.data.message === 'string' ? event.data.message : '');
    }
  }
  window.addEventListener('message', message);
  window.addEventListener('pagehide', departed, { once: true });
  timer = setTimeout(() => finish('unconfirmed'), LIFETIME);
  // Register before opening; the browser dispatches the child's ready event later.
  try { popup = window.open(target.href, '_blank'); }
  catch { finish('blocked'); return { cancel: departed }; }
  if (!popup) { finish('blocked'); return { cancel: departed }; }
  onStatus({ type: 'waiting', title: captured.episode.title });
  closedTimer = setInterval(() => { if (popup.closed) finish('closed'); }, 500);
  return { cancel: departed };
}

/** Validate a one-time handoff before a synchronous detached-workbench commit. */
export function receiveAuthoredEpisode({ onReceive, maxBytes = LIMIT, locale = 'en' }) {
  const url = new URL(location.href), token = url.searchParams.get('author-handoff');
  if (!token) return { relocalize() {} };
  url.searchParams.delete('author-handoff'); url.searchParams.delete('author-ui');
  history.replaceState(history.state, '', url.href);
  const opener = window.opener, workspace = document.querySelector('.workspace');
  const status = document.createElement('p');
  status.id = 'author-handoff-status'; status.className = 'notice author-handoff-notice';
  status.setAttribute('role', 'status'); status.tabIndex = -1;
  workspace.before(status);
  const oldInert = workspace.inert;
  let state = 'pending', statusKey = 'waiting', detail = '', timer;
  const deadline = Date.now() + LIFETIME;
  const words = {
    waiting: ['Receiving your original episode. Your other workbench stays unchanged.', 'Recibiendo tu episodio original. El otro taller no cambia.'],
    opened: ['Your original episode is open. Add ordering clues, then check this revision. Export to keep this tab’s work.', 'Tu episodio original está abierto. Añade pistas de orden y comprueba esta revisión. Exporta para conservar el trabajo de esta pestaña.'],
    timeout: ['The original episode did not arrive in time. This workbench is ready to use. Download the starting episode from the creation page and reopen that file here.', 'El episodio original no llegó a tiempo. Este taller está disponible. Descarga el episodio inicial desde la página de creación y abre aquí ese archivo.'],
    unavailable: ['The creation window is unavailable. Download the starting episode and use Reopen an export in this workbench.', 'La ventana de creación no está disponible. Descarga el episodio inicial y usa Reabrir una exportación en este taller.'],
    rejected: ['The original episode could not be opened. This workbench is unchanged.', 'No se pudo abrir el episodio original. Este taller no ha cambiado.']
  };
  function paint() {
    const text = words[statusKey][locale === 'es' ? 1 : 0];
    status.textContent = text + (detail ? ' ' + detail : '');
    status.classList.toggle('error', ['timeout', 'unavailable', 'rejected'].includes(statusKey));
  }
  function cleanup() {
    clearTimeout(timer); window.removeEventListener('message', message);
    window.removeEventListener('pagehide', departed);
  }
  function terminal(key, messageText = '') {
    if (state === 'terminal') return false;
    state = 'terminal'; statusKey = key; detail = messageText; cleanup();
    workspace.inert = oldInert; workspace.removeAttribute('aria-busy'); paint();
    return true;
  }
  function departed() { state = 'terminal'; cleanup(); workspace.inert = oldInert; workspace.removeAttribute('aria-busy'); }
  function alive() {
    if (state !== 'consuming') return false;
    if (Date.now() >= deadline) { terminal('timeout'); return false; }
    return true;
  }
  async function message(event) {
    if (state !== 'pending' || event.origin !== location.origin || event.source !== opener ||
        event.data?.type !== EPISODE || event.data?.token !== token) return;
    if (Date.now() >= deadline) { terminal('timeout'); return; }
    state = 'consuming'; // A duplicate cannot start a second validation or import.
    try {
      if (!['en', 'es'].includes(event.data.uiLocale)) throw new Error('Unsupported interface language.');
      const incoming = event.data.episodeExport;
      if (new Blob([JSON.stringify(incoming)]).size > maxBytes) throw new Error('The episode export exceeds the 20 MB receiver limit.');
      const checked = await readExport(incoming);
      if (!alive()) return;
      // The integration callback commits synchronously; no partial validation is adopted.
      onReceive(checked, event.data.uiLocale);
      locale = event.data.uiLocale;
      terminal('opened');
      document.getElementById('episode-title-input')?.focus({ preventScroll: true });
      opener.postMessage({ type: ACCEPTED, token, episodeSha256: checked.integrity.episodeSha256 }, location.origin);
    } catch (error) {
      if (!alive()) return;
      terminal('rejected', error.message);
      opener.postMessage({ type: REJECTED, token, message: error.message }, location.origin);
    }
  }
  workspace.inert = true; workspace.setAttribute('aria-busy', 'true'); paint(); status.focus();
  if (!opener || opener.closed || location.origin === 'null') terminal('unavailable');
  else {
    window.addEventListener('message', message);
    window.addEventListener('pagehide', departed, { once: true });
    timer = setTimeout(() => terminal('timeout'), LIFETIME);
    opener.postMessage({ type: READY, token }, location.origin);
  }
  return { relocalize(value) { locale = value; paint(); } };
}
