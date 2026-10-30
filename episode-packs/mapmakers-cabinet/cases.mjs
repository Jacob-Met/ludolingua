export const PACK_VERSION = '0.1.0';
export const SOLUTION_ORDER = ["slot-a","slot-b","slot-c","slot-d","slot-e","slot-f","slot-g"];
export const CASES = [
  {
    "schema": "ludolingua.episode.v1",
    "id": "mapmakers-cabinet-en-source",
    "locale": "en",
    "title": "The Mapmaker’s Cabinet",
    "story": "The expedition leaves at dawn, but the mapmaker’s cabinet is locked. Its contents are needed to chart the next route. Across the desk lie seven labeled specimens and keepsakes, scattered during the packing. The oak label belongs to a small wood sample; the star label belongs to a brass token. Beside them is a note: “Restore my collection to its numbered places, first through seventh. Read the first letter of each label in that order, then enter the instrument’s English name.” Use the surviving arrangement notes to open the cabinet.",
    "hints": [
      "Before and after describe numbered positions, not the order in which the cards are currently displayed.",
      "Combine the notes into one sequence. The candle comes before the oak, and the mirror comes after the oak.",
      "The complete order is Candle, Oak, Mirror, Pear, Apple, Star, Shell. Read their first letters."
    ],
    "revision": 1,
    "cards": [
      {
        "id": "slot-d",
        "label": "Pear"
      },
      {
        "id": "slot-a",
        "label": "Candle"
      },
      {
        "id": "slot-f",
        "label": "Star"
      },
      {
        "id": "slot-c",
        "label": "Mirror"
      },
      {
        "id": "slot-g",
        "label": "Shell"
      },
      {
        "id": "slot-b",
        "label": "Oak"
      },
      {
        "id": "slot-e",
        "label": "Apple"
      }
    ],
    "clues": [
      {
        "id": "order-ab",
        "kind": "before",
        "left": "slot-a",
        "right": "slot-b"
      },
      {
        "id": "order-bc",
        "kind": "after",
        "left": "slot-c",
        "right": "slot-b"
      },
      {
        "id": "order-cd",
        "kind": "immediately_before",
        "left": "slot-c",
        "right": "slot-d"
      },
      {
        "id": "order-de",
        "kind": "after",
        "left": "slot-e",
        "right": "slot-d"
      },
      {
        "id": "order-ef",
        "kind": "before",
        "left": "slot-e",
        "right": "slot-f"
      },
      {
        "id": "order-fg",
        "kind": "immediately_before",
        "left": "slot-f",
        "right": "slot-g"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "COMPASS",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": true,
      "requireUnique": true
    },
    "provenance": {
      "kind": "authored",
      "source": "Original Mapmaker’s Cabinet seven-card episode authored for LUDOLINGUA.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": []
    }
  },
  {
    "schema": "ludolingua.episode.v1",
    "id": "mapmakers-cabinet-es-literal",
    "locale": "es",
    "title": "El armario del cartógrafo: traducción literal",
    "story": "La expedición parte al amanecer, pero el armario del cartógrafo está cerrado. Su contenido es necesario para trazar la próxima ruta. Sobre el escritorio hay siete muestras y recuerdos etiquetados que quedaron esparcidos durante los preparativos. La etiqueta «Roble» corresponde a una pequeña muestra de madera; la etiqueta «Estrella», a una ficha de latón. Junto a ellos hay una nota: «Devuelve mi colección a sus lugares numerados, del primero al séptimo. Lee la primera letra de cada etiqueta en ese orden e introduce el nombre del instrumento en español». Usa las notas de colocación que se conservaron para abrir el armario.",
    "hints": [
      "Antes y después se refieren a las posiciones numeradas, no al orden en que aparecen ahora las tarjetas.",
      "Une las notas para formar una sola secuencia. La vela va antes que el roble, y el espejo va después del roble.",
      "El orden completo es Vela, Roble, Espejo, Pera, Manzana, Estrella, Concha. Sus iniciales forman VREPMEC: esta traducción literal no conserva la respuesta codificada."
    ],
    "revision": 1,
    "cards": [
      {
        "id": "slot-d",
        "label": "Pera"
      },
      {
        "id": "slot-a",
        "label": "Vela"
      },
      {
        "id": "slot-f",
        "label": "Estrella"
      },
      {
        "id": "slot-c",
        "label": "Espejo"
      },
      {
        "id": "slot-g",
        "label": "Concha"
      },
      {
        "id": "slot-b",
        "label": "Roble"
      },
      {
        "id": "slot-e",
        "label": "Manzana"
      }
    ],
    "clues": [
      {
        "id": "order-ab",
        "kind": "before",
        "left": "slot-a",
        "right": "slot-b"
      },
      {
        "id": "order-bc",
        "kind": "after",
        "left": "slot-c",
        "right": "slot-b"
      },
      {
        "id": "order-cd",
        "kind": "immediately_before",
        "left": "slot-c",
        "right": "slot-d"
      },
      {
        "id": "order-de",
        "kind": "after",
        "left": "slot-e",
        "right": "slot-d"
      },
      {
        "id": "order-ef",
        "kind": "before",
        "left": "slot-e",
        "right": "slot-f"
      },
      {
        "id": "order-fg",
        "kind": "immediately_before",
        "left": "slot-f",
        "right": "slot-g"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "BRÚJULA",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": true,
      "requireUnique": true
    },
    "provenance": {
      "kind": "authored",
      "source": "Authored Spanish literal control derived from mapmakers-cabinet-en-source revision 1.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": [
        "The story and inventory labels are translated into Spanish; stable role IDs, displayed card order and ordering relations are retained.",
        "The required instrument name changes from COMPASS to BRÚJULA.",
        "The translated labels extract VREPMEC rather than BRÚJULA. This is an intentional negative control, not a successfully localized playable episode."
      ]
    }
  },
  {
    "schema": "ludolingua.episode.v1",
    "id": "mapmakers-cabinet-es-adapted",
    "locale": "es",
    "title": "El armario del cartógrafo",
    "story": "La expedición parte al amanecer, pero el armario del cartógrafo está cerrado. Su contenido es necesario para trazar la próxima ruta. Sobre el escritorio hay siete muestras y recuerdos etiquetados que quedaron esparcidos durante los preparativos. Una de las etiquetas identifica un útil náutico; otra, un ancla en miniatura. Junto a ellos hay una nota: «Devuelve mi colección a sus lugares numerados, del primero al séptimo. Lee la primera letra de cada etiqueta en ese orden e introduce el nombre del instrumento en español». Usa las notas de colocación que se conservaron para abrir el armario.",
    "hints": [
      "Antes y después se refieren a las posiciones numeradas, no al orden en que aparecen ahora las tarjetas.",
      "Une las notas para formar una sola secuencia. La botella va antes que el reloj, y el útil náutico va después del reloj.",
      "El orden completo es Botella, Reloj, Útil náutico, Jarra, Uva, Libro, Ancla. Conserva la tilde de Ú al leer las iniciales."
    ],
    "revision": 1,
    "cards": [
      {
        "id": "slot-d",
        "label": "Jarra"
      },
      {
        "id": "slot-a",
        "label": "Botella"
      },
      {
        "id": "slot-f",
        "label": "Libro"
      },
      {
        "id": "slot-c",
        "label": "Útil náutico"
      },
      {
        "id": "slot-g",
        "label": "Ancla"
      },
      {
        "id": "slot-b",
        "label": "Reloj"
      },
      {
        "id": "slot-e",
        "label": "Uva"
      }
    ],
    "clues": [
      {
        "id": "order-ab",
        "kind": "before",
        "left": "slot-a",
        "right": "slot-b"
      },
      {
        "id": "order-bc",
        "kind": "after",
        "left": "slot-c",
        "right": "slot-b"
      },
      {
        "id": "order-cd",
        "kind": "immediately_before",
        "left": "slot-c",
        "right": "slot-d"
      },
      {
        "id": "order-de",
        "kind": "after",
        "left": "slot-e",
        "right": "slot-d"
      },
      {
        "id": "order-ef",
        "kind": "before",
        "left": "slot-e",
        "right": "slot-f"
      },
      {
        "id": "order-fg",
        "kind": "immediately_before",
        "left": "slot-f",
        "right": "slot-g"
      }
    ],
    "extraction": {
      "kind": "first_letter",
      "normalization": "NFC-uppercase"
    },
    "action": {
      "expected": "BRÚJULA",
      "answerNormalization": "NFC-trim-uppercase"
    },
    "constraints": {
      "labelsFrozen": true,
      "requireUnique": true
    },
    "provenance": {
      "kind": "authored",
      "source": "Authored Spanish inventory adaptation derived from mapmakers-cabinet-en-source revision 1.",
      "modelRun": null,
      "humanPlaytest": null,
      "semanticChanges": [
        "The seven source objects are replaced with a newly authored Spanish inventory: Botella, Reloj, Útil náutico, Jarra, Uva, Libro, Ancla.",
        "These labels are not translations of the source inventory. The story describes the replacement collection without giving its solution order.",
        "Stable role IDs, displayed card order and all six ordering relations are retained.",
        "The extracted and required instrument name is BRÚJULA. The accented initial Ú is preserved.",
        "Mechanical correspondence does not establish equivalent meaning, equal difficulty, native-language quality or successful player inference."
      ]
    }
  }
];
