import { validateEpisode } from '../lib/engine.mjs';
import { createExport } from '../lib/export.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';

export function setupPlaytest({ getEpisode, notice, maxBytes, t, diagnostic, getUILocale }) {
  const $ = id => document.getElementById(id);
  let importSequence = 0, acceptedRecord = null, visibleEvents = 0, reviewOpen = false, reviewStatus = null;
  function renderStatus() { if (reviewStatus) { $('playtest-review-status').textContent = t(reviewStatus.key, { ...reviewStatus.values, ...(reviewStatus.values.message === undefined ? {} : {message: diagnostic(reviewStatus.values.message)}) }); $('playtest-review-status').classList.toggle('error', reviewStatus.error); } }
  function node(tag, text, cls) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (cls) value.className = cls; return value; }
  $('launch-playtest').addEventListener('click', () => {
    const uiLocale = getUILocale(), snapshot = structuredClone(getEpisode()), validation = validateEpisode(snapshot);
    if (!validation.valid) { notice('Complete valid episode data before opening a playtest: {message}', true, {message: validation.errors.join('; ')}); return; }
    const token = crypto.randomUUID(), url = new URL('./playtest.html', import.meta.url); url.searchParams.set('handoff', token);
    let popup = null, prepared = null, ready = false, sent = false;
    const cleanup = () => { window.removeEventListener('message', onReady); clearTimeout(timer); };
    function send() {
      if (!ready || !prepared || !popup || popup.closed || sent) return;
      popup.postMessage({ type: 'ludolingua.playtest.episode', token, uiLocale, episodeExport: prepared }, location.origin);
      sent = true; cleanup(); notice('Opened revision {revision} in a separate player window. Later edits stay in this workbench.', false, {revision:snapshot.revision});
    }
    function onReady(event) {
      if (event.origin !== location.origin || event.source !== popup || event.data?.type !== 'ludolingua.playtest.ready' || event.data?.token !== token) return;
      ready = true; send();
    }
    window.addEventListener('message', onReady);
    const timer = setTimeout(() => { cleanup(); if (!sent) notice('The player window did not receive the episode. Reopen it, or export the episode and open the file in the player.', true); }, 60_000);
    popup = window.open(url.href, '_blank');
    if (!popup) { cleanup(); notice('The browser blocked the player window. Allow this local workbench to open a window, or open playtest.html and choose an episode export.', true); return; }
    createExport(snapshot).then(value => {
      if (new Blob([JSON.stringify(value)]).size > maxBytes) throw new Error('This episode exceeds the 20 MB receiver limit.');
      prepared = value; send();
    }).catch(error => { cleanup(); notice('Cannot open playtest: {message}', true, {message:error.message}); });
  });
  function renderReview(record) {
    const root = $('playtest-review'), summary = record.validation.result.summary;
    root.replaceChildren(node('h4', t('{title} · revision {revision}', {title:record.episode.title,revision:record.episode.revision})), node('p', t('Session {session} · {locale}', {session:record.sessionId,locale:record.episode.locale.toUpperCase()}), 'small'));
    const metrics = node('div', undefined, 'playtest-review-metrics');
    for (const [value, label] of [[summary.attempts, 'Recorded attempts'], [summary.successfulAttempts, 'Attempts matching clues and action'], [summary.hintsShown, 'Hints shown, including repeats'], [summary.resets, 'Resets'], [t(summary.revealUsed ? 'Yes' : 'No'), 'Solution revealed in this record'], [summary.firstSuccessMs === null ? '—' : `${(summary.firstSuccessMs / 1000).toFixed(1)} s`, 'First matching attempt · client timing']]) {
      const metric = node('div', undefined, 'metric'); metric.append(node('strong', String(value)), node('span', t(label))); metrics.append(metric);
    }
    root.append(metrics, node('p', t('These totals are replayed from the journal. A matching attempt does not establish unique reasoning or qualify the episode. Missing recorded assistance does not prove unaided solving.'), 'small'), node('p', t('Client-recorded actions and self-reported times do not authenticate who played, native-language fluency, language quality or model contribution. Content hashes are not signatures.'), 'small'), node('p', t('Episode SHA-256 {hash}',{hash:record.integrity.episodeSha256}), 'digest'), node('p', t('Record SHA-256 {hash}',{hash:record.integrity.bindingSha256}), 'digest'));
    const details = node('details', undefined, 'playtest-events'), list = node('ol'), more = node('button', t('Show next 100 events'), 'text-button');
    more.type = 'button'; let visible = 0; details.open = reviewOpen; details.addEventListener('toggle', () => { if (details.isConnected) reviewOpen = details.open; });
    details.append(node('summary', t('Recorded journey · {count} events',{count:record.events.length})), list, more); root.append(details);
    function addEvents(count = 100) {
      const end = Math.min(visible + count, record.events.length);
      for (; visible < end; visible++) {
        const event = record.events[visible];
        const action = event.type === 'move' ? t(event.direction === 'up' ? 'Move {label} up' : 'Move {label} down', {label:record.episode.cards.find(card => card.id === event.cardId).label}) : event.type === 'attempt' ? t('Try action: {answer}', {answer:event.answer || t('(empty answer)')}) : event.type === 'hint' ? t('Show a hint') : event.type === 'reveal' ? t('Reveal the solution') : t('Reset the order');
        list.append(node('li', t('{seconds} s · {action}', {seconds:(event.elapsedMs / 1000).toFixed(1),action})));
      }
      visibleEvents = visible; more.hidden = visible >= record.events.length;
    }
    more.addEventListener('click', () => addEvents()); addEvents(visibleEvents || 100);
    root.hidden = false;
  }
  $('playtest-record-button').addEventListener('click', () => $('playtest-record-file').click());
  $('playtest-record-file').addEventListener('change', async () => {
    const file = $('playtest-record-file').files[0]; if (!file) return;
    const sequence = ++importSequence;
    try {
      if (file.size > maxBytes) throw new Error('The play record exceeds the 20 MB receiver limit.');
      const record = await readPlaytestRecord(await file.text());
      if (sequence !== importSequence) return;
      acceptedRecord = record; visibleEvents = 0; reviewOpen = false; renderReview(record); reviewStatus = {key:'Record verified. Replayed {count} events for revision {revision}. Your current authored episode is unchanged.',values:{count:record.events.length,revision:record.episode.revision},error:false}; renderStatus();
    } catch (error) { if (sequence === importSequence) { reviewStatus = {key:'Cannot reopen: {message}',values:{message:error.message},error:true}; renderStatus(); } }
    finally { if (sequence === importSequence) $('playtest-record-file').value = ''; }
  });
  return { relocalize() { const details = $('playtest-review').querySelector('details'); if(details) reviewOpen = details.open; if (acceptedRecord) renderReview(acceptedRecord); renderStatus(); } };
}
