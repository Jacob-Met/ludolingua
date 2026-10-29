import { validateEpisode, analyzeEpisode, extractToken } from './engine.mjs';

export const ADAPTATION_ENGINE_VERSION = '0.1.0';
export const MAX_ASSIGNMENTS = 4096;
export const MAX_LABELS_PER_ROLE = 16;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exactKeys = (x,keys) => object(x) && Object.keys(x).length === keys.length && keys.every(k=>Object.hasOwn(x,k));
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;

export function searchAdaptations(episode,request) {
  const result = {
    schema:'ludolingua.adaptation-search.v1',adaptationEngineVersion:ADAPTATION_ENGINE_VERSION,
    valid:false,errors:[],outcome:'invalid',complete:false,sourceClueOrderCount:0,
    assignmentCount:0,evaluatedCount:0,budgetEligibleCount:0,minimumChangedLabelCount:null,alternatives:[],
    limitations:[
      'Results cover only supplied vocabulary, locked labels and the exact-string replacement budget; infeasible does not mean the language cannot preserve this puzzle.',
      'Only episodes with exactly one clue-consistent order are supported. Expected actions never select an order from ambiguous clues.',
      'At most 16 labels per role and 4096 assignments after locks; above the bound no search or partial success is reported.',
      'Replacing fewer strings does not establish preserved meaning, translation quality, difficulty or cultural suitability. No model inference or human playtest is evidenced.',
      'Extraction retains the engine’s trimmed NFC first-code-point uppercase semantics, including accents and uppercase expansion.'
    ]
  };
  const validation = validateEpisode(episode);
  if (!validation.valid) result.errors.push(...validation.errors.map(e=>`Episode: ${e}`));
  if (!exactKeys(request,['domains','lockedCardIds','maxChangedLabels'])) result.errors.push('Request must contain exactly domains, lockedCardIds and maxChangedLabels.');
  if (result.errors.length) return result;
  const ids = new Set(episode.cards.map(c=>c.id)), domains = new Map();
  if (!Array.isArray(request.domains) || request.domains.length !== ids.size) result.errors.push('Supply exactly one domain for every card role.');
  for (const domain of Array.isArray(request.domains) ? request.domains : []) {
    if (!exactKeys(domain,['cardId','labels']) || typeof domain.cardId !== 'string' || !ids.has(domain.cardId) || domains.has(domain.cardId)) {
      result.errors.push('Each domain must have exactly cardId and labels and refer to a distinct existing role.'); continue;
    }
    if (!Array.isArray(domain.labels) || domain.labels.length < 1 || domain.labels.length > MAX_LABELS_PER_ROLE) {
      result.errors.push('Each role needs 1..16 candidate labels.'); continue;
    }
    if (new Set(domain.labels).size !== domain.labels.length) result.errors.push('Candidate labels must be distinct exact strings within each role.');
    if (!domain.labels.every(label=>typeof label === 'string' && /^\p{L}/u.test(label.trim().normalize('NFC')))) result.errors.push('Candidate labels must start with a Unicode letter after trimming and NFC normalization.');
    domains.set(domain.cardId,[...domain.labels]);
  }
  if (domains.size !== ids.size) result.errors.push('Domains do not cover every role.');
  if (!Array.isArray(request.lockedCardIds) || !request.lockedCardIds.every(id=>typeof id === 'string' && ids.has(id)) || new Set(request.lockedCardIds).size !== request.lockedCardIds.length) result.errors.push('lockedCardIds must contain distinct existing role IDs.');
  if (!Number.isSafeInteger(request.maxChangedLabels) || request.maxChangedLabels < 0 || request.maxChangedLabels > ids.size) result.errors.push('maxChangedLabels must be an integer from zero to the card count.');
  if (result.errors.length) return result;
  result.valid = true;
  const analysis = analyzeEpisode(episode); result.sourceClueOrderCount = analysis.clueOrderCount;
  if (analysis.clueOrderCount > 1) { result.outcome = 'ambiguous'; return result; }
  if (analysis.clueOrderCount === 0) { result.outcome = 'infeasible'; result.complete = true; return result; }
  const locks = new Set(episode.constraints.labelsFrozen ? [...ids] : request.lockedCardIds);
  const cards = episode.cards.map(c=>({id:c.id,label:c.label})).sort((a,b)=>cmp(a.id,b.id));
  const menus = cards.map(card => locks.has(card.id) ? domains.get(card.id).includes(card.label) ? [card.label] : [] : [...domains.get(card.id)].sort(cmp));
  result.assignmentCount = menus.reduce((count,labels)=>count*labels.length,1);
  if (result.assignmentCount === 0) { result.outcome = 'infeasible'; result.complete = true; return result; }
  if (result.assignmentCount > MAX_ASSIGNMENTS) { result.outcome = 'limit'; return result; }
  const target = episode.action.expected.trim().normalize('NFC').toUpperCase();
  const selected = [];
  function visit(index,changed) {
    if (index < cards.length) {
      for (const label of menus[index]) { selected.push({cardId:cards[index].id,label}); visit(index+1,changed+Number(label !== cards[index].label)); selected.pop(); }
      return;
    }
    result.evaluatedCount++;
    if (changed > request.maxChangedLabels) return;
    result.budgetEligibleCount++;
    const labels = new Map(selected.map(x=>[x.cardId,x.label]));
    const candidate = {...episode,cards:episode.cards.map(card=>({...card,label:labels.get(card.id)}))};
    const token = extractToken(candidate,analysis.solutions[0].order);
    if (token === target) result.alternatives.push({labels:selected.map(x=>({...x})),changedLabelCount:changed,token});
  }
  visit(0,0);
  result.alternatives.sort((a,b)=>a.changedLabelCount-b.changedLabelCount || cmp(JSON.stringify(a.labels),JSON.stringify(b.labels)));
  result.minimumChangedLabelCount = result.alternatives.length ? result.alternatives[0].changedLabelCount : null;
  result.outcome = result.alternatives.length ? 'feasible' : 'infeasible'; result.complete = true;
  return result;
}
