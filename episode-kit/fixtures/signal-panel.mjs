// Original authored episode content. Stable role IDs carry the declared relation mapping.
const roles = ['pine', 'river', 'ember', 'stone', 'star'];
const relations = [
  { id: 'star-after-ember', kind: 'before', left: 'ember', right: 'star' },
  { id: 'river-before-ember', kind: 'before', left: 'river', right: 'ember' },
  { id: 'resolve-pair', kind: 'before', left: 'stone', right: 'star' },
  { id: 'pine-before-river', kind: 'before', left: 'pine', right: 'river' },
  { id: 'stone-after-ember', kind: 'before', left: 'ember', right: 'stone' }
];
const englishStory = 'The signal panel has five slots and a brass button. Arrange all five cards using every clue. Read their initials from left to right and enter the word they spell.';
const spanishStory = 'El panel de señales tiene cinco ranuras y un botón de latón. Ordena las cinco tarjetas según todas las pistas. Lee sus iniciales de izquierda a derecha y escribe la palabra que forman.';
const sourceHints = [
  'Begin with the clue about Pine and River.',
  'The River clue places Ember. Then place the two cards that come after Ember.',
  'Stone and Star share an initial. The clue between those two cards, not the extracted word, decides their order.'
];
function episode({ id, locale, title, story, labels, expected, clues = relations, hints, changes = [] }) {
  return {
    schema: 'ludolingua.episode.v1', id, revision: 1, locale, title, story,
    cards: roles.map((id, index) => ({ id, label: labels[index] })),
    clues: clues.map(clue => ({ ...clue })),
    extraction: { kind: 'first_letter', normalization: 'NFC-uppercase' },
    action: { expected, answerNormalization: 'NFC-trim-uppercase' },
    constraints: { labelsFrozen: false, requireUnique: true },
    hints: [...hints],
    provenance: {
      kind: 'authored',
      source: 'Original Signal Panel contribution by estate-87e6eb8b8f0d-20261029 with ChatGPT, for the existing LUDOLINGUA project owned by hamon-a19-20261027. No external puzzle assets or NVIDIA/Nebius inference run.',
      modelRun: null, humanPlaytest: null, semanticChanges: [...changes]
    }
  };
}
export const SIGNAL_PANEL_EPISODES = [
  episode({
    id: 'en-signal-original', locale: 'en', title: 'The Signal Panel — source',
    story: englishStory, labels: ['Pine', 'River', 'Ember', 'Stone', 'Star'],
    expected: 'PRESS', hints: sourceHints
  }),
  episode({
    id: 'es-signal-literal', locale: 'es', title: 'El panel de señales — traducción literal',
    story: 'Esta traducción literal es un caso de contraste. El panel de señales tiene cinco ranuras y un botón de latón. Ordena las cinco tarjetas según todas las pistas. Lee sus iniciales de izquierda a derecha y comprueba si forman una acción española para el botón.',
    labels: ['Pino', 'Río', 'Brasa', 'Piedra', 'Estrella'], expected: 'PULSA',
    hints: [
      'Empieza por la pista que relaciona Pino y Río.',
      'La pista de Río sitúa Brasa. Después coloca las dos tarjetas que van después de Brasa.',
      'Una pista decide el orden de Piedra y Estrella. Resolver el orden no garantiza que las iniciales formen la acción española.'
    ],
    changes: [
      'Literal labels retain the five referents: Pine→Pino, River→Río, Ember→Brasa, Stone→Piedra, Star→Estrella.',
      'The same unique role order extracts PRBPE, which does not encode the localized button command PULSA. This intentional negative example is valid evidence, not a successful adaptation.'
    ]
  }),
  episode({
    id: 'es-signal-adapted', locale: 'es', title: 'El panel de señales — adaptación coordinada',
    story: spanishStory, labels: ['Pulpo', 'Uva', 'Luna', 'Sol', 'Ancla'],
    expected: 'PULSA',
    hints: [
      'Empieza por la pista que relaciona Pulpo y Uva.',
      'La pista de Uva sitúa Luna. Después coloca las dos tarjetas que van después de Luna.',
      'Sol y Ancla no son intercambiables: una pista indica cuál va primero. Lee las iniciales solo después de ordenar las cinco tarjetas.'
    ],
    changes: [
      'All five referents change: Pine→Pulpo, River→Uva, Ember→Luna, Stone→Sol, Star→Ancla. This is a coordinated adaptation, not a literal translation.',
      'Stable card roles, all five precedence relations and the unique reasoning order are preserved. The initials encode PULSA for the button instead of PRESS.',
      'The English source has two S initials; this adaptation has five distinct initials. The separate English same-word ambiguity example does not transfer unchanged. Native-language clarity and comparable difficulty remain untested.'
    ]
  }),
  episode({
    id: 'en-signal-ambiguous', locale: 'en', title: 'The Signal Panel — missing-clue challenge',
    story: englishStory + ' One clue has gone missing. Do the remaining clues determine just one card order, even if they still reveal a word?',
    labels: ['Pine', 'River', 'Ember', 'Stone', 'Star'], expected: 'PRESS',
    clues: relations.filter(clue => clue.id !== 'resolve-pair'),
    hints: [
      sourceHints[0], sourceHints[1],
      'No remaining clue orders Stone and Star. Try both placements. Reading the same word twice does not supply the missing relation.'
    ],
    changes: [
      'Only the Stone-before-Star clue is removed from the English source. Exactly two distinct card orders remain; both extract PRESS.',
      'Either layout is a valid individual attempt. The author check must still report ambiguous reasoning because this episode requires a unique card order.',
      'This same-word witness is specific to the English labels, whose last two initials are both S. It is not a claim that every localization shares the ambiguity.'
    ]
  })
];
