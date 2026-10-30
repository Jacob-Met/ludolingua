# Adapt the Mapmaker’s Cabinet into Spanish

Create a Spanish version of the seven-card puzzle while preserving its ordering problem. Replace the collection’s objects, revise the story and hints, and carry your explanation with the checked source and target.

**This workshop contains solutions.** For an unspoiled game, play [the original Mapmaker pack](https://github.com/Jacob-Met/ludolingua/releases/tag/mapmakers-cabinet-v0.1.0.e062415d) first. To inspect the completed exercise immediately, open [completed-player.es.html](completed-player.es.html).

## 1. Open the authoring application

1. Download the episode-kit ZIP from the [maintained 0.6 notes release](https://github.com/Jacob-Met/ludolingua/releases/tag/episode-kit-v0.6.0-notes.a424427c) and extract it.
2. With Node.js 22 or later installed, run the command below using the extracted episode-kit folder.
3. Open http://127.0.0.1:4173 in your browser. Keep the command running while you author; use Ctrl+C to stop it afterward.
4. Leave **Interface language** set to English to match this guide’s control names. The puzzle’s content language is selected separately.

```sh
node /path/to/episode-kit/serve.mjs
```

The downloaded application runs on your computer’s loopback address and needs no npm installation. This workshop was received with Linux, Node.js 22 and Chrome 156. The HTML guide and completed player can be opened directly without starting the authoring application.

## 2. Start from the unchanged English source

Choose **Reopen an export** and open [source.en.json](source.en.json) from this workshop. It is the exact English source export from the original pack.

Expand **Start an adaptation in another language**. Set **Adaptation language** to **Español**, then choose **Start an adaptation of this revision**. The workbench creates a new Spanish target and captures the English revision as its comparison source.

The starting text is copied unchanged. Review the notice before editing: selecting Spanish does not translate the story, labels, action or hints. Work on the new target and retain the captured English source.

## 3. Decide what must change

The English labels spell **COMPASS** in the solved order. Literal Spanish labels—Vela, Roble, Espejo, Pera, Manzana, Estrella, Concha—spell **VREPMEC**. The six ordering relations still work, but the discovery does not name the intended instrument.

This exercise chooses a different collection whose initials spell **BRÚJULA**. These are newly authored referents, not literal translations. Keep that decision visible in your eventual author notes.

## 4. Reauthor the target inventory

Uncheck **Freeze these labels** on the Spanish target. This explicitly changes the target’s authoring constraint so you can edit it. The captured English source remains frozen and unchanged.

Find each card by its existing label and apply the mapping below. The cards are displayed in a shuffled order; do not rearrange them to match this table.

| Stable role | Existing label | Spanish label |
| --- | --- | --- |
| slot-a | Candle | Botella |
| slot-b | Oak | Reloj |
| slot-c | Mirror | Útil náutico |
| slot-d | Pear | Jarra |
| slot-e | Apple | Uva |
| slot-f | Star | Libro |
| slot-g | Shell | Ancla |

Keep all six typed ordering clues unchanged. Their displayed Spanish wording regenerates from the new labels. The singular **Útil náutico** agrees with the clue wording using **va**, and supplies the accented initial **Ú**.

Recheck **Freeze these labels** when the inventory is complete. Set **Required action** to **BRÚJULA**, preserving the accent.

## 5. Give the collection a coherent story

Set **Episode title** to **El armario del cartógrafo**. Replace **Story for the player** with:

> La expedición parte al amanecer, pero el armario del cartógrafo está cerrado. Su contenido es necesario para trazar la próxima ruta. Sobre el escritorio hay siete muestras y recuerdos etiquetados que quedaron esparcidos durante los preparativos. Una de las etiquetas identifica un útil náutico; otra, un ancla en miniatura. Junto a ellos hay una nota: «Devuelve mi colección a sus lugares numerados, del primero al séptimo. Lee la primera letra de cada etiqueta en ese orden e introduce el nombre del instrumento en español». Usa las notas de colocación que se conservaron para abrir el armario.

The story removes the English source’s oak sample and brass star token, and describes the replacement collection without listing it in solution order.

## 6. Author and review the hints

Expand **Edit and review the hints**. In **One hint per line, in reveal order**, enter these three lines:

```text
Antes y después se refieren a las posiciones numeradas, no al orden en que aparecen ahora las tarjetas.
Une las notas para formar una sola secuencia. La botella va antes que el reloj, y el útil náutico va después del reloj.
El orden completo es Botella, Reloj, Útil náutico, Jarra, Uva, Libro, Ancla. Conserva la tilde de Ú al leer las iniciales.
```

Read the hints against the current cards and rendered clues, then choose **Mark hints reviewed by the author**. The first hint explains positions, the second develops a partial chain, and the third reveals the solution and its accent.

This action records an author self-declaration. It does not record a human playtest or establish native-language quality. If you change the wording again, review the changed text again.

## 7. Check and carry both revisions

Choose **Check this revision**. Inspect the result: the six clues should determine one order, and the ordered initials should satisfy **BRÚJULA**.

> Botella → Reloj → Útil náutico → Jarra → Uva → Libro → Ancla

Choose **Compare these revisions**. Confirm that the English source retains its original labels, clues and required answer; the target retains the seven card roles and ordering structure. A successful mechanical comparison does not establish equivalent meanings or equal difficulty.

Use **Export checked episode** to keep the Spanish target and **Export checked comparison** to carry both revisions and their role mapping. A target-only export or unfinished draft does not carry the separate English comparison source.

## 8. Carry the author’s explanation

After the final comparison, expand **Explain your localization choices**. In **Localization notes**, enter the explanation in [author-notes.txt](author-notes.txt), or write your own account of the choices you actually made.

Choose **Attach notes to checked pair**, inspect the captured source and target identities, then use **Download notes with captured pair**. The file contains the notes and that exact checked comparison.

Use **Reopen notes and pair** in a fresh workbench to inspect the handoff. If you later edit either episode, check and compare the revised pair, review the explanation, and explicitly attach the notes again. Previously attached notes continue to describe the earlier captured pair.

## 9. Receive the result as a player

Use **Download playable HTML** for the finished target. Open the downloaded file directly in a browser; it works offline. The player’s interface-language choice controls its buttons and messages separately from the Spanish puzzle content.

- Check that the story describes the new collection without revealing the solution order.
- Inspect the singular **Útil náutico** clues and the three hints in their intended order.
- Arrange the cards correctly and submit **BRÚJULA**.
- Confirm that **BRUJULA**, without the accent, is rejected. Case and surrounding whitespace are normalized; accents remain meaningful.

The player and target-only export contain the puzzle. Keep the localization-notes file separately when you want to carry the author’s explanation and original comparison source.

## Completed handoff

| File | What it carries |
| --- | --- |
| [source.en.json](source.en.json) | Unchanged starting export from the original pack |
| [target.es.json](target.es.json) | New Spanish episode created through the authoring controls |
| [comparison.en-es.json](comparison.en-es.json) | Exact English source, new Spanish target and checked role mapping |
| [localization-notes.json](localization-notes.json) | That checked pair together with the authored explanation |
| [completed-player.es.html](completed-player.es.html) | Self-contained player for the completed target |
| [REHEARSAL.json](REHEARSAL.json) | Automated browser observations and downloaded-file hashes |
| [manifest.json](manifest.json) | Source/runtime identities and file inventory |

The supplied target is **adapted-754ab419-7c07-4143-a917-ff3a7ebbb4a9**, revision **19**. Its hint review is an author self-declaration at revision 19. Your own run receives a different target ID and may have a different revision count; retain those identities instead of replacing them with this example’s values.

## Provenance and rehearsal

Original Mapmaker content: [baf1fac28a73d6955ba80356d8220b8d32590f50](https://github.com/Jacob-Met/ludolingua/commit/baf1fac28a73d6955ba80356d8220b8d32590f50). Authoring runtime: [c3afac6e6be207a9dc6811e0fbfd9c81c4949ece](https://github.com/Jacob-Met/ludolingua/commit/c3afac6e6be207a9dc6811e0fbfd9c81c4949ece), from the maintained **0.6.0-notes.a424427c** release. The original pack’s offline runtime pin remains separate.

The actual downloaded authoring application matched all 87 runtime source files. Its browser controls produced the supplied target, comparison, notes and playable HTML. Fresh workbench sessions reopened and re-exported the JSON files exactly; the downloaded HTML completed the new target offline. Desktop and narrow layouts were inspected.

These are automated known-answer observations. No human participation, native-language assessment, semantic equivalence, equal difficulty or product-model inference is established. File hashes bind content; they do not authenticate an author.

For an automated rehearsal, [rehearse.mjs](rehearse.mjs) accepts the extracted maintained runtime, the original full Mapmaker pack, a new evidence directory and the author-notes text file. Set PLAYWRIGHT_MODULE to an existing Playwright index.mjs and CHROME_PATH to a sandbox-capable Chrome executable. It uses the maintained controls and writes evidence only to the new output directory.

```sh
node rehearse.mjs /path/to/episode-kit /path/to/original-pack/episode-packs/mapmakers-cabinet /path/to/new-evidence author-notes.txt
```
