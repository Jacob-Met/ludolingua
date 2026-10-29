import { SIGNAL_PANEL_EPISODES } from './signal-panel.mjs';

const clues = [
  {id:'pair',kind:'immediately_before',left:'bell',right:'moon'},
  {id:'lead',kind:'before',left:'key',right:'bell'},
  {id:'tail',kind:'after',left:'star',right:'moon'}
];
function episode(id,locale,labels,expected,{frozen=false,relations=clues,changes=[]}={}) {
  return {
    schema:'ludolingua.episode.v1',id,revision:1,locale,
    title:locale === 'es' ? 'El archivo de las cuatro tarjetas' : 'The Four-Card Archive',
    story:locale === 'es' ? 'La puerta del archivo tiene cuatro ranuras. Ordena las tarjetas según las pistas. Lee sus iniciales de izquierda a derecha y escribe la acción para abrir la puerta.' : 'The archive door has four slots. Arrange the cards using the clues. Read their initials from left to right and enter the action that opens the door.',
    cards:['key','bell','moon','star'].map((id,i)=>({id,label:labels[i]})),
    clues:relations.map(c=>({...c})),
    extraction:{kind:'first_letter',normalization:'NFC-uppercase'},
    action:{expected,answerNormalization:'NFC-trim-uppercase'},
    constraints:{labelsFrozen:frozen,requireUnique:true},
    hints:locale === 'es' ? ['Busca las dos tarjetas que deben ir juntas.','Coloca la tarjeta anterior al par y la posterior al par.','Lee la primera letra de cada tarjeta en el orden obtenido.'] : ['Find the two cards that must stay together.','Place the card before the pair and the card after the pair.','Read the first letter of each card in the resulting order.'],
    provenance:{kind:'authored',source:'Original isolated LUDOLINGUA episode contribution for integration with hamon-a19-20261027; no external puzzle assets.',modelRun:null,humanPlaytest:null,semanticChanges:changes}
  };
}
export const EPISODES = [
  episode('en-original','en',['Otter','Pine','Eagle','Nest'],'OPEN'),
  episode('es-literal','es',['Nutria','Pino','Águila','Nido'],'ABRE',{changes:['Literal label translations preserve referents but yield NPÁN, not the localized action ABRE. Accents are retained.']}),
  episode('es-adapted','es',['Agua','Barco','Roca','Estrella'],'ABRE',{changes:['All four card referents change: Otter→Agua, Pine→Barco, Eagle→Roca, Nest→Estrella. This is a coordinated adaptation, not a literal translation.','Stable card roles and ordering relations are preserved; extraction produces the localized action ABRE. Clarity and comparable difficulty remain untested.']}),
  episode('es-frozen','es',['Nutria','Pino','Águila','Nido'],'ABRE',{frozen:true,changes:['Literal labels are frozen. Their initial-letter multiset cannot produce ABRE under any permutation.']}),
  episode('en-ambiguous','en',['Otter','Pine','Eagle','Nest'],'OPEN',{relations:[clues[1]],changes:['Two ordering clues removed to expose ambiguity; the expected action must not select the reasoning order.']}),
  episode('en-contradictory','en',['Otter','Pine','Eagle','Nest'],'OPEN',{relations:[...clues,{id:'cycle',kind:'before',left:'star',right:'key'}],changes:['Added a contradictory ordering relation as a negative control.']}),
  ...SIGNAL_PANEL_EPISODES
];
