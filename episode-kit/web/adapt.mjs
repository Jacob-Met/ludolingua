import { EPISODES } from '../fixtures/episodes.mjs';
import { analyzeEpisode, clueText } from '../lib/engine.mjs';
import { compareEpisodes } from '../lib/compare.mjs';
import { createExport } from '../lib/export.mjs';

const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const LANG = { en: 'English', es: 'Spanish' };
const other = locale => (locale === 'en' ? 'es' : 'en');
let verified = null;

const initial = label => [...label.trim().normalize('NFC')][0]?.toUpperCase() ?? '';
function solved(episode) { const a = analyzeEpisode(episode); return a.valid && a.solutions.length ? (a.solutions.find(s => s.actionMatches) ?? a.solutions[0]).order : episode.cards.map(c => c.id); }

function renderLane(prefix, episode, { fresh = false } = {}) {
  const tiles = $(prefix + '-tiles');
  if (!episode) {
    const src = EPISODES.find(e => e.id === $('source').value);
    tiles.replaceChildren(...src.cards.map(() => { const li = el('li', undefined, 'tile ghost'); li.append(el('span', '?', 'ini'), el('span', ' ', 'lab')); return li; }));
    $(prefix + '-word').textContent = ''; $(prefix + '-clues').replaceChildren(); return;
  }
  const byId = new Map(episode.cards.map(c => [c.id, c]));
  tiles.replaceChildren(...solved(episode).map(id => {
    const c = byId.get(id), li = el('li', undefined, 'tile' + (fresh ? ' fresh' : ''));
    li.lang = episode.locale; li.append(el('span', initial(c.label), 'ini'), el('span', c.label, 'lab'), el('span', id, 'role'));
    return li;
  }));
  const word = $(prefix + '-word'); word.textContent = episode.action.expected; word.lang = episode.locale;
  const list = $(prefix + '-clues'); list.lang = episode.locale;
  list.replaceChildren(...episode.clues.map(c => el('li', clueText(episode, c))));
}
function renderSource() {
  const src = EPISODES.find(e => e.id === $('source').value);
  $('target-lang').value = LANG[other(src.locale)];
  $('source-name').textContent = `${LANG[src.locale]} · ${src.title}`;
  $('source-meta').textContent = `${src.cards.length} cards · ${src.clues.length} clues`;
  $('target-name').textContent = `${LANG[other(src.locale)]} adaptation`;
  $('target-meta').textContent = 'waiting for a proposal';
  $('target-action').placeholder = 'let Nemotron choose';
  renderLane('source', src); renderLane('target', null);
  $('verdict').hidden = true; verified = null;
}
function notice(text, mode = '') { const n = $('notice'); n.textContent = text; n.className = 'notice ' + mode; }

function renderVerdict(result, source) {
  const v = $('verdict'); v.hidden = false;
  const ok = result.ok && result.episode;
  // Recompute in the browser: the page does not simply trust the server's claim.
  const target = result.episode;
  const analysis = ok ? analyzeEpisode(target) : null, comparison = ok ? compareEpisodes(source, target) : null;
  const pass = ok && analysis.mechanicalSuccess && comparison.mechanicalPreserved;
  const title = $('verdict-title');
  title.textContent = pass ? 'Mechanic preserved' : 'No verified adaptation';
  title.className = pass ? 'ok' : 'bad';
  $('verdict-why').textContent = pass
    ? 'Nemotron proposed new words. The puzzle engine, not the model, confirmed that the same card order is still the one solution and that its initials spell the new action.'
    : 'Nemotron did not produce a proposal that passed the checker within the attempt limit. Nothing was accepted. Try again, pick a larger model, or fix the action word.';
  const checks = [];
  if (ok) {
    checks.push([analysis.valid, 'Episode is valid']);
    checks.push([analysis.uniqueReasoning, `One clue-consistent order (${analysis.clueOrderCount} of ${analysis.permutationCount})`]);
    checks.push([analysis.actionMatchCount === analysis.clueOrderCount && analysis.clueOrderCount > 0, `Initials spell ${target.action.expected} in that order`]);
    checks.push([comparison.sameOrderSet, 'Same solution order as the source, role for role']);
    checks.push([comparison.mechanicalPreserved, 'Comparison engine: mechanic preserved']);
    checks.push([new Set(target.cards.map(c => c.label.toLowerCase())).size === target.cards.length, 'Labels are distinct']);
  }
  $('checks').replaceChildren(...checks.map(([good, text]) => el('li', text, good ? '' : 'fail')));
  $('attempts').replaceChildren(...result.attempts.map(a => {
    const li = el('li');
    li.append(el('span', `Attempt ${a.attempt}: `), a.ok ? el('span', 'accepted') : el('span', 'rejected. ' + a.reasons.join(' '), 'rej'));
    return li;
  }));
  const story = $('story'); story.replaceChildren(); story.lang = ok ? target.locale : source.locale;
  if (ok) {
    story.append(el('h3', target.title), el('p', target.story), el('ul'));
    story.lastChild.replaceChildren(...target.hints.map(h => el('li', h)));
  }
  $('download').disabled = !pass;
  verified = pass ? target : null;
  $('fine').textContent = `Model: ${result.model ?? 'n/a'} on Nebius Token Factory · ${result.usage?.prompt_tokens ?? 0} prompt and ${result.usage?.completion_tokens ?? 0} completion tokens. This proves the encoded mechanic only. Whether the words read naturally, hint quality and difficulty still need a native-speaker playtest.`;
}

async function run(event) {
  event.preventDefault();
  const source = EPISODES.find(e => e.id === $('source').value);
  const button = $('run'); button.disabled = true;
  notice('Asking Nemotron, then checking its answer…', 'busy');
  try {
    const response = await fetch('/api/adapt', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: source.id, targetLocale: other(source.locale), targetAction: $('target-action').value, model: $('model').value }) });
    const result = await response.json();
    if (!response.ok) { notice(result.error ?? 'The request failed.', 'error'); return; }
    renderLane('target', result.episode, { fresh: true });
    $('target-name').textContent = result.episode ? `${LANG[result.episode.locale]} · ${result.episode.title}` : `${LANG[other(source.locale)]} adaptation`;
    $('target-meta').textContent = result.episode ? `${result.attempts.length} attempt${result.attempts.length > 1 ? 's' : ''}` : 'rejected';
    renderVerdict(result, source);
    notice(result.ok ? 'Done. Verified by the puzzle engine.' : 'Not verified.', result.ok ? '' : 'error');
  } catch (error) { notice('Could not reach the local server: ' + error.message, 'error'); }
  finally { button.disabled = false; }
}

async function download() {
  if (!verified) return;
  const value = await createExport(verified);
  const link = el('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  link.download = verified.id + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function init() {
  const names = { 'en-original': 'English · Otter, Pine, Eagle, Nest (OPEN)', 'es-adapted': 'Spanish · coordinated adaptation (ABRE)', 'en-signal-original': 'English · Signal panel (PRESS)', 'es-signal-adapted': 'Spanish · Signal panel (PULSA)' };
  const usable = EPISODES.filter(e => names[e.id]);
  $('source').replaceChildren(...usable.map(e => { const o = el('option', names[e.id]); o.value = e.id; return o; }));
  $('source').addEventListener('change', renderSource);
  $('adapt-form').addEventListener('submit', run);
  $('download').addEventListener('click', download);
  renderSource();
  try {
    const status = await (await fetch('/api/status')).json();
    $('model').replaceChildren(...status.models.map(m => { const o = el('option', m.label); o.value = m.id; return o; }));
    $('model').value = status.defaultModel;
    const s = $('model-status');
    s.textContent = status.nemotronConfigured ? 'Nemotron on Nebius: ready' : 'Nemotron: set NEBIUS_API_KEY and restart';
    s.className = 'status ' + (status.nemotronConfigured ? 'ready' : 'off');
    if (!status.nemotronConfigured) notice('No API key is set on the server, so adaptation is unavailable. The checkers and workbench still work offline.', 'error');
  } catch { $('model-status').textContent = 'Server unreachable'; $('model-status').className = 'status off'; }
}
init();
