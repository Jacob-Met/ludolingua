# The Mapmaker’s Cabinet

Start with [OPEN_ME.html](OPEN_ME.html) for a spoiler-free choice of English and Spanish offline players.

## Solutions and localization choices

This original seven-card case compares an English source, a literal Spanish control and an adaptation with an explicitly reauthored inventory. All retain stable role IDs, the same shuffled presentation order and six typed ordering clues. The clues combine before, after and immediately-before relations into one complete order.

| Case | Extracted token | Required answer | Intended use |
|---|---|---|---|
| English source | COMPASS | COMPASS | Playable original |
| Literal Spanish | VREPMEC | BRÚJULA | Deliberately broken localization contrast |
| Adapted Spanish | BRÚJULA | BRÚJULA | Playable authored adaptation |

| Role | English | Literal Spanish | Adapted Spanish |
|---|---|---|---|
| slot-a | Candle | Vela | Botella |
| slot-b | Oak | Roble | Reloj |
| slot-c | Mirror | Espejo | Útil náutico |
| slot-d | Pear | Pera | Jarra |
| slot-e | Apple | Manzana | Uva |
| slot-f | Star | Estrella | Libro |
| slot-g | Shell | Concha | Ancla |

The adaptation replaces the objects. These are not equivalent translations. The story describes the replacement collection without listing its solution order. The literal example has a unique clue-consistent order, but its frozen labels cannot produce the required answer in any permutation.

Two details matter here. Star and Shell share an initial: swapping them preserves COMPASS but violates their ordering clue, so the answer alone cannot certify a solved puzzle. In Spanish, Ú and U are different initials. Canonically decomposed `U` plus a combining acute accent normalizes to Ú, while removing the accent changes the answer. The unchanged runtime uses NFC normalization, trimming and uppercase; it does not fold accents.

## Contents and use

- `exports/players/01-en-source.html` and `03-es-adapted.html`: self-contained playable pages.
- `exports/episodes/`: integrity-bound source, literal contrast and adapted episode exports.
- `exports/comparisons/`: source-versus-literal and source-versus-adapted comparison exports.
- `exports/manifest.json`: generated file hashes and intended case outcomes.
- `runtime-pin.json`: exact source commit and byte inventory of the accompanying unchanged runtime.

For the author workbench, run `node episode-kit/serve.mjs` from the bundle/repository root, then import the episode or comparison files. Node.js 22 or newer is required. No dependency installation or model inference is required.

## Reproduce and verify

For a reproducible build, check out the casepack source commit recorded in the release’s `BUNDLE-SOURCE.json`, then run these commands from that repository root. The runtime pin is strict: a newer main branch may contain another owner’s runtime changes and will be refused. The builder verifies runtime membership and raw bytes before loading its modules or creating output; it never refreshes the pin automatically.

```sh
node episode-packs/mapmakers-cabinet/build.mjs /new/output-directory
python3 episode-packs/mapmakers-cabinet/oracle.py episode-packs/mapmakers-cabinet/exports/episodes
node --test episode-packs/mapmakers-cabinet/oracle.test.mjs
python3 episode-packs/mapmakers-cabinet/package.py --output /outside/source/mapmakers-cabinet.zip --source-commit FULL_VERIFIED_COMMIT
```

The builder refuses an existing output directory. Packaging verifies exact runtime membership and bytes, regenerates every episode/comparison/player export, and compares the complete generated inventory before making a new deterministic archive. The independent Python oracle imports no production engine and enumerates all 5,040 orders for each episode. The production handler tests separately check wrong-order and Unicode behavior. Browser receiving must verify the actual author, player, record and extracted-package paths; test totals are not a substitute for those journeys.

SHA-256 inventories detect changed bytes; they are not signatures. The supplied source commit must be verified against the repository. Mechanical correspondence does not establish equivalent meaning, equal difficulty, native-language quality, human participation or successful player inference. `modelRun` and `humanPlaytest` remain null.
