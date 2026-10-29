export const PACK_VERSION = '0.1.0';
export const CASES = [
  {
    "schema": "ludolingua.episode.v1",
    "id": "storm-signal-en",
    "revision": 1,
    "locale": "en",
    "title": "The Storm Signal",
    "story": "A storm has silenced the cliff watch station. Five brass tags were left on the signal desk. The keeper remembers their relative order, but not the warning code. Arrange the tags using the surviving clues and read their first letters to restore the code before the next ship approaches.",
    "cards": [
      {
        "id": "anchor",
        "label": "Anchor"
      },
      {
        "id": "lantern",
        "label": "Lantern"
      },
      {
        "id": "echo",
        "label": "Echo"
      },
      {
        "id": "rope",
        "label": "Rope"
      },
      {
        "id": "tower",
        "label": "Tower"
      }
    ],
    "clues": [
      {
        "id": "anchor-before-lantern",
        "kind": "before",
        "left": "anchor",
        "right": "lantern"
      },
      {
        "id": "lantern-before-echo",
        "kind": "before",
        "left": "lantern",
        "right": "echo"
      },
      {
        "id": "echo-before-rope-adjacent",
        "kind": "immediately_before",
        "left": "echo",
        "right": "rope"
      },
      {
        "id": "rope-before-tower-adjacent",
        "kind": "immediately_before",
        "left": "rope",
        "right": "tower"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "ALERT",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": false,
      "requireUnique": true
    },
    "hints": [
      "The two immediately-before clues form a block of three tags.",
      "Find what must go before the first tag in that block.",
      "The two remaining tags have their own ordering relation. Use every clue, not only the target code."
    ],
    "provenance": {
      "kind": "authored",
      "source": "Original authored Storm Signal case by estate-gpt6-ad664b52-c41d-47a6-a8a5-06d7663ffbf1 for existing LUDOLINGUA; product custody remains hamon-a19-20261027. No external assets or inference.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": []
    }
  },
  {
    "schema": "ludolingua.episode.v1",
    "id": "storm-signal-es-literal",
    "revision": 1,
    "locale": "es",
    "title": "La señal de tormenta",
    "story": "Una tormenta ha dejado sin señal al puesto de vigilancia del acantilado. Quedan cinco placas de latón sobre la mesa. La persona de guardia recuerda su orden relativo, pero no el código de aviso. Ordena las placas según las pistas y lee sus iniciales para recuperar el código antes de que se acerque el próximo barco.",
    "cards": [
      {
        "id": "anchor",
        "label": "Ancla"
      },
      {
        "id": "lantern",
        "label": "Linterna"
      },
      {
        "id": "echo",
        "label": "Eco"
      },
      {
        "id": "rope",
        "label": "Soga"
      },
      {
        "id": "tower",
        "label": "Torre"
      }
    ],
    "clues": [
      {
        "id": "anchor-before-lantern",
        "kind": "before",
        "left": "anchor",
        "right": "lantern"
      },
      {
        "id": "lantern-before-echo",
        "kind": "before",
        "left": "lantern",
        "right": "echo"
      },
      {
        "id": "echo-before-rope-adjacent",
        "kind": "immediately_before",
        "left": "echo",
        "right": "rope"
      },
      {
        "id": "rope-before-tower-adjacent",
        "kind": "immediately_before",
        "left": "rope",
        "right": "tower"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "AVISO",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": false,
      "requireUnique": true
    },
    "hints": [
      "Las dos pistas con «inmediatamente antes» forman un bloque de tres placas.",
      "Encuentra lo que debe ir antes de la primera placa de ese bloque.",
      "Las dos placas restantes tienen su propia relación. Usa todas las pistas, no solo el código buscado."
    ],
    "provenance": {
      "kind": "authored",
      "source": "Original authored Storm Signal case by estate-gpt6-ad664b52-c41d-47a6-a8a5-06d7663ffbf1 for existing LUDOLINGUA; product custody remains hamon-a19-20261027. No external assets or inference.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": [
        "Literal referents remain: Anchor→Ancla, Lantern→Linterna, Echo→Eco, Rope→Soga, Tower→Torre. The ordered initials spell ALEST, not the authored code AVISO.",
        "AVISO is an authored short operational warning code, not asserted as the word-for-word translation of ALERT; this case intentionally fails mechanically."
      ]
    }
  },
  {
    "schema": "ludolingua.episode.v1",
    "id": "storm-signal-es-adapted",
    "revision": 1,
    "locale": "es",
    "title": "La señal de tormenta",
    "story": "Una tormenta ha dejado sin señal al puesto de vigilancia del acantilado. Quedan cinco placas de latón sobre la mesa. La persona de guardia recuerda su orden relativo, pero no el código de aviso. Ordena las placas según las pistas y lee sus iniciales para recuperar el código antes de que se acerque el próximo barco.",
    "cards": [
      {
        "id": "anchor",
        "label": "Ancla"
      },
      {
        "id": "lantern",
        "label": "Vigía"
      },
      {
        "id": "echo",
        "label": "Isla"
      },
      {
        "id": "rope",
        "label": "Sirena"
      },
      {
        "id": "tower",
        "label": "Observatorio"
      }
    ],
    "clues": [
      {
        "id": "anchor-before-lantern",
        "kind": "before",
        "left": "anchor",
        "right": "lantern"
      },
      {
        "id": "lantern-before-echo",
        "kind": "before",
        "left": "lantern",
        "right": "echo"
      },
      {
        "id": "echo-before-rope-adjacent",
        "kind": "immediately_before",
        "left": "echo",
        "right": "rope"
      },
      {
        "id": "rope-before-tower-adjacent",
        "kind": "immediately_before",
        "left": "rope",
        "right": "tower"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "AVISO",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": false,
      "requireUnique": true
    },
    "hints": [
      "Las dos pistas con «inmediatamente antes» forman un bloque de tres placas.",
      "Encuentra lo que debe ir antes de la primera placa de ese bloque.",
      "Las dos placas restantes tienen su propia relación. Usa todas las pistas, no solo el código buscado."
    ],
    "provenance": {
      "kind": "authored",
      "source": "Original authored Storm Signal case by estate-gpt6-ad664b52-c41d-47a6-a8a5-06d7663ffbf1 for existing LUDOLINGUA; product custody remains hamon-a19-20261027. No external assets or inference.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": [
        "Four referents change relative to literal labels for AVISO: Linterna→Vigía, Eco→Isla, Soga→Sirena, Torre→Observatorio. Ancla remains unchanged.",
        "The new labels are plausible coastal-watch referents but story semantics change, including replacing an object with a person. This is an explicit authored adaptation, not a literal translation.",
        "Card roles, clue relations, story and hints are preserved. Language clarity, equivalent difficulty and human playtests remain unverified."
      ]
    }
  },
  {
    "schema": "ludolingua.episode.v1",
    "id": "storm-signal-es-ambiguous",
    "revision": 1,
    "locale": "es",
    "title": "La señal de tormenta",
    "story": "Una tormenta ha dejado sin señal al puesto de vigilancia del acantilado. Quedan cinco placas de latón sobre la mesa. La persona de guardia recuerda su orden relativo, pero no el código de aviso. Ordena las placas según las pistas y lee sus iniciales para recuperar el código antes de que se acerque el próximo barco.",
    "cards": [
      {
        "id": "anchor",
        "label": "Ancla"
      },
      {
        "id": "lantern",
        "label": "Vigía"
      },
      {
        "id": "echo",
        "label": "Isla"
      },
      {
        "id": "rope",
        "label": "Sirena"
      },
      {
        "id": "tower",
        "label": "Observatorio"
      }
    ],
    "clues": [
      {
        "id": "lantern-before-echo",
        "kind": "before",
        "left": "lantern",
        "right": "echo"
      },
      {
        "id": "echo-before-rope-adjacent",
        "kind": "immediately_before",
        "left": "echo",
        "right": "rope"
      },
      {
        "id": "rope-before-tower-adjacent",
        "kind": "immediately_before",
        "left": "rope",
        "right": "tower"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "AVISO",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": false,
      "requireUnique": true
    },
    "hints": [
      "Las dos pistas con «inmediatamente antes» forman un bloque de tres placas.",
      "Encuentra lo que debe ir antes de la primera placa de ese bloque.",
      "Las dos placas restantes tienen su propia relación. Usa todas las pistas, no solo el código buscado."
    ],
    "provenance": {
      "kind": "authored",
      "source": "Original authored Storm Signal case by estate-gpt6-ad664b52-c41d-47a6-a8a5-06d7663ffbf1 for existing LUDOLINGUA; product custody remains hamon-a19-20261027. No external assets or inference.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": [
        "Negative control: the anchor-before-lantern clue is deliberately omitted, leaving several clue-consistent orders despite one spelling AVISO.",
        "Knowing the desired word does not establish unique reasoning."
      ]
    }
  }
];
