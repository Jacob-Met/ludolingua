import { validateEpisode, matchesClue } from './engine.mjs';

const LIMITS = Object.freeze({
  maxDistinctClues: 64,
  maxEvaluations: 200000,
  maxOrders: 50000,
  maxRawClues: 1000
});
const EXHAUSTED = Symbol('clue-conflict-budget-exhausted');

function budgets(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Conflict diagnostic options must be an object.');
  }
  const result = {};
  for (const [name, ceiling] of Object.entries(LIMITS)) {
    const value = options[name] === undefined ? ceiling : options[name];
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(name + ' must be a nonnegative safe integer.');
    }
    result[name] = Math.min(value, ceiling);
  }
  return result;
}

/**
 * Return one irreducible conflicting clue set, not a global minimum.
 * Results: invalid/errors, satisfiable, conflict/clueIds, budget-exhausted.
 * Budgets cover the initial search and every deletion probe. No partial proof
 * is returned. The episode, action, analysis and export contract are unchanged.
 */
export function explainClueConflict(episode, options = {}) {
  const limits = budgets(options);
  if (Array.isArray(episode?.clues) && episode.clues.length > limits.maxRawClues) {
    return { state: 'budget-exhausted' };
  }
  const validation = validateEpisode(episode);
  if (!validation.valid) return { state: 'invalid', errors: [...validation.errors] };

  const seen = new Set(), distinct = [];
  for (const clue of episode.clues) {
    const key = JSON.stringify([clue.kind, clue.left, clue.right]);
    if (seen.has(key)) continue;
    seen.add(key); distinct.push(clue);
    if (distinct.length > limits.maxDistinctClues) return { state: 'budget-exhausted' };
  }
  if (distinct.length === 0) return { state: 'satisfiable' };

  const cardIds = episode.cards.map(card => card.id);
  let evaluations = 0, orders = 0;
  function hasOrder(clues) {
    if (clues.length === 0) return true;
    const used = new Array(cardIds.length).fill(false), positions = new Map();
    function visit(depth) {
      if (depth === cardIds.length) {
        if (orders >= limits.maxOrders) throw EXHAUSTED;
        orders += 1;
        for (const clue of clues) {
          if (evaluations >= limits.maxEvaluations) throw EXHAUSTED;
          evaluations += 1;
          if (!matchesClue(clue, positions)) return false;
        }
        return true;
      }
      for (let index = 0; index < cardIds.length; index += 1) {
        if (used[index]) continue;
        used[index] = true; positions.set(cardIds[index], depth);
        const found = visit(depth + 1);
        positions.delete(cardIds[index]); used[index] = false;
        if (found) return true;
      }
      return false;
    }
    return visit(0);
  }
  try {
    if (hasOrder(distinct)) return { state: 'satisfiable' };
    const core = [...distinct];
    let index = 0;
    while (index < core.length) {
      const candidate = core.filter((_, position) => position !== index);
      if (hasOrder(candidate)) {
        // A witness without this clue stays valid as later clues are removed.
        index += 1;
      } else {
        core.splice(index, 1);
      }
    }
    return { state: 'conflict', clueIds: core.map(clue => clue.id) };
  } catch (error) {
    if (error === EXHAUSTED) return { state: 'budget-exhausted' };
    throw error;
  }
}
