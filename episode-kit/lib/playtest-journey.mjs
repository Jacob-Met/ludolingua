import { replayPlaytest } from './playtest.mjs';
import { checkAttempt } from './engine.mjs';

// A read-only view of the *verified* recorded journey. No additional event or
// export schema, inferred human identity, or inferred language quality.
export function describePlaytestJourney(episode, events) {
  const verified = replayPlaytest(episode, events);
  if (!verified.valid) {
    throw new TypeError('Cannot inspect an invalid play record: ' + verified.errors.join('; '));
  }
  const ids = episode.cards.map(card => card.id);
  const initial = () => [ids[ids.length - 1], ...ids.slice(0, -1)];
  let order = initial(), visibleHintCount = 0, revealed = false;
  const journey = events.map((event, index) => {
    if (event.type === 'move') {
      const from = order.indexOf(event.cardId);
      const to = from + (event.direction === 'up' ? -1 : 1);
      [order[from], order[to]] = [order[to], order[from]];
      revealed = false;
    } else if (event.type === 'hint') {
      visibleHintCount++;
    } else if (event.type === 'reveal') {
      revealed = true;
    } else if (event.type === 'reset') {
      order = initial(); visibleHintCount = 0; revealed = false;
    }
    const attempt = event.type === 'attempt'
      ? checkAttempt(episode, order, event.answer) : null;
    return { index, order: order.slice(), visibleHintCount, revealed, attempt };
  });
  const final = verified.finalState;
  if (order.some((id, i) => final.order[i] !== id)
    || visibleHintCount !== final.visibleHintCount || revealed !== final.revealed) {
    throw new Error('Journey display disagrees with the verified replay.');
  }
  return journey;
}
