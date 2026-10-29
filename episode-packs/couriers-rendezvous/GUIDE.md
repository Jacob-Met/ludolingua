# The Courier’s Rendezvous · La cita del mensajero

An original English–Spanish ordering puzzle and authoring case study. Arrange six text cards using the clues, then use their initials to discover the courier’s meeting place.

Un rompecabezas original en inglés y español y un caso práctico de adaptación. Ordena seis tarjetas de texto según las pistas y utiliza sus iniciales para descubrir dónde te espera el mensajero.

## Play first · Juega primero

Requires Node.js 22 or newer. No dependency installation, credentials or inference service is needed. From the extracted bundle directory, run:

```sh
node episode-kit/serve.mjs
```

Keep the terminal open. Open the printed local address, then open `/web/playtest.html` at that same address. Stop the server with Ctrl+C when finished. The files below are inside `episode-packs/couriers-rendezvous/`; choose them from your computer using the player's **Open an episode export** file picker. They are not preset entries in the episode selector.

### English

1. Open `exports/en-source.export.json`. For the repaired Spanish version, open `exports/es-repaired.export.json` in a fresh player window.
2. Read the story and arrange the cards so that every clue holds.
3. Read the first letter of each complete card label from left to right. **A label with several words contributes only its first letter**, not one letter per word.
4. Enter the meeting place. The kit calls this field an “action”; for this case, the word to enter is a place. Use hints if you want help.
5. Download your play record before refreshing or closing the player. There is no automatic save.

Play one version before opening the author notes below. Playing the other version afterward helps inspection, but knowing the solution affects that second experience.

### Español

1. Abre `exports/es-repaired.export.json`. Para jugar en inglés, abre `exports/en-source.export.json` en una ventana nueva.
2. Lee la historia y ordena las tarjetas de modo que se cumplan todas las pistas.
3. Lee, de izquierda a derecha, la primera letra del nombre completo de cada tarjeta. **Un nombre de varias palabras aporta solo su primera letra**, no una letra por palabra.
4. Escribe el lugar de encuentro. La interfaz llama “acción” a este campo; en este caso debes escribir un lugar. Puedes consultar las pistas de ayuda.
5. Descarga tu registro de juego antes de actualizar la página o cerrar el jugador. No se guarda automáticamente.

Juega una versión antes de abrir las notas de autor. Después puedes examinar la otra, pero conocer la solución influirá en esa segunda experiencia.

## Files and intended use · Archivos y usos

| File | Purpose · Uso |
| --- | --- |
| `exports/en-source.export.json` | English source puzzle. · Rompecabezas original en inglés. |
| `exports/es-repaired.export.json` | Spanish version intended for play. · Versión española destinada al juego. |
| `exports/es-literal.export.json` | Deliberate author exercise: translated labels fail the required answer. · Ejercicio de autoría: los nombres traducidos no forman la respuesta requerida. |
| `exports/es-meaning-control.export.json` | Deliberate author exercise: the initials work but an intended object changes. · Ejercicio de autoría: las iniciales funcionan, pero cambia un objeto previsto. |

The last two files are diagnostic exercises, clearly labeled in their titles and stories. A verified export establishes consistency with its recorded analysis; it does not necessarily mean the puzzle succeeds.

Los dos últimos archivos son ejercicios de diagnóstico, identificados en sus títulos e historias. Un archivo verificado concuerda con su análisis registrado; eso no significa necesariamente que el rompecabezas funcione.

---

<details>
<summary>Author notes — contains the solution · Notas de autor — contienen la solución</summary>

## What changes, and what stays the same

The English clue order spells **BRIDGE**:

**Bread → Raisin → Ivy → Daffodil → Golden topaz → Emerald**

The Spanish target is **PUENTE**. The baseline labels follow the author's intended object mapping but produce **PPHNTE**:

**Pan → Pasa → Hiedra → Narciso → Topacio dorado → Esmeralda**

The repair changes two labels:

- **Pasa → Uva pasa**
- **Hiedra → Enredadera de hiedra**

The repaired order produces **PUENTE**:

**Pan → Uva pasa → Enredadera de hiedra → Narciso → Topacio dorado → Esmeralda**

Card roles and ordering clues stay the same. The authors assess the two repaired labels as retaining the intended dried grape and ivy. That is an editorial judgment, **not a conclusion certified by the mechanical checker**. “Enredadera de hiedra” adds descriptive framing and is longer than the other labels.

The **Daffodil / Narciso** mapping is shared by the baseline and repaired versions. The intended object is a daffodil flower; its lexical and botanical precision is not independently qualified here. This case does not establish native-language approval, equal fluency, equivalent difficulty, or human playtest results.

## Why the meaning control matters

The control replaces **Uva pasa** with **Uva fresca**. Its initial remains U, so the same order still spells **PUENTE**. But a fresh grape is not the intended dried grape.

Within the puzzle mechanism, only that one label changes. The control's ID, title, story warning and provenance explicitly identify the different purpose. Mechanical success therefore coexists with a declared referent change. A successful extraction is evidence about the mechanism; it cannot approve the translation or the writing.

## Qué cambia y qué se conserva

El orden inglés forma **BRIDGE**. La respuesta prevista en español es **PUENTE**, pero los nombres de la versión inicial forman **PPHNTE**.

La adaptación cambia **Pasa** por **Uva pasa** y **Hiedra** por **Enredadera de hiedra**. Conserva las identidades de las tarjetas y las pistas de orden. Según el criterio de los autores, estos cambios mantienen los referentes previstos: una uva desecada y una hiedra. **La comprobación mecánica no certifica ese criterio lingüístico.**

La correspondencia **Daffodil / Narciso** aparece tanto en la versión inicial como en la adaptada. Su precisión léxica y botánica no se ha validado de forma independiente. Tampoco se afirma que las versiones tengan la misma naturalidad o dificultad, ni que hayan sido evaluadas por hablantes nativos o mediante pruebas humanas de juego.

El control sustituye **Uva pasa** por **Uva fresca**. Las iniciales siguen formando **PUENTE**, pero cambia el objeto. Que la extracción funcione no demuestra que se haya conservado el significado.

## Inspect the case in the author workbench

Open the printed server address to reach the workbench. Use **Reopen an export** to inspect a checked episode. For a comparison made through the UI:

1. Reopen `exports/en-source.export.json`.
2. Choose **Use this revision as the source**.
3. Reopen one of the Spanish episode exports as the current adaptation.
4. Verify the six role mappings and choose **Compare these revisions**.
5. Inspect changed labels and the declared semantic changes, then export the checked comparison if you want to keep it.

Alternatively, use **Reopen a comparison** with a file from `comparisons/`. These carry the same source, target and explicit role map. The literal comparison is mechanically negative; the repair and meaning control are both mechanically positive.

Keep three questions separate:

1. Do the clues determine the intended order?
2. Do the initials encode the required answer?
3. Does the wording preserve the intended objects and read well for its audience?

The engine checks the encoded ordering and extraction. The third question requires editorial judgment and, for stronger claims, appropriate language review and player evidence.

Después de jugar, abre el espacio de autoría y examina los archivos mediante la función para reabrir exportaciones. Compara la fuente inglesa con cada versión española. Revisa tanto los nombres y sus referentes como el resultado mecánico. La comprobación del mecanismo no sustituye la revisión lingüística ni la experiencia real de los jugadores.

</details>

## Reproduce the checks

From the bundle root:

```sh
node episode-packs/couriers-rendezvous/scripts/verify.mjs
```

This receives every supplied export and comparison, checks the pinned runtime files, runs the independent 720-order Python oracle, and exercises the maintained CLI. Python 3.9+ is required for this verification and packaging; playing needs only Node.js 22+ and a browser.

The literal episode's `check` and literal comparison's `compare` intentionally exit **2**. Their integrity receivers exit **0** after successfully recomputing the negative result. The case verifier fails if those outcomes change unexpectedly.

Raw authored episodes are in `episodes/`. To create checked exports from them, choose a new directory outside the bundle:

```sh
node episode-packs/couriers-rendezvous/scripts/generate.mjs /absolute/path/to/new-courier-exports
```

The maintained CLI `export` command accepts bundled fixture IDs, so the case generator uses the maintained export APIs for these separate authored files. New exports, records, screenshots and build outputs belong outside the bundle.

The case-local package wrapper uses the unchanged maintained kit builder and combines its complete runtime with this case. For a published source checkout, use a new output path and the exact reviewed case commit:

```sh
python3 episode-packs/couriers-rendezvous/scripts/package.py --source-commit FULL_CASE_COMMIT_SHA --output /absolute/path/to/new-courier-bundle.zip
```

The wrapper records the supplied source identity; release verification separately binds it to the actual published tree. Hashes establish content consistency, not author authentication.

## Attribution and limits

Original content was authored with ChatGPT by estate-d0f95ce3-8a9f-464c-aa68-8376632345ae and assessed by its retained source, consumer and independent-verification workers. The unchanged kit belongs to the existing LUDOLINGUA contributors; original product custody remains with hamon-a19-20261027. See `PROVENANCE.json` and `runtime-files.json`.

No external puzzle assets, NVIDIA/Nebius inference, native-human study, equal-difficulty result or public release is claimed. Automated player journeys and replayable records show observed software behavior, not a person's understanding or unaided discovery.
