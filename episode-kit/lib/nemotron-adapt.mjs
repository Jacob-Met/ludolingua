// The model proposes a coordinated adaptation; the engine and comparison logic decide whether it holds.
import { analyzeEpisode, clueText, validateEpisode } from './engine.mjs';
import { compareEpisodes } from './compare.mjs';
import { createAdaptation } from './adaptation.mjs';

const LANGUAGE = { en: 'English', es: 'Spanish' };

export function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  for (let end = cleaned.lastIndexOf('}'); end > start && start >= 0; end = cleaned.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* try a shorter span */ }
  }
  throw new Error('The model reply did not contain a JSON object.');
}

export function solvedOrder(source) {
  const analysis = analyzeEpisode(source);
  if (!analysis.valid) throw new Error('The source episode is not valid: ' + analysis.errors.join('; '));
  if (!analysis.mechanicalSuccess || analysis.solutions.length === 0) throw new Error('The source episode has no single verified solution to preserve.');
  return analysis.solutions.find(s => s.actionMatches).order;
}

export function buildMessages(source, targetLocale, { feedback = [], targetAction } = {}) {
  const order = solvedOrder(source);
  const slots = order.map((id, i) => {
    const card = source.cards.find(c => c.id === id);
    return `  slot ${i + 1}: role "${id}" (source ${LANGUAGE[source.locale]} label: ${card.label})`;
  }).join('\n');
  const clues = source.clues.map(c => '  - ' + clueText(source, c)).join('\n');
  const actionRule = targetAction
    ? `The required action word is fixed: ${targetAction}.`
    : `Choose the natural ${LANGUAGE[targetLocale]} word for the source action "${source.action.expected}" (an imperative that fits the story).`;
  const system = 'You adapt word puzzles between languages while preserving how they are solved. You reply with one JSON object only, no commentary.';
  const user = [
    `Adapt this ${LANGUAGE[source.locale]} puzzle episode into ${LANGUAGE[targetLocale]}.`,
    `Puzzle mechanic: the player orders the cards using the clues, then reads the FIRST LETTER of each card label from left to right. Those letters spell the required action.`,
    `Source title: ${source.title}`, `Source story: ${source.story}`,
    `Source action: ${source.action.expected}`, `Cards in solved order:\n${slots}`, `Clues (they reference cards by role and must stay true):\n${clues}`,
    '',
    actionRule,
    `Rules: give each role a new ${LANGUAGE[targetLocale]} label (a concrete noun or short name, one to three words, a different referent is fine) so that the first letters of the labels, in solved order, spell the action exactly. Labels must be distinct. Do not change the roles or the clues; only the words.`,
    `Also write the title, the story and three short hints in ${LANGUAGE[targetLocale]}, keeping the story's meaning and not revealing the answer.`,
    'Reply with JSON of this exact shape:',
    '{"action":"WORD","labels":{"<role id>":"label", ...},"title":"...","story":"...","hints":["...","...","..."]}',
    ...(feedback.length ? ['', 'Your previous attempt was rejected by the puzzle checker:', ...feedback.map(f => '  - ' + f), 'Fix exactly that and reply again.'] : [])
  ].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

async function candidate(source, targetLocale, proposal, id) {
  const { targetEpisode } = await createAdaptation(source, targetLocale, { id });
  const text = x => (typeof x === 'string' ? x.trim() : '');
  const labels = proposal?.labels && typeof proposal.labels === 'object' ? proposal.labels : {};
  for (const card of targetEpisode.cards) if (text(labels[card.id])) card.label = text(labels[card.id]);
  if (text(proposal.action)) targetEpisode.action.expected = text(proposal.action).toLocaleUpperCase(targetLocale);
  if (text(proposal.title)) targetEpisode.title = text(proposal.title);
  if (text(proposal.story)) targetEpisode.story = text(proposal.story);
  if (Array.isArray(proposal.hints) && proposal.hints.length && proposal.hints.every(h => typeof h === 'string' && h.trim())) targetEpisode.hints = proposal.hints.map(h => h.trim());
  return targetEpisode;
}

/** Verdict on one proposal using only deterministic logic. */
export function judge(source, target) {
  const reasons = [];
  const validation = validateEpisode(target);
  if (!validation.valid) reasons.push('Invalid episode: ' + validation.errors.join('; '));
  const analysis = analyzeEpisode(target);
  const comparison = compareEpisodes(source, target);
  if (validation.valid) {
    const order = solvedOrder(source);
    const byId = new Map(target.cards.map(c => [c.id, c.label]));
    const token = order.map(id => [...byId.get(id).trim().normalize('NFC')][0].toLocaleUpperCase(target.locale)).join('');
    if (token !== target.action.expected.normalize('NFC').toLocaleUpperCase(target.locale)) {
      reasons.push(`In the solved order the first letters spell ${token}, not ${target.action.expected}.`);
    }
    if (new Set(target.cards.map(c => c.label.trim().toLocaleLowerCase(target.locale))).size !== target.cards.length) reasons.push('Two labels are identical.');
    if (!analysis.mechanicalSuccess) reasons.push(`The checker outcome is "${analysis.outcome}", not verified.`);
    if (!comparison.mechanicalPreserved) reasons.push('The solution set differs from the source under the role mapping.');
  }
  return { ok: reasons.length === 0, reasons, analysis, comparison };
}

export async function adaptWithNemotron({ source, targetLocale, targetAction, chat, maxAttempts = 3 }) {
  if (!['en', 'es'].includes(targetLocale) || targetLocale === source.locale) throw new Error('Choose a different target language.');
  const id = `${source.id}-nemotron-${targetLocale}`;
  const attempts = [];
  let feedback = [], lastModel = null, usage = { prompt_tokens: 0, completion_tokens: 0 };
  for (let n = 1; n <= maxAttempts; n++) {
    const reply = await chat(buildMessages(source, targetLocale, { feedback, targetAction }));
    lastModel = reply.model;
    if (reply.usage) for (const k of Object.keys(usage)) usage[k] += reply.usage[k] ?? 0;
    let proposal, target, verdict;
    try {
      proposal = extractJson(reply.content);
      target = await candidate(source, targetLocale, proposal, id);
      if (targetAction) target.action.expected = targetAction.trim().toLocaleUpperCase(targetLocale);
      verdict = judge(source, target);
    } catch (error) { verdict = { ok: false, reasons: [error.message], analysis: null, comparison: null }; }
    attempts.push({ attempt: n, ok: verdict.ok, reasons: verdict.reasons, labels: target ? Object.fromEntries(target.cards.map(c => [c.id, c.label])) : null, action: target?.action.expected ?? null });
    if (verdict.ok) {
      target.provenance.semanticChanges.push(`Labels, action, title, story and hints were proposed by ${lastModel} on Nebius Token Factory (attempt ${n}) and then accepted only after the engine and comparison checks passed. Not a human review; clarity and difficulty remain untested.`);
      return { ok: true, model: lastModel, usage, attempts, episode: target, analysis: verdict.analysis, comparison: verdict.comparison };
    }
    feedback = verdict.reasons;
  }
  return { ok: false, model: lastModel, usage, attempts, episode: null, analysis: null, comparison: null };
}
