export const PACK_VERSION = '0.1.0';
export const CASES = [
  {
    "schema": "ludolingua.episode.v1",
    "id": "coastal-bearing-en",
    "revision": 1,
    "locale": "en",
    "title": "The Last Bearing",
    "story": "The chart room has gone dark. One lamp still glows beside the compass. Beneath it lie five wooden plates, each naming a feature from the navigator’s coastal notes. Arrange them in the only order the clues allow. Then read the first letters from left to right: together they recover the bearing missing from the chart.",
    "cards": [
      {
        "id": "nest",
        "label": "Nest"
      },
      {
        "id": "sea",
        "label": "Ocean"
      },
      {
        "id": "river",
        "label": "River"
      },
      {
        "id": "tower",
        "label": "Tower"
      },
      {
        "id": "landing",
        "label": "Harbor"
      }
    ],
    "clues": [
      {
        "id": "landing-after-tower",
        "kind": "after",
        "left": "landing",
        "right": "tower"
      },
      {
        "id": "sea-river-pair",
        "kind": "immediately_before",
        "left": "sea",
        "right": "river"
      },
      {
        "id": "nest-before-sea",
        "kind": "before",
        "left": "nest",
        "right": "sea"
      },
      {
        "id": "river-tower-pair",
        "kind": "immediately_before",
        "left": "river",
        "right": "tower"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "NORTH",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": false,
      "requireUnique": true
    },
    "hints": [
      "“Immediately before” means the two plates must touch.",
      "Join the two immediate links into one block of three plates. Keep their internal order.",
      "Use the clue that says “before”, without “immediately”, to place one plate ahead of the block. Put the remaining plate after it, then read the five initials."
    ],
    "provenance": {
      "kind": "authored",
      "source": "Original Coastal Bearing case authored with ChatGPT by estate-a10203ad-3c50-4b64-aae6-2b9d1b0c60cf for the existing LUDOLINGUA project; product custody remains with hamon-a19-20261027. No external puzzle assets or NVIDIA/Nebius inference run.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": []
    }
  },
  {
    "schema": "ludolingua.episode.v1",
    "id": "coastal-bearing-es-literal",
    "revision": 1,
    "locale": "es",
    "title": "El último rumbo",
    "story": "La sala de mapas está a oscuras. Solo una lámpara sigue encendida junto a la brújula. Debajo hay cinco tablillas de madera con nombres tomados de unas notas sobre la costa. Ordénalas según las pistas y lee sus iniciales de izquierda a derecha. Juntas revelan el rumbo que falta en el mapa.",
    "cards": [
      {
        "id": "nest",
        "label": "Nido"
      },
      {
        "id": "sea",
        "label": "Océano"
      },
      {
        "id": "river",
        "label": "Río"
      },
      {
        "id": "tower",
        "label": "Torre"
      },
      {
        "id": "landing",
        "label": "Puerto"
      }
    ],
    "clues": [
      {
        "id": "landing-after-tower",
        "kind": "after",
        "left": "landing",
        "right": "tower"
      },
      {
        "id": "sea-river-pair",
        "kind": "immediately_before",
        "left": "sea",
        "right": "river"
      },
      {
        "id": "nest-before-sea",
        "kind": "before",
        "left": "nest",
        "right": "sea"
      },
      {
        "id": "river-tower-pair",
        "kind": "immediately_before",
        "left": "river",
        "right": "tower"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "NORTE",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": false,
      "requireUnique": true
    },
    "hints": [
      "«Inmediatamente antes» significa que las dos tablillas deben quedar juntas.",
      "Une los dos enlaces inmediatos en un bloque de tres tablillas. Conserva su orden interno.",
      "Usa la pista que dice «antes», sin «inmediatamente», para colocar una tablilla delante del bloque. Pon la restante detrás y lee las cinco iniciales."
    ],
    "provenance": {
      "kind": "authored",
      "source": "Original Coastal Bearing case authored with ChatGPT by estate-a10203ad-3c50-4b64-aae6-2b9d1b0c60cf for the existing LUDOLINGUA project; product custody remains with hamon-a19-20261027. No external puzzle assets or NVIDIA/Nebius inference run.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": [
        "Authored Spanish literal-label contrast: Nest→Nido, Ocean→Océano, River→Río, Tower→Torre, Harbor→Puerto. Harbor is rendered as Puerto in this coastal context, not asserted as a universal exact equivalence.",
        "The same unique role order extracts NORTP, not the localized bearing NORTE. This is an intentional mechanically unsuccessful contrast. Accents and all ordering constraints are retained."
      ]
    }
  },
  {
    "schema": "ludolingua.episode.v1",
    "id": "coastal-bearing-es-adapted",
    "revision": 1,
    "locale": "es",
    "title": "El último rumbo",
    "story": "La sala de mapas está a oscuras. Solo una lámpara sigue encendida junto a la brújula. Debajo hay cinco tablillas de madera con nombres tomados de unas notas sobre la costa. Ordénalas según las pistas y lee sus iniciales de izquierda a derecha. Juntas revelan el rumbo que falta en el mapa.",
    "cards": [
      {
        "id": "nest",
        "label": "Nido"
      },
      {
        "id": "sea",
        "label": "Océano"
      },
      {
        "id": "river",
        "label": "Río"
      },
      {
        "id": "tower",
        "label": "Torre"
      },
      {
        "id": "landing",
        "label": "Embarcadero"
      }
    ],
    "clues": [
      {
        "id": "landing-after-tower",
        "kind": "after",
        "left": "landing",
        "right": "tower"
      },
      {
        "id": "sea-river-pair",
        "kind": "immediately_before",
        "left": "sea",
        "right": "river"
      },
      {
        "id": "nest-before-sea",
        "kind": "before",
        "left": "nest",
        "right": "sea"
      },
      {
        "id": "river-tower-pair",
        "kind": "immediately_before",
        "left": "river",
        "right": "tower"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "NORTE",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": false,
      "requireUnique": true
    },
    "hints": [
      "«Inmediatamente antes» significa que las dos tablillas deben quedar juntas.",
      "Une los dos enlaces inmediatos en un bloque de tres tablillas. Conserva su orden interno.",
      "Usa la pista que dice «antes», sin «inmediatamente», para colocar una tablilla delante del bloque. Pon la restante detrás y lee las cinco iniciales."
    ],
    "provenance": {
      "kind": "authored",
      "source": "Original Coastal Bearing case authored with ChatGPT by estate-a10203ad-3c50-4b64-aae6-2b9d1b0c60cf for the existing LUDOLINGUA project; product custody remains with hamon-a19-20261027. No external puzzle assets or NVIDIA/Nebius inference run.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": [
        "Relative to the Spanish literal-label contrast, only the landing card label changes: Puerto→Embarcadero. The first four labels, card IDs, clues, story, hints, extraction and required bearing NORTE are preserved; episode identity and provenance identify this variant.",
        "The referent narrows from a port or harbor to a place for boarding or landing. An embarcadero need not be a constructed pier. This is an authored semantic change, not a literal synonym substitution.",
        "The same unique role order now extracts NORTE. Language clarity, comparable difficulty, cultural suitability and native-human playtesting remain unverified."
      ]
    }
  }
];
