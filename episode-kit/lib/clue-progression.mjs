import { validateEpisode, matchesClue } from './engine.mjs';
import { compareEpisodes } from './compare.mjs';

// Exact, bounded ordering-space inspection. This is NOT a human-difficulty score.
export const CLUE_PATH_VERSION = '0.1.0';
const MAX_CLUES = 64;

function allOrders(ids) {
  const out = [];
  function visit(prefix, left) {
    if (!left.length) { out.push(prefix); return; }
    for (let i = 0; i < left.length; i += 1) {
      visit([...prefix, left[i]], [...left.slice(0, i), ...left.slice(i + 1)]);
    }
  }
  visit([], ids);
  return out;
}

function runPath(episode, orders, positions, canonicalFor) {
  let survivors = new Uint8Array(orders.length).fill(1);
  const masks = [];
  const steps = [];
  let before = orders.length;
  for (const clue of episode.clues) {
    const converted = {kind: clue.kind, left: canonicalFor(clue.left), right: canonicalFor(clue.right)};
    const next = survivors.slice();
    let after = 0;
    for (let i = 0; i < next.length; i += 1) {
      if (!next[i]) continue;
      if (matchesClue(converted, positions[i])) after += 1;
      else next[i] = 0;
    }
    const informationBits = before > 0 && after > 0
      ? Number(Math.log2(before / after).toFixed(6)) : null;
    steps.push({
      clueId: clue.id, kind: clue.kind, left: clue.left, right: clue.right,
      beforeCount: before, afterCount: after, eliminatedCount: before - after,
      informationBits, redundantAtThisStage: before > 0 && before === after,
      contradictionAtThisStage: before > 0 && after === 0
    });
    masks.push(next);
    survivors = next;
    before = after;
  }
  return {steps, masks, finalMask: survivors, finalOrderCount: before};
}

function publicResult(episode, orders, result) {
  return {
    locale: episode.locale, id: episode.id, clueCount: episode.clues.length,
    totalOrders: orders.length, finalOrderCount: result.finalOrderCount,
    steps: result.steps
  };
}

function defaultReturn() {
  return {
    schema: 'ludolingua.clue-progression.v1',
    version: CLUE_PATH_VERSION, valid: false, available: false,
    errors: [], mechanicalPreserved: null, sameFinalOrderSet: null,
    sameClueProgression: null, firstDifference: null,
    sourcePath: null, targetPath: null,
    limitations: [
      'Clue progression measures exact survivor sets after hypothetical prefixes of the listed encoded clues, not comprehension, subjective difficulty, cultural equivalence or learning.',
      'The current player displays all encoded clues at once and reveals separate hints. This audit does not inspect hint wording or reveal order, or establish the learner journey.',
      'informationBits is log2(beforeCount/afterCount), rounded to six decimal places for positive counts; otherwise null. It describes count reduction under a uniform-candidate interpretation, not learner information acquisition.',
      'Different listed-clue prefix sets can reflect a deliberate author choice and do not by themselves establish a failed localization.',
      'No NVIDIA/Nebius model run or native-language human playtest is established by this audit.'
    ]
  };
}

export function compareClueProgression(source, target, mapping = undefined) {
  const result = defaultReturn();
  const a = validateEpisode(source), b = validateEpisode(target);
  result.errors.push(...a.errors.map(x => 'Source: ' + x), ...b.errors.map(x => 'Target: ' + x));
  if (result.errors.length) return result;
  result.valid = true;
  if (source.clues.length > MAX_CLUES || target.clues.length > MAX_CLUES) {
    result.errors.push('Clue progression unavailable: each episode is limited to 64 authored clues for this bounded audit.');
    return result;
  }
  const normalizedMapping = mapping === null ? undefined : mapping;
  const comparison = compareEpisodes(source, target, normalizedMapping);
  if (!comparison.valid) {
    result.valid = false;
    result.errors.push(...comparison.errors);
    return result;
  }
  const ids = source.cards.map(x => x.id);
  const orders = allOrders(ids);
  const positions = orders.map(order => new Map(order.map((id, index) => [id, index])));
  const backward = new Map(comparison.mapping.map(pair => [pair.targetId, pair.sourceId]));
  const sourceRun = runPath(source, orders, positions, id => id);
  const targetRun = runPath(target, orders, positions, id => backward.get(id));
  result.available = true;
  result.mechanicalPreserved = comparison.mechanicalPreserved;
  result.sameFinalOrderSet = comparison.sameOrderSet;
  result.sourcePath = publicResult(source, orders, sourceRun);
  result.targetPath = publicResult(target, orders, targetRun);
  const size = Math.max(sourceRun.masks.length, targetRun.masks.length);
  result.sameClueProgression = sourceRun.masks.length === targetRun.masks.length;
  for (let stage = 0; stage < size; stage += 1) {
    const maskA = sourceRun.masks[stage], maskB = targetRun.masks[stage];
    let sourceOnly = null, targetOnly = null;
    if (maskA && maskB) {
      for (let j = 0; j < orders.length; j += 1) {
        if (maskA[j] === maskB[j]) continue;
        if (maskA[j] && sourceOnly === null) sourceOnly = orders[j];
        if (maskB[j] && targetOnly === null) targetOnly = orders[j];
        if (sourceOnly && targetOnly) break;
      }
    }
    if (!maskA || !maskB || sourceOnly || targetOnly) {
      result.sameClueProgression = false;
      if (!result.firstDifference) {
        result.firstDifference = {
          clueNumber: stage + 1,
          sourceRemaining: sourceRun.steps[stage]?.afterCount ?? null,
          targetRemaining: targetRun.steps[stage]?.afterCount ?? null,
          sourceOnlyOrder: sourceOnly,
          targetOnlyOrder: targetOnly,
          note: !maskA || !maskB ? 'Episodes have different numbers of clues.' :
            'Exact survivor sets differ after this authored clue prefix; counts alone may hide the difference.'
        };
      }
    }
  }
  return result;
}

export function inspectClueProgression(episode) {
  const validation = validateEpisode(episode);
  if (!validation.valid) return {
    schema: 'ludolingua.clue-path.v1', version: CLUE_PATH_VERSION,
    valid: false, available: false, errors: validation.errors
  };
  if (episode.clues.length > MAX_CLUES) return {
    schema: 'ludolingua.clue-path.v1', version: CLUE_PATH_VERSION,
    valid: true, available: false, errors: ['64-clue audit budget exceeded.']
  };
  const ids = episode.cards.map(x => x.id);
  const orders = allOrders(ids);
  const positions = orders.map(order => new Map(order.map((id, index) => [id, index])));
  const examined = runPath(episode, orders, positions, id => id);
  return {
    schema: 'ludolingua.clue-path.v1', version: CLUE_PATH_VERSION,
    valid: true, available: true, errors: [], ...publicResult(episode, orders, examined),
    limitations: ['These are hypothetical prefixes of the listed encoded clues; the current player displays all clues at once and reveals separate hints that this audit does not inspect.', 'informationBits is log2(beforeCount/afterCount), rounded to six decimal places for positive counts; otherwise null. Uniform-candidate count reduction does not establish learner information acquisition, perceived difficulty, linguistic meaning or language quality.']
  };
}
