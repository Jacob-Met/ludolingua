import { compareEpisodes } from './compare.mjs';
import { matchesClue } from './engine.mjs';

// Advisory only. The exported comparison contract remains unchanged.
export const MAX_REPAIR_CHECKS = 12;

function matchesOrder(clue, order) {
  const positions = new Map(order.map((id, i) => [id, i]));
  return matchesClue(clue, positions);
}

function freshId(clues) {
  const used = new Set(clues.map(clue => clue.id));
  let n = 1;
  while (used.has('repair-preview-' + n)) n++;
  return 'repair-preview-' + n;
}

// Propose an add/remove only when rechecking the complete comparison proves
// that neither direction of unmatched-order difference increases.
export function suggestOneClueRepair(source, target, mapping) {
  const before = compareEpisodes(source, target, mapping);
  if (!before.valid || before.sameOrderSet) return null;

  const forward = new Map(before.mapping.map(pair => [pair.sourceId, pair.targetId]));
  const candidates = [];
  const extraTargetOrder = before.targetOnlyWitness?.targetOrder;
  if (extraTargetOrder) {
    for (const clue of source.clues) {
      const translated = {kind: clue.kind, left: forward.get(clue.left), right: forward.get(clue.right)};
      if (target.clues.some(c => c.kind === translated.kind && c.left === translated.left && c.right === translated.right)) continue;
      if (matchesOrder(translated, extraTargetOrder)) continue;
      candidates.push({operation: 'add', clue: {id: freshId(target.clues), ...translated}});
      if (candidates.length >= MAX_REPAIR_CHECKS) break;
    }
  }

  const missingSourceOrder = before.sourceOnlyWitness?.targetOrder;
  if (missingSourceOrder && candidates.length < MAX_REPAIR_CHECKS) {
    for (const clue of target.clues) {
      if (matchesOrder(clue, missingSourceOrder)) continue;
      candidates.push({operation: 'remove', clue: {...clue}});
      if (candidates.length >= MAX_REPAIR_CHECKS) break;
    }
  }

  let best = null;
  const oldTotal = before.sourceOnlyCount + before.targetOnlyCount;
  for (const candidate of candidates) {
    const changed = {
      ...target,
      clues: candidate.operation === 'add'
        ? [...target.clues, candidate.clue]
        : target.clues.filter(c => c.id !== candidate.clue.id)
    };
    const after = compareEpisodes(source, changed, mapping);
    if (!after.valid || after.sourceOnlyCount > before.sourceOnlyCount || after.targetOnlyCount > before.targetOnlyCount) continue;
    const total = after.sourceOnlyCount + after.targetOnlyCount;
    if (total >= oldTotal) continue;
    if (!best || total < best.afterTotal || (total === best.afterTotal && after.mechanicalPreserved && !best.mechanicalPreserved)) {
      best = {
        operation: candidate.operation, clue: candidate.clue,
        beforeTotal: oldTotal, afterTotal: total,
        sourceOnlyBefore: before.sourceOnlyCount, sourceOnlyAfter: after.sourceOnlyCount,
        targetOnlyBefore: before.targetOnlyCount, targetOnlyAfter: after.targetOnlyCount,
        mechanicalPreserved: after.mechanicalPreserved
      };
    }
    if (best?.afterTotal === 0 && best.mechanicalPreserved) break;
  }
  return best;
}
