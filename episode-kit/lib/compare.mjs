import { analyzeEpisode } from './engine.mjs';

export const COMPARISON_ENGINE_VERSION = '0.1.0';
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const key = value => JSON.stringify(value);
function summary(a) {
  return Object.fromEntries(['valid','outcome','permutationCount','clueOrderCount','actionMatchCount','uniqueReasoning','mechanicalSuccess'].map(k => [k,a[k]]));
}
export function compareEpisodes(source,target,mapping) {
  const a = analyzeEpisode(source), b = analyzeEpisode(target);
  const result = {
    schema:'ludolingua.comparison.v1',comparisonEngineVersion:COMPARISON_ENGINE_VERSION,
    valid:false,errors:[],mapping:[],sameOrderSet:false,mechanicalPreserved:false,
    source:summary(a),target:summary(b),sourceOnlyCount:0,targetOnlyCount:0,
    sourceOnlyWitness:null,targetOnlyWitness:null,roleChanges:[],
    clueChanges:{sourceOnly:[],targetOnly:[]},
    limitations:['Comparison covers encoded clue-consistent order sets under the declared role bijection and each episode’s extraction/action check.','Equal order sets do not establish equal discovery process, difficulty, linguistic meaning or cultural suitability. Human review remains unresolved.','No model inference or human playtest is evidenced by this comparison.']
  };
  result.errors.push(...a.errors.map(e => `Source: ${e}`),...b.errors.map(e => `Target: ${e}`));
  if (!a.valid || !b.valid) return result;
  const sourceIds = new Set(source.cards.map(c => c.id)), targetIds = new Set(target.cards.map(c => c.id));
  const pairs = mapping === undefined ? source.cards.map(c => ({sourceId:c.id,targetId:c.id})) : mapping;
  if (!Array.isArray(pairs)) { result.errors.push('Mapping must be an array of role pairs.'); return result; }
  const forward = new Map(), backward = new Map();
  if (pairs.length !== sourceIds.size || pairs.length !== targetIds.size) result.errors.push('Mapping must cover every source and target role exactly once.');
  for (const pair of pairs) {
    if (pair === null || typeof pair !== 'object' || Array.isArray(pair) || typeof pair.sourceId !== 'string' || typeof pair.targetId !== 'string' || !sourceIds.has(pair.sourceId) || !targetIds.has(pair.targetId)) {
      result.errors.push('Each mapping pair must reference an existing source and target role.'); continue;
    }
    if (forward.has(pair.sourceId) || backward.has(pair.targetId)) result.errors.push('Mapping must be bijective; duplicate role found.');
    forward.set(pair.sourceId,pair.targetId); backward.set(pair.targetId,pair.sourceId);
  }
  if (forward.size !== sourceIds.size || backward.size !== targetIds.size) result.errors.push('Mapping does not cover all roles.');
  if (result.errors.length) return result;
  result.valid = true;
  result.mapping = [...forward].sort(([a],[b]) => cmp(a,b)).map(([sourceId,targetId]) => ({sourceId,targetId}));
  const sourceOrders = new Map(a.solutions.map(s => [key(s.order),s.order]));
  const targetOrders = new Map(b.solutions.map(s => { const order = s.order.map(id => backward.get(id)); return [key(order),order]; }));
  const sourceOnly = [...sourceOrders.keys()].filter(k => !targetOrders.has(k)).sort(cmp);
  const targetOnly = [...targetOrders.keys()].filter(k => !sourceOrders.has(k)).sort(cmp);
  const witness = (keys,orders) => keys.length ? {sourceOrder:[...orders.get(keys[0])],targetOrder:orders.get(keys[0]).map(id => forward.get(id))} : null;
  result.sourceOnlyCount = sourceOnly.length; result.targetOnlyCount = targetOnly.length;
  result.sourceOnlyWitness = witness(sourceOnly,sourceOrders); result.targetOnlyWitness = witness(targetOnly,targetOrders);
  result.sameOrderSet = !sourceOnly.length && !targetOnly.length;
  result.mechanicalPreserved = a.mechanicalSuccess && b.mechanicalSuccess && sourceOrders.size > 0 && result.sameOrderSet;
  const sourceLabels = new Map(source.cards.map(c => [c.id,c.label])), targetLabels = new Map(target.cards.map(c => [c.id,c.label]));
  result.roleChanges = result.mapping.map(({sourceId,targetId}) => ({sourceId,targetId,sourceLabel:sourceLabels.get(sourceId),targetLabel:targetLabels.get(targetId),labelChanged:sourceLabels.get(sourceId) !== targetLabels.get(targetId)}));
  const relations = (episode,translate) => new Map(episode.clues.map(c => {
    const tuple = {kind:c.kind,left:translate(c.left),right:translate(c.right)};
    return [key([tuple.kind,tuple.left,tuple.right]),tuple];
  }));
  const left = relations(source,id=>id), right = relations(target,id=>backward.get(id));
  const difference = (x,y) => [...x.keys()].filter(k=>!y.has(k)).sort(cmp).map(k=>x.get(k));
  result.clueChanges = {sourceOnly:difference(left,right),targetOnly:difference(right,left)};
  return result;
}
