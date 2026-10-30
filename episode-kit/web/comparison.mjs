import { EPISODES } from '../fixtures/episodes.mjs';
import { clueText } from '../lib/engine.mjs';
import { compareEpisodes } from '../lib/compare.mjs';
import { createComparisonExport, readComparisonExport } from '../lib/comparison-export.mjs';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

export function setupComparison({ getEpisode, selectEpisode, rememberImportedEpisode, beginIntent, getIntent, notice, showAuthor, maxBytes, t, diagnostic }) {
  let source = clone(EPISODES[0]), customSource = null, mapping = [], epoch = 0, checked = null, comparison = null, importSequence = 0;
  let digestKey = '', customSourceKey = '';
  function renderDigest() { $('comparison-digest').textContent = checked && digestKey ? t(digestKey, { hash: checked.validation.bindingSha256 }) : ''; }
  const defaultMapping = () => source.cards.map(card => ({ sourceId: card.id, targetId: getEpisode()?.cards.some(c => c.id === card.id) ? card.id : '' }));
  function invalidate() {
    epoch += 1; checked = null; comparison = null;
    $('comparison-export-button').disabled = true;
    digestKey = ''; renderDigest();
    renderResult();
  }
  function preview(root, episode, label) {
    root.replaceChildren(node('p', t(label), 'eyebrow'), Object.assign(node('h4', episode.title), { lang: episode.locale }), node('p', t('{locale} · revision {revision}', { locale: episode.locale.toUpperCase(), revision: episode.revision }), 'small'));
    const words = node('p', episode.cards.map(c => c.label).join(' / '), 'comparison-words');
    words.lang = episode.locale; root.append(words);
    const list = node('ol', undefined, 'clues'); list.lang = episode.locale;
    try { list.append(...episode.clues.map(c => node('li', clueText(episode, c)))); }
    catch { list.removeAttribute('lang'); list.append(node('li', t('Complete the episode data to view its clues.'))); }
    root.append(list, node('p', t('Required action: {action}', { action: episode.action.expected }), 'small'));
  }
  function renderPair() {
    const target = getEpisode(); if (!target) return;
    preview($('source-summary'), source, 'SOURCE'); preview($('target-summary'), target, 'CURRENT ADAPTATION');
    $('mapping-editor').replaceChildren(...source.cards.map((card, index) => {
      const row = node('div', undefined, 'mapping-row'); row.dataset.sourceId = card.id;
      const label = node('label'); label.htmlFor = `mapping-${index}`;
      label.append(Object.assign(node('span', card.label), { lang: source.locale }), node('small', t('Source role: {id}', { id: card.id })));
      const select = node('select'); select.id = `mapping-${index}`;
      select.setAttribute('aria-label', t('Adaptation role for {label}', { label: card.label }));
      const empty = node('option', t('Choose a matching role')); empty.value = ''; select.append(empty);
      for (const c of target.cards) { const option = node('option', `${c.label} (${c.id})`); option.value = c.id; option.lang = target.locale; select.append(option); }
      select.value = mapping.find(p => p.sourceId === card.id)?.targetId ?? '';
      select.addEventListener('change', () => {
        const pair = mapping.find(p => p.sourceId === card.id);
        if (pair) pair.targetId = select.value; else mapping.push({ sourceId: card.id, targetId: select.value });
        invalidate(); notice('The role mapping changed. Compare these revisions again.');
      });
      row.append(label, node('span', '→', 'mapping-arrow'), select); return row;
    }));
  }
  function orderText(ep, ids) { return ids.map(id => ep.cards.find(c => c.id === id)?.label ?? id).join(' → '); }
  function renderResult() {
    const root = $('comparison-result'); const changesOpen = root.querySelector('details')?.open ?? false; root.replaceChildren();
    const heading = node('h4', t('Ready for a fresh comparison')); heading.id = 'comparison-status'; heading.dataset.preserved = 'unchecked'; root.append(heading);
    root.className = 'comparison-result';
    if (!comparison) { root.append(node('p', t('Any source, adaptation, or role-mapping edit requires a new comparison.'))); return; }
    heading.dataset.preserved = String(comparison.mechanicalPreserved);
    if (!comparison.valid) { heading.textContent = t('Complete valid episodes and a one-to-one role map'); root.append(...comparison.errors.map(e => node('p', diagnostic(e)))); root.classList.add('comparison-negative'); return; }
    heading.textContent = t(comparison.mechanicalPreserved ? 'The encoded structure and both actions hold' : comparison.sameOrderSet ? 'Same allowed orders. An episode still fails its mechanics.' : 'The allowed orders have changed');
    root.classList.add(comparison.mechanicalPreserved ? 'comparison-positive' : 'comparison-negative');
    root.append(node('p', t(comparison.sameOrderSet ? 'Every clue-consistent source order has a matching adaptation order, and vice versa.' : 'An order is allowed by one version and excluded by the other. The hidden answer was not used to filter these orders.')));
    const metrics = node('div', undefined, 'metrics comparison-metrics');
    for (const [value, label, key] of [[comparison.source.clueOrderCount, 'Source orders', 'source-orders'], [comparison.target.clueOrderCount, 'Adaptation orders', 'target-orders'], [comparison.sourceOnlyCount, 'Source only', 'source-only'], [comparison.targetOnlyCount, 'Adaptation only', 'target-only']]) {
      const metric = node('div', undefined, 'metric'); const number = node('strong', String(value)); number.dataset.metric = key; metric.append(number, node('span', t(label))); metrics.append(metric);
    }
    root.append(metrics);
    root.append(node('p', t('Source action: {sourceMatches} of {sourceOrders} orders match; {sourceOutcome}. Adaptation action: {targetMatches} of {targetOrders} orders match; {targetOutcome}.', { sourceMatches: comparison.source.actionMatchCount, sourceOrders: comparison.source.clueOrderCount, sourceOutcome: t(comparison.source.outcome), targetMatches: comparison.target.actionMatchCount, targetOrders: comparison.target.clueOrderCount, targetOutcome: t(comparison.target.outcome) }), 'comparison-actions'));
    for (const [witness, label] of [[comparison.sourceOnlyWitness, 'Allowed only by the source'], [comparison.targetOnlyWitness, 'Allowed only by the adaptation']]) {
      if (!witness) continue;
      const box = node('div', undefined, 'witness'); box.append(node('h4', t(label)), node('p', t('Source roles: {order}', { order: orderText(source, witness.sourceOrder) })), node('p', t('Mapped adaptation: {order}', { order: orderText(getEpisode(), witness.targetOrder) }))); root.append(box);
    }
    const changes = node('details', undefined, 'comparison-changes'); changes.open = changesOpen; changes.append(node('summary', t('Inspect changed labels and encoded clues')));
    const list = node('ul');
    for (const role of comparison.roleChanges.filter(r => r.labelChanged)) list.append(node('li', t('{sourceLabel} → {targetLabel} (role {sourceId})', role)));
    const relation = clue => `${clue.left} ${t(({ before: 'comes before', immediately_before: 'comes immediately before', after: 'comes after' })[clue.kind])} ${clue.right}`;
    for (const clue of comparison.clueChanges.sourceOnly) list.append(node('li', t('Source only: {relation}', { relation: relation(clue) })));
    for (const clue of comparison.clueChanges.targetOnly) list.append(node('li', t('Adaptation only: {relation}', { relation: relation(clue) })));
    if (!list.children.length) list.append(node('li', t('No label or typed-relation changes under this mapping.')));
    changes.append(list, node('p', t('Relations are shown in source role IDs. Syntactic differences can still describe the same order set. Label changes do not prove equivalent meaning.'), 'small')); root.append(changes);
  }
  function sourceOption(label) {
    customSource = clone(source); customSourceKey = label;
    $('source-select').querySelector('option[value="custom-source"]')?.remove();
    const option = node('option', t(label)); option.value = 'custom-source'; $('source-select').append(option); $('source-select').value = 'custom-source';
  }
  function refreshTarget(reset = false) {
    if (reset || !mapping.length) mapping = defaultMapping();
    invalidate(); renderPair();
  }
  for (const ep of EPISODES) { const option = node('option', `${ep.locale.toUpperCase()} · ${ep.title} · ${ep.id}`); option.lang = ep.locale; option.value = ep.id; $('source-select').append(option); }
  $('source-select').addEventListener('change', () => {
    const next = $('source-select').value === 'custom-source' ? customSource : EPISODES.find(ep => ep.id === $('source-select').value); if (!next) return;
    source = clone(next); mapping = defaultMapping(); invalidate(); renderPair(); notice('The source changed. Compare the current pair again.');
  });
  $('use-current-as-source').addEventListener('click', () => {
    source = clone(getEpisode()); sourceOption('Captured source · current revision'); mapping = defaultMapping(); invalidate(); renderPair();
    notice('This revision is now the source. Choose or edit an adaptation to compare with it.');
  });
  $('compare-button').addEventListener('click', async () => {
    const token = epoch, currentSource = clone(source), currentTarget = clone(getEpisode()), currentMapping = clone(mapping);
    checked = null; $('comparison-export-button').disabled = true; digestKey = ''; renderDigest();
    comparison = compareEpisodes(currentSource, currentTarget, currentMapping); renderResult();
    if (!comparison.valid) { notice('The comparison needs valid episodes and a complete one-to-one role map.', true); return; }
    try {
      const bundle = await createComparisonExport(currentSource, currentTarget, currentMapping);
      if (token !== epoch) return;
      checked = bundle; comparison = bundle.validation.result; renderResult(); $('comparison-export-button').disabled = false;
      digestKey = 'Checked pair · SHA-256 {hash}'; renderDigest();
      notice('Both complete revisions and their role map are bound to this comparison. Human meaning and difficulty remain unverified.');
    } catch (error) { if (token === epoch) notice(error.message, true); }
  });
  $('comparison-export-button').addEventListener('click', () => {
    try {
      if (!checked) throw new Error('Compare the current revisions before exporting.');
      const blob = new Blob([JSON.stringify(checked, null, 2) + '\n'], { type: 'application/json' });
      if (blob.size > maxBytes) throw new Error('The comparison export exceeds the 20 MB receiver limit.');
      const url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = `ludolingua-comparison-${checked.source.revision}-${checked.target.revision}.json`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Exported the source, adaptation, role map and checked comparison.');
    } catch (error) { notice(error.message, true); }
  });
  $('comparison-import-button').addEventListener('click', () => $('comparison-import-file').click());
  $('comparison-import-file').addEventListener('change', async () => {
    const file = $('comparison-import-file').files[0]; if (!file) return;
    const token = epoch, sequence = ++importSequence, intent = beginIntent();
    try {
      if (file.size > maxBytes) throw new Error('The comparison export exceeds the 20 MB receiver limit.');
      const received = await readComparisonExport(await file.text());
      const bundle = await createComparisonExport(received.source, received.target, received.mapping === null ? undefined : received.mapping);
      if (sequence !== importSequence || intent !== getIntent()) return;
      if (token !== epoch) throw new Error('The source, adaptation or role map changed while this file was being verified. Reopen it again to replace the pair.');
      source = clone(received.source); selectEpisode(received.target);
      rememberImportedEpisode(received.target, 'Reopened · comparison adaptation');
      mapping = clone(bundle.validation.result.mapping); sourceOption('Reopened · comparison source'); renderPair();
      checked = bundle; comparison = bundle.validation.result; renderResult(); $('comparison-export-button').disabled = false;
      digestKey = 'Reopened pair · SHA-256 {hash}'; renderDigest();
      showAuthor(); notice('Reopened both revisions. Complete source, adaptation, role map and mechanical comparison verified.');
    } catch (error) { if (sequence === importSequence && intent === getIntent()) notice('Cannot reopen comparison: {message}', true, { message: error.message }); }
    finally { if (sequence === importSequence) $('comparison-import-file').value = ''; }
  });
  function relocalize() {
    renderPair(); renderResult(); renderDigest();
    const option = $('source-select').querySelector('option[value="custom-source"]');
    if (option && customSourceKey) option.textContent = t(customSourceKey);
  }
  function adoptAdaptation(original, target, hintText) {
    source = clone(original); sourceOption('Original · captured before adaptation');
    selectEpisode(target, hintText); rememberImportedEpisode(target, 'New · authored adaptation');
    mapping = defaultMapping(); invalidate(); renderPair();
  }
  return { refreshTarget, invalidate, relocalize, getEpoch: () => epoch, adoptAdaptation };
}
