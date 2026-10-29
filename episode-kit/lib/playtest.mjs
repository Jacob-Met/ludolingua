import { validateEpisode, checkAttempt } from './engine.mjs';

export const PLAYTEST_ENGINE_VERSION = '0.1.0';
export const MAX_PLAYTEST_EVENTS = 10000;
const shape = {
  move:['type','cardId','direction','elapsedMs'],
  hint:['type','elapsedMs'],attempt:['type','answer','elapsedMs'],
  reveal:['type','elapsedMs'],reset:['type','elapsedMs']
};
export function replayPlaytest(episode,events) {
  const result = {
    schema:'ludolingua.playtest-replay.v1',playtestEngineVersion:PLAYTEST_ENGINE_VERSION,
    valid:false,errors:[],finalState:null,summary:null,
    limitations:['Events and elapsed times are client-reported; replay does not attest a real person, identity, wall-clock duration or actual interaction.','Mechanical success does not establish language clarity, cultural suitability, comparable difficulty or unaided discovery.','No model inference or native-language human playtest is certified.']
  };
  const validation = validateEpisode(episode);
  if (!validation.valid) { result.errors = validation.errors.map(e=>`Episode: ${e}`); return result; }
  if (!Array.isArray(events) || events.length > MAX_PLAYTEST_EVENTS) { result.errors = [`Events must be an array containing at most ${MAX_PLAYTEST_EVENTS} entries.`]; return result; }
  const ids = episode.cards.map(c=>c.id);
  const startingOrder = () => [ids[ids.length-1],...ids.slice(0,-1)];
  const state = {order:startingOrder(),visibleHintCount:0,revealed:false,lastAttempt:null};
  const summary = {moves:0,attempts:0,successfulAttempts:0,hintsShown:0,resets:0,revealUsed:false,firstSuccessMs:null,elapsedMs:0};
  const fail = (i,message) => { result.errors = [`Event ${i}: ${message}`]; return result; };
  for (let i=0;i<events.length;i++) {
    const event = events[i];
    if (event === null || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string' || !Object.hasOwn(shape,event.type)) return fail(i,'Unknown event type or malformed event.');
    const keys = Object.keys(event), expected = shape[event.type];
    if (keys.length !== expected.length || !expected.every(k=>Object.hasOwn(event,k))) return fail(i,'Event properties must exactly match its type.');
    if (!Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < summary.elapsedMs) return fail(i,'elapsedMs must be a nonnegative safe integer and nondecreasing.');
    if (event.type === 'move') {
      if (typeof event.cardId !== 'string' || !ids.includes(event.cardId) || !['up','down'].includes(event.direction)) return fail(i,'Move needs an existing card and direction up or down.');
      const from = state.order.indexOf(event.cardId), to = from + (event.direction === 'up' ? -1 : 1);
      if (to < 0 || to >= state.order.length) return fail(i,'Move would cross an order boundary.');
      [state.order[from],state.order[to]] = [state.order[to],state.order[from]];
      state.lastAttempt = null; state.revealed = false; summary.moves++;
    } else if (event.type === 'hint') {
      if (state.visibleHintCount >= episode.hints.length) return fail(i,'All available hints are already visible.');
      state.visibleHintCount++; summary.hintsShown++;
    } else if (event.type === 'attempt') {
      if (typeof event.answer !== 'string') return fail(i,'Attempt answer must be a string.');
      state.lastAttempt = checkAttempt(episode,state.order,event.answer); summary.attempts++;
      if (state.lastAttempt.success) { summary.successfulAttempts++; if (summary.firstSuccessMs === null) summary.firstSuccessMs = event.elapsedMs; }
    } else if (event.type === 'reveal') {
      state.revealed = true; summary.revealUsed = true;
    } else {
      state.order = startingOrder(); state.visibleHintCount = 0; state.revealed = false; state.lastAttempt = null; summary.resets++;
    }
    summary.elapsedMs = event.elapsedMs;
  }
  result.valid = true; result.finalState = state; result.summary = summary;
  return result;
}
