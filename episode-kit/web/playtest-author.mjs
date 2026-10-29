import { validateEpisode } from '../lib/engine.mjs';
import { createExport } from '../lib/export.mjs';
import { readPlaytestRecord } from '../lib/playtest-export.mjs';

export function setupPlaytest({ getEpisode, notice, maxBytes }) {
  const $ = id => document.getElementById(id);
  let importSequence = 0;
  function node(tag, text, cls) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (cls) value.className = cls; return value; }
  $('launch-playtest').addEventListener('click', () => {
    const snapshot = structuredClone(getEpisode()), validation = validateEpisode(snapshot);
    if (!validation.valid) { notice('Complete valid episode data before opening a playtest: ' + validation.errors.join('; '), true); return; }
    const token = crypto.randomUUID(), url = new URL('./playtest.html', import.meta.url); url.searchParams.set('handoff', token);
    let popup = null, prepared = null, ready = false, sent = false;
    const cleanup = () => { window.removeEventListener('message', onReady); clearTimeout(timer); };
    function send() {
      if (!ready || !prepared || !popup || popup.closed || sent) return;
      popup.postMessage({ type: 'ludolingua.playtest.episode', token, episodeExport: prepared }, location.origin);
      sent = true; cleanup(); notice(`Opened revision ${snapshot.revision} in a separate player window. Later edits stay in this workbench.`);
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
    }).catch(error => { cleanup(); notice(`Cannot open playtest: ${error.message}`, true); });
  });
  function renderReview(record) {
    const root = $('playtest-review'), summary = record.validation.result.summary;
    root.replaceChildren(node('h4', `${record.episode.title} · revision ${record.episode.revision}`), node('p', `Session ${record.sessionId} · ${record.episode.locale.toUpperCase()}`, 'small'));
    const metrics = node('div', undefined, 'playtest-review-metrics');
    for (const [value, label] of [[summary.attempts, 'Recorded attempts'], [summary.successfulAttempts, 'Attempts matching clues and action'], [summary.hintsShown, 'Hints shown, including repeats'], [summary.resets, 'Resets'], [summary.revealUsed ? 'Yes' : 'No', 'Solution revealed in this record'], [summary.firstSuccessMs === null ? '—' : `${(summary.firstSuccessMs / 1000).toFixed(1)} s`, 'First matching attempt · client timing']]) {
      const metric = node('div', undefined, 'metric'); metric.append(node('strong', String(value)), node('span', label)); metrics.append(metric);
    }
    root.append(metrics, node('p', 'These totals are replayed from the journal. A matching attempt does not establish unique reasoning or qualify the episode. Missing recorded assistance does not prove unaided solving.', 'small'), node('p', 'Client-recorded actions and self-reported times do not authenticate who played, native-language fluency, language quality or model contribution. Content hashes are not signatures.', 'small'), node('p', `Episode SHA-256 ${record.integrity.episodeSha256}`, 'digest'), node('p', `Record SHA-256 ${record.integrity.bindingSha256}`, 'digest'));
    const details = node('details', undefined, 'playtest-events'), list = node('ol'), more = node('button', 'Show next 100 events', 'text-button');
    more.type = 'button'; let visible = 0;
    details.append(node('summary', `Recorded journey · ${record.events.length} events`), list, more); root.append(details);
    function addEvents() {
      const end = Math.min(visible + 100, record.events.length);
      for (; visible < end; visible++) {
        const event = record.events[visible];
        const action = event.type === 'move' ? `Move ${record.episode.cards.find(card => card.id === event.cardId).label} ${event.direction}` : event.type === 'attempt' ? `Try action: ${event.answer || '(empty answer)'}` : event.type === 'hint' ? 'Show a hint' : event.type === 'reveal' ? 'Reveal the solution' : 'Reset the order';
        list.append(node('li', `${(event.elapsedMs / 1000).toFixed(1)} s · ${action}`));
      }
      more.hidden = visible >= record.events.length;
    }
    more.addEventListener('click', addEvents); addEvents();
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
      renderReview(record); $('playtest-review-status').textContent = `Record verified. Replayed ${record.events.length} events for revision ${record.episode.revision}. Your current authored episode is unchanged.`;
      $('playtest-review-status').classList.remove('error');
    } catch (error) { if (sequence === importSequence) { $('playtest-review-status').textContent = `Cannot reopen: ${error.message}`; $('playtest-review-status').classList.add('error'); } }
    finally { if (sequence === importSequence) $('playtest-record-file').value = ''; }
  });
}
