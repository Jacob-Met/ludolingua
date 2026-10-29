import { searchAdaptations, MAX_ASSIGNMENTS, MAX_LABELS_PER_ROLE } from '../lib/adaptation.mjs';

export function setupAdaptation({ getEpisode, getRevisionToken, applyCandidate, notice, t, diagnostic = value => value }) {
  const $ = id => document.getElementById(id);
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  let identity = '', inputs = new Map(), budgetText = '0', result = null, checkpoint = null, shown = 20, applying = false;
  const tr = (key, values = {}) => t(key, values);
  function invalidate() { result = null; checkpoint = null; shown = 20; renderResults(); }
  function renderRows() {
    const episode = getEpisode();
    $('adaptation-options').replaceChildren(...episode.cards.map((card, index) => {
      const row = node('div', undefined, 'adaptation-role'); row.dataset.cardId = card.id;
      const heading = node('h4', `${card.label} (${card.id})`); heading.lang = episode.locale;
      const help = node('p', tr('Current label is included automatically: {label}', { label: card.label }), 'small');
      const label = node('label', tr('Additional choices · one label per line')); label.htmlFor = `adaptation-labels-${index}`;
      const area = node('textarea'); area.id = label.htmlFor; area.rows = 3; area.value = inputs.get(card.id).text; area.lang = episode.locale;
      area.addEventListener('input', () => { inputs.get(card.id).text = area.value; invalidate(); });
      const lockLabel = node('label', undefined, 'toggle'), lock = node('input'); lock.type = 'checkbox'; lock.checked = episode.constraints.labelsFrozen || inputs.get(card.id).locked; lock.disabled = episode.constraints.labelsFrozen;
      lock.addEventListener('change', () => { inputs.get(card.id).locked = lock.checked; invalidate(); });
      lockLabel.append(lock, node('span', tr('Keep this role’s current label')));
      row.append(heading, help, label, area, lockLabel);
      if (episode.constraints.labelsFrozen) row.append(node('p', tr('Episode labels are frozen. Unfreeze them explicitly before applying changed labels.'), 'small'));
      return row;
    }));
    $('adaptation-budget').max = String(episode.cards.length); $('adaptation-budget').value = budgetText;
  }
  function renderResults() {
    const root = $('adaptation-results'); root.replaceChildren();
    if (!result) { root.append(node('p', tr('Supply choices, then search this revision. Previous candidates do not approve new edits.'))); return; }
    const headings = {
      feasible: 'Mechanical candidates found within your supplied choices',
      infeasible: 'No candidate satisfies these supplied choices, locks and budget',
      ambiguous: 'The clues must determine one order before this search',
      limit: 'This candidate space exceeds the bounded search limit',
      invalid: 'Check the episode and candidate inputs'
    };
    root.append(node('h4', tr(headings[result.outcome])), node('p', tr('Assignments: {total} · examined: {examined} · within budget: {eligible}', {
      total: result.assignmentCount, examined: result.evaluatedCount, eligible: result.budgetEligibleCount
    }), 'small'));
    root.append(node('p', result.complete ? tr('Complete only for the supplied vocabulary, locks and budget.') : tr('Search incomplete or unsupported; no general impossibility claim.'), 'small'));
    if (result.valid && result.sourceClueOrderCount === 0) root.append(node('p', tr('The encoded clues admit no order. Repair the clues before searching vocabulary.'), 'small'));
    for (const error of result.errors) root.append(node('p', diagnostic(error), 'small'));
    if (result.outcome === 'limit') root.append(node('p', tr('Reduce choices or lock roles: at most {count} assignments after locks.', { count: MAX_ASSIGNMENTS })));
    if (result.alternatives.length) {
      root.append(node('p', tr('{count} candidates; minimum changed labels: {cost}. Cost counts changed strings, not semantic distance or quality.', { count: result.alternatives.length, cost: result.minimumChangedLabelCount })));
      for (const candidate of result.alternatives.slice(0, shown)) {
        const article = node('article', undefined, 'adaptation-candidate');
        article.append(node('h4', tr('{count} changed labels · token {token}', { count: candidate.changedLabelCount, token: candidate.token })));
        const list = node('ul');
        for (const { cardId, label } of candidate.labels) {
          const old = checkpoint.episode.cards.find(c => c.id === cardId).label;
          const item = node('li', `${cardId}: ${old} → ${label}`); item.lang = checkpoint.episode.locale; list.append(item);
        }
        const choose = node('button', tr('Use these labels as a fresh revision'), 'secondary'); choose.type = 'button'; choose.disabled = applying || (checkpoint.episode.constraints.labelsFrozen && candidate.changedLabelCount > 0);
        if (choose.disabled && checkpoint.episode.constraints.labelsFrozen) article.append(node('p', tr('Episode labels are frozen. Unfreeze them explicitly before applying changed labels.'), 'small'));
        choose.addEventListener('click', () => {
          if (applying) return;
          if (!checkpoint || checkpoint.token !== getRevisionToken() || checkpoint.source !== JSON.stringify(getEpisode())) {
            invalidate(); notice('The episode changed. Search its current revision again.', true); return;
          }
          if (getEpisode().constraints.labelsFrozen && candidate.changedLabelCount > 0) { notice('Episode labels are frozen. Unfreeze them explicitly before applying changed labels.', true); return; }
          const chosen = structuredClone(candidate); applying = true;
          try {
            // Parent owns the sole mutation, revision increment, draft update and check invalidation.
            applyCandidate(chosen);
            invalidate();
          } catch (error) { invalidate(); notice(error.message, true); }
          finally { applying = false; }
        });
        article.append(list, choose); root.append(article);
      }
      if (shown < result.alternatives.length) {
        const more = node('button', tr('Show next 20 candidates'), 'text-button'); more.type = 'button';
        more.addEventListener('click', () => { shown += 20; renderResults(); }); root.append(more);
      }
    }
    root.append(node('p', tr('These are mechanical alternatives, not translations or language-quality recommendations. Review story, meanings and hints; compare and playtest the chosen revision.'), 'small'));
  }
  function refreshEpisode() {
    const episode = getEpisode(), next = JSON.stringify([episode.id, episode.cards.map(c => c.id)]);
    if (identity !== next) { identity = next; inputs = new Map(episode.cards.map(c => [c.id, { text: '', locked: false }])); budgetText = String(episode.cards.length); }
    invalidate(); renderRows();
  }
  function relocalize() {
    for (const n of $('adaptation-section').querySelectorAll('[data-adaptation-i18n]')) n.textContent = tr(n.dataset.adaptationI18n);
    $('adaptation-limits').textContent = tr('At most {labels} distinct labels per role, including its current label; {assignments} assignments after locks.', { labels: MAX_LABELS_PER_ROLE, assignments: MAX_ASSIGNMENTS });
    renderRows(); renderResults();
  }
  $('adaptation-budget').addEventListener('input', () => { budgetText = $('adaptation-budget').value; invalidate(); });
  $('adaptation-search').addEventListener('click', () => {
    const episode = structuredClone(getEpisode());
    const budget = Number(budgetText);
    if (budgetText.trim() === '' || !Number.isInteger(budget) || budget < 0 || budget > episode.cards.length) {
      invalidate(); notice('Enter a whole-number edit budget within the role count.', true); return;
    }
    const domains = episode.cards.map(card => ({ cardId: card.id,
      labels: [...new Set([card.label, ...inputs.get(card.id).text.split(/\r?\n/).filter(line => line.trim() !== '')])]
    }));
    checkpoint = { episode, token: getRevisionToken(), source: JSON.stringify(episode) }; shown = 20;
    result = searchAdaptations(episode, { domains, lockedCardIds: episode.cards.filter(c => inputs.get(c.id).locked).map(c => c.id), maxChangedLabels: budget });
    renderResults();
  });
  refreshEpisode(); relocalize();
  return { refreshEpisode, relocalize };
}
