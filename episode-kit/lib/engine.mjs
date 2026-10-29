export const ENGINE_VERSION = '0.1.0';
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const norm = x => x.trim().normalize('NFC').toUpperCase();
const initial = x => [...x.trim().normalize('NFC')][0].toUpperCase();
export function validateEpisode(e) {
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  if (!obj(e)) return {valid:false,errors:['Episode must be an object.']};
  need(e.schema === 'ludolingua.episode.v1','Unsupported episode schema.');
  for (const k of ['id','title','story']) need(text(e[k]),`${k} must be nonempty text.`);
  need(Number.isSafeInteger(e.revision) && e.revision > 0,'revision must be a positive safe integer.');
  need(['en','es'].includes(e.locale),'locale must be en or es.');
  const cards = Array.isArray(e.cards) ? e.cards : [];
  need(Array.isArray(e.cards) && cards.length >= 2 && cards.length <= 8,'cards must contain 2..8 cards.');
  const ids = new Set();
  for (const c of cards) {
    if (!obj(c)) { errors.push('Each card must be an object.'); continue; }
    need(text(c.id) && !ids.has(c.id),'Card IDs must be nonempty and distinct.'); ids.add(c.id);
    need(text(c.label) && /^\p{L}/u.test(c.label.trim().normalize('NFC')),'Labels must start with a Unicode letter.');
  }
  need(Array.isArray(e.clues),'clues must be an array.');
  const clueIds = new Set();
  for (const c of Array.isArray(e.clues) ? e.clues : []) {
    if (!obj(c)) { errors.push('Each clue must be an object.'); continue; }
    need(text(c.id) && !clueIds.has(c.id),'Clue IDs must be nonempty and distinct.'); clueIds.add(c.id);
    need(['before','after','immediately_before'].includes(c.kind),'Unsupported clue kind.');
    need(typeof c.left === 'string' && typeof c.right === 'string' && c.left !== c.right && ids.has(c.left) && ids.has(c.right),'Clues must reference distinct existing card IDs.');
  }
  need(obj(e.extraction) && e.extraction.kind === 'first_letter' && e.extraction.normalization === 'NFC-uppercase','Unsupported extraction.');
  need(obj(e.action) && text(e.action.expected) && e.action.answerNormalization === 'NFC-trim-uppercase','Unsupported action.');
  need(obj(e.constraints) && typeof e.constraints.labelsFrozen === 'boolean' && typeof e.constraints.requireUnique === 'boolean','constraints must declare both booleans.');
  need(Array.isArray(e.hints) && e.hints.every(x => typeof x === 'string'),'hints must be strings.');
  const p = e.provenance;
  need(obj(p) && p.kind === 'authored' && text(p.source) && p.modelRun === null && p.humanPlaytest === null && Array.isArray(p.semanticChanges) && p.semanticChanges.every(x => typeof x === 'string'),'Unsupported authored provenance.');
  return {valid:errors.length === 0,errors};
}
function fullOrder(e, order) {
  return Array.isArray(order) && order.length === e.cards.length && new Set(order).size === order.length && order.every(id => e.cards.some(c => c.id === id));
}
function token(e, order) { const cards = new Map(e.cards.map(c => [c.id,c.label])); return order.map(id => initial(cards.get(id))).join(''); }
export function matchesClue(clue, positions) {
  return clue.kind === 'before'
    ? positions.get(clue.left) < positions.get(clue.right)
    : clue.kind === 'after'
      ? positions.get(clue.left) > positions.get(clue.right)
      : positions.get(clue.left) + 1 === positions.get(clue.right);
}
function satisfies(e, order) {
  const positions = new Map(order.map((id, index) => [id, index]));
  return e.clues.every(clue => matchesClue(clue, positions));
}
export function extractToken(e, order) {
  if (!validateEpisode(e).valid || !fullOrder(e,order)) throw new Error('Expected a valid episode and full card permutation.');
  return token(e,order);
}
export function displayCardLabel(e, card) {
  if (!obj(e) || !Array.isArray(e.cards) || !obj(card) || typeof card.label !== 'string') return '';
  const visible = value => value.trim().normalize('NFC').replace(/\s+/gu, ' ');
  if (!visible(card.label) || typeof card.id !== 'string') return card.label;
  const preferred = value => {
    if (!obj(value) || typeof value.label !== 'string') return '';
    const matches = e.cards.filter(other => obj(other) && typeof other.label === 'string' && visible(other.label) === visible(value.label));
    return matches.length > 1 ? `${value.label.trim()} (${value.id})` : value.label;
  };
  const index = e.cards.findIndex(other => obj(other) && other.id === card.id);
  if (index < 0) return preferred(card);
  const labels = e.cards.map(preferred);
  const normalized = labels.map(visible);
  const reserved = new Set(normalized);
  const assigned = new Set();
  // Reserve every authored/preferred name before adding display-only identities.
  // Stable array positions keep these identities unchanged as players move cards.
  // A suffix retains the authored first letter used by the puzzle's extraction.
  const displayed = labels.map((label, i) => {
    let result = label;
    if (normalized.some((value, j) => j !== i && value === normalized[i])) {
      const suffix = ` [${i + 1}]`;
      result += suffix;
      while (reserved.has(visible(result)) || assigned.has(visible(result))) result += suffix;
    }
    assigned.add(visible(result));
    return result;
  });
  return displayed[index];
}
export function clueText(e,c) {
  if (!validateEpisode(e).valid || !obj(c) || !['before','after','immediately_before'].includes(c.kind) || c.left === c.right) throw new Error('Invalid clue.');
  const left = e.cards.find(x => x.id === c.left), right = e.cards.find(x => x.id === c.right);
  if (!left || !right) throw new Error('Unknown clue card.');
  const relations = e.locale === 'es' ? {before:'va antes de',after:'va después de',immediately_before:'va inmediatamente antes de'} : {before:'comes before',after:'comes after',immediately_before:'comes immediately before'};
  return `${displayCardLabel(e,left)} ${relations[c.kind]} ${displayCardLabel(e,right)}.`;
}
export function checkAttempt(e,order,answer) {
  const fail = {orderValid:false,cluesSatisfied:false,token:'',tokenMatches:false,answerMatches:false,success:false};
  if (!validateEpisode(e).valid || !fullOrder(e,order) || typeof answer !== 'string') return fail;
  const t = token(e,order), cluesSatisfied = satisfies(e,order), tokenMatches = t === norm(e.action.expected), answerMatches = norm(answer) === norm(e.action.expected);
  return {orderValid:true,cluesSatisfied,token:t,tokenMatches,answerMatches,success:cluesSatisfied && answerMatches && tokenMatches};
}
export function analyzeEpisode(e) {
  const validation = validateEpisode(e);
  const result = {schema:'ludolingua.analysis.v1',engineVersion:ENGINE_VERSION,...validation,permutationCount:0,clueOrderCount:0,actionMatchCount:0,uniqueReasoning:false,mechanicalSuccess:false,outcome:'invalid',solutions:[],frozenWitness:null,limitations:['Checks cover encoded ordering and extraction only; native-language clarity, cultural suitability and comparable discovery require human playtests.','No model inference is evidenced.','Extraction uses the first Unicode code point after trim and NFC, then locale-independent uppercase; uppercase may expand to multiple code points.']};
  if (!validation.valid) return result;
  const target = norm(e.action.expected);
  function visit(prefix,remaining) {
    if (!remaining.length) {
      result.permutationCount++;
      if (satisfies(e,prefix)) { const t = token(e,prefix), actionMatches = t === target; result.solutions.push({order:prefix,token:t,actionMatches}); result.clueOrderCount++; if(actionMatches) result.actionMatchCount++; }
      return;
    }
    remaining.forEach((id,i) => visit([...prefix,id],[...remaining.slice(0,i),...remaining.slice(i+1)]));
  }
  visit([],e.cards.map(c => c.id));
  const C = result.clueOrderCount, A = result.actionMatchCount;
  result.uniqueReasoning = C === 1;
  result.mechanicalSuccess = e.constraints.requireUnique ? C === 1 && A === 1 : C > 0 && A === C;
  result.outcome = C === 0 ? 'inconsistent' : e.constraints.requireUnique && C > 1 ? 'ambiguous' : result.mechanicalSuccess ? 'verified' : 'action-mismatch';
  const available = e.cards.map(c => initial(c.label));
  if (e.constraints.labelsFrozen && available.every(x => [...x].length === 1)) {
    const required = [...target], rest = [...available], missing = [];
    for (const x of required) { const i = rest.indexOf(x); if (i < 0) missing.push(x); else rest.splice(i,1); }
    if (missing.length || rest.length) result.frozenWitness = {available,required,missing,scope:'All permutations of these frozen labels under first-code-point NFC-uppercase extraction; multiset mismatch proves the target impossible, independently of clues.'};
  }
  return result;
}
