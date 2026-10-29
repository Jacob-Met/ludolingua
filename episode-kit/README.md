# LUDOLINGUA episode, comparison and playtest kit — 0.3.8-portable.1b623a99

Private authored English/Spanish ordering-and-acrostic fixture for task
`ludolingua-first-episode-receiver-bd63af23`. Original product ownership remains
with `hamon-a19-20261027`; this isolated contribution does not replace the original
source tree. It is not the complete product, model integration, or a native human
playtest. Semantic changes are explicit in each episode's provenance.

Requires Node.js 22 or newer; packaging requires Python 3.9 or newer. No application
dependencies, installation, credentials, or network services are required.

```sh
cd episode-kit
node cli.mjs list
node cli.mjs check en-original
node cli.mjs check es-literal
node cli.mjs export es-adapted /tmp/adapted.json
node cli.mjs receive /tmp/adapted.json
node cli.mjs check /tmp/adapted.json
node serve.mjs
```

Open `http://127.0.0.1:4173` (or the local URL printed by the server). Keep the
server running while using the author workbench and source player pages. Open
those source pages through the printed HTTP URL. A separately downloaded playable
HTML file supports direct offline opening, as described below.
Use **Set the scene** to edit the episode title and the story shown to players.
Wording stays in the episode's language when you switch interface controls.
Edits advance the revision, clear old checks and exports, reset the embedded
preview, and mark hints for author review. Existing separate players retain their
captured scene; a new launch takes the current title and story. Empty or
whitespace-only wording can remain in an unfinished draft, but the existing
validator rejects it until you supply nonempty text. Line breaks and Unicode
content are preserved. Mechanical checks do not evaluate the writing.

The author view supports editing labels, the **Required action**, typed ordering
clues and hints. The action is an explicit author choice: the initials in a
clue-consistent order must still spell it. Editing the action advances the
revision, clears previous episode and comparison evidence, resets the workbench
player, and marks hints for author review. An already-open separate playtest
keeps its captured revision. Empty or whitespace-only actions remain invalid
until the author supplies a value. Recheck before exporting; reopening an
episode or comparison restores its complete authored action.

For an English authoring example, change the four labels to Pine, Lily, Aspen,
and Yew. The original clue order now spells PLAY while the old required action
is OPEN, so the check fails. Explicitly change **Required action** to PLAY and
check again. The same clue order now passes; the story and hints still require
human review for the changed action. Player mode hides author controls and
separates solving from deliberate answer reveal.
Player feedback distinguishes a clue-order error, initials that do not encode the
required action, and a mistyped answer. A typo after a valid extraction prompts a
retry in the chosen UI language without revealing the action.

Use the **UI language** selector to choose English or Spanish for the receiver's
interface independently of the episode's language. Changing UI language does not
translate or edit authored story, card labels, hints, or provenance. Source and
target episodes remain their original evidence; changing the interface language
does not change puzzle answers, comparison mappings, digest-bound exports, or
mechanical results. A Spanish interface is not evidence that an episode has been
translated or reviewed by a native speaker.
`check` exits 0 for mechanical success, 2 for valid negative cases, and 1 for
invalid input. `receive` exits 0 when content and recomputed analysis agree,
including a faithfully exported negative case. Inspect `mechanicalSuccess` and
`outcome`; integrity success alone is not puzzle success. Export refuses to
overwrite an existing output file.

Extraction takes the first Unicode code point of each trimmed NFC label and
uppercases it without locale-specific conversion. Accents remain significant.
Uppercase expansion can produce multiple code points (for example ß becomes SS).
Answers use trim, NFC, then uppercase. Ordering solutions are counted independently
of the expected answer. Mechanical checks do not establish language quality,
cultural suitability, equivalent difficulty, or an actual model contribution.

Export hashes the entire episode, including attribution and extra JSON fields,
using SHA256 over recursively key-sorted canonical JSON. Import verifies schema,
episode validity, current digest, engine version, recomputed analysis and fixed
evidence limits. The reader never inherits a supplied pass claim. This is content
integrity, not a cryptographic signature or independent provenance attestation.
Edit the episode and export again to create a current result.

## Share a puzzle as one offline HTML file

In the author workbench, choose **Download playable HTML** (Spanish: **Descargar
HTML para jugar**). The download captures the current valid episode revision
and the selected interface language. Open that one HTML file directly in a
browser, or give it to a learner. It includes the player, styling and puzzle;
the learner does not need Node.js, a server, an internet connection, or other files.

Choose **Start this puzzle** to begin a new record for the included episode.
English and Spanish controls remain independent of the authored puzzle language.
The downloaded file keeps its captured revision. Later author edits require a
new download; if the episode changes while a download is being prepared, that
download is cancelled with a request to try again.

Choose **Download play record** before closing or reloading. To continue later,
reopen the HTML and use **Continue a saved play record** with the newest JSON
record. Continuation opens the exact puzzle captured in that record, which may
differ from the puzzle originally included in the HTML. It keeps the recorded
session identifier and earlier events. There is no automatic save or recovery
of unsubmitted answer text. Continue a record in one window and download again
to retain the extended history.

Playable HTML is a player copy. Keep the checked episode JSON to reopen and edit
the puzzle in the author workbench. Both formats contain the complete authored
puzzle, including its answer. Valid ambiguous or unsuccessful puzzles can still
be downloaded; a playable file does not certify unique reasoning or puzzle quality.
Downloaded play records use the same existing verifier and evidence limitations.

The maintained receiving course opens the actual workbench download through
`file://` in sandboxed Chromium with networking disabled, after moving and
renaming it. It exercises English/Spanish controls, mobile layout, literal markup
and Unicode, recorded play, continuation and a stopped author server. Other
browser engines have not been qualified by that course.

```sh
PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright \
LUDO_EVIDENCE_DIR=/absolute/path/outside/episode-kit/portable-evidence \
node tests/portable-receiver.mjs
```

### Maintain the generated player

The checked-in `web/portable-player-bundle.json` is generated from the maintained
player modules, HTML and CSS. Its sorted source inventory binds their exact bytes
and the build script/toolchain. The exporter verifies the bundle before embedding
it. This freshness and integrity check is a content binding, not a signature.

Ordinary use, tests, and packaging do not require a compiler or dependency
installation. Packaging runs the following compiler-free check before creating
any archive or checksum. A missing or stale bundle stops packaging:

```sh
node scripts/build-player-bundle.mjs --check
```

After changing a recorded source, regenerate with the development-only
`esbuild` version pinned in `scripts/portable-toolchain.json` (currently 0.28.2).
Keep the compiler and its downloaded package outside this source tree:

```sh
LUDO_ESBUILD_BINARY=/absolute/path/to/esbuild \
node scripts/build-player-bundle.mjs
node scripts/build-player-bundle.mjs --check
```

The build uses esbuild's browser IIFE output and checks that the dependency graph
has one JavaScript output, no runtime imports, and no unhandled external assets.
Player, engine and record source modules remain the maintained implementation.
Rebuild and repeat the offline receiving course when those inputs change.

## Create an original episode

From the workbench, choose **Create an original episode**. Enter a title, story,
required action and two to eight card names, with one name per line. Each name
must start with a letter. Select English or Spanish as the puzzle's language;
changing the interface language preserves your writing.

**Create starting episode** prepares a checked export with no clues or hints.
All card orders are still possible, so its integrity check does not mean the
puzzle is solved. **Open in a new workbench** gives that episode its own tab,
ready for clue authoring and a fresh check. The existing workbench, selected
fixture and saved drafts remain unchanged.

For a small example, use Sun, Apple and Yarn with the action SAY. Add a clue
that Sun comes before Apple, then a clue that Apple comes before Yarn. The
workbench narrows six possible orders to three, then one. Try the resulting
puzzle in the player and export the checked episode to keep the complete work.

New originals stay in their tab rather than becoming bundled fixture drafts.
Export before closing or reloading. If the new window cannot open, choose
**Download starting episode**, open a workbench and use **Reopen an export**.
The downloaded file carries the same starting episode and recomputable result.

Mechanical checks cover encoded ordering and extraction. They do not evaluate
the writing or establish human playtesting, equivalent difficulty or model use.

The original-authoring browser course uses the same existing runtime:

```sh
PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright \
LUDO_EVIDENCE_DIR=/absolute/path/outside/episode-kit/original-authoring-evidence \
node tests/authoring-receiver.mjs
```

It exercises real original creation, independent workbenches and saved-draft
preservation, clue editing, player attempts, downloads and reopening. It also
checks popup fallback, English/Spanish controls, narrow layout, card-count
boundaries, stale form results and one-time receiving under delayed or invalid
messages. Read its receipt and inspect the screenshots after execution; the
script itself is not a claim of completed browser or human acceptance.

## Recoverable author drafts

Bundled episodes save the title, story, label edits, ordering clues, the required
action, exact hint text, author-declared hint review, the frozen-label flag, and the revision in this
browser. Wait for **Draft saved in this browser** before closing or reloading.
Returning to an episode restores its own unfinished draft, including empty labels.
Every restored revision needs a fresh check; drafts never store verification results.
**Discard draft** resets only the selected episode to its bundled original.
Earlier draft records still restore their edits together with their original
source title and story. Reading them does not rewrite saved bytes; your next edit
saves the current wording as well. Malformed new records retain the same explicit
conflict and preservation behavior as earlier drafts.

Drafts belong to the same browser profile and exact origin (scheme, host and port).
Use the same `http://127.0.0.1:4173` address when returning. They are local convenience,
not a backup or server sync; clearing browser data removes them. With blocked storage,
quota errors, or no Web Locks support, edits remain in the current tab only and the
workbench says so. Browser tab memory survives episode switches but not closing.

If another tab saves the same episode, automatic saving pauses. **Load saved draft**
replaces this tab's content with the saved version and clears its old check.
**Keep these edits** explicitly replaces the saved version with this tab's content.
Malformed or source-incompatible saved data is preserved until you choose to keep
the current edits or discard that draft. Loading such data never grants approval.

Reopened exports retain full digest and mechanical verification. They are separate
from bundled drafts even when episode IDs match; edits to reopened content remain
in this tab when switching episodes. Export the checked revision to keep those
changes after closing. Comparison sources and role maps still require a checked
comparison export to keep them after closing. Draft restoration clears both episode
and comparison checks. Drafts do not change the CLI or exported episode format.

Author draft recovery does not persist a separate player session or its journal.
Download the play record before closing that window; restoring an author draft
does not update an already-open player's captured episode.

Maintainer verification and deterministic packaging:

```sh
node --test tests/*.test.mjs
python3 scripts/package.py --output ../ludolingua-episode-kit.zip
```

The browser locale receiver requires an existing Playwright package and sandboxed
Chrome at `/usr/bin/google-chrome-stable`. Run it separately from the unit tests:

```sh
PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright \
LUDO_EVIDENCE_DIR=/absolute/path/outside/episode-kit/locale-evidence \
node tests/locale-receiver.mjs
```

`PLAYWRIGHT_PACKAGE` must contain `index.mjs`. The receiver starts its own loopback
server and writes `locale-receipt.json`, downloaded exports and screenshots to
`LUDO_EVIDENCE_DIR`. It checks Spanish browser defaults, English fallback,
interface switching, preserved draft/player state, pending imports, and export
integrity. Inspect the receipt and rendered screenshots; an available test script
alone does not establish browser acceptance or visual quality.

The action-authoring receiver uses the same environment variables:

```sh
PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright-core \
LUDO_EVIDENCE_DIR=/absolute/path/outside/episode-kit/action-evidence \
node tests/action-receiver.mjs
```

It exercises explicit action edits, player success and failure gates, actual
export/reopen flows, interface-language preservation, and delayed completions.
Its receipt and screenshots are evidence only after an actual successful run.

The wording browser course uses those environment variables with
`node tests/wording-receiver.mjs`. It exercises title/story edits, old and new local
drafts, exact episode and comparison downloads, frozen and newly launched player
scenes, interface language, and the 390px author flow. The separate
`tests/wording.test.mjs` covers versioned draft shapes and conflict preservation.
A maintained test script is not a claim that a receiving run has completed.

The draft browser regression course uses the same runtime requirements:

```sh
PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright \
LUDO_EVIDENCE_DIR=/absolute/path/outside/episode-kit/draft-evidence \
node tests/receiver-drafts.mjs
```

The archive contains source, fixtures, tests, startup instructions and a generated
`MANIFEST.json` with every included source file's byte length and SHA256. Archive
entries use fixed timestamps, ordering and permissions with standard ZIP DEFLATE
level 6 compression. Repeated builds from the same source and Python/zlib runtime
are byte-identical; different compressor versions may encode the same contents
differently. Its SHA256 is written to a separate `.sha256` file, never into its own manifest.
Output must be outside the source directory and must not already exist. Missing
output parent directories are created. Both archive and sidecar paths must be new.
Keep receipts, screenshots, downloaded episodes, credentials and other private
working material outside `episode-kit`: the builder includes all non-hidden
source-tree files except dependency/cache directories, and is not a secret scanner.
The browser receiver currently limits imported JSON to 20,000,000 bytes.
Compare
the sidecar hash after download and verify manifest entries after extraction.
Native execution and consumer receiving must be recorded separately; these
instructions are not a claim that checks have run.

## Compare an authored source and target

The comparison workflow keeps the source episode separate from the editable
target. Map source card IDs to target card IDs explicitly when their identities
differ. Typed clues encode `before`, `immediately_before`, or `after`; displayed
clue wording is generated from those relations. This does not parse arbitrary
translated prose or certify a translator's intent.

CLI inputs may be raw episode JSON or verified episode exports. Mapping JSON is
an array such as `[{"sourceId":"key","targetId":"key"}]`, with a complete
one-to-one entry for every source card; omit the file to use the core's default
identity mapping. A one-entry example is illustrative, not a complete four-card
mapping.

A mapping file containing JSON `null` also selects the default equal-ID mapping
in both CLI comparison commands. The CLI normalizes this convenience before
calling the strict comparison core, whose direct API requires an array or an
omitted argument.

```sh
node cli.mjs compare source.json target.json
node cli.mjs compare source.json target.json mapping.json
node cli.mjs comparison-export source.json target.json comparison.json mapping.json
node cli.mjs comparison-receive comparison.json
```

Comparison exports snapshot both full episodes and the selected mapping and bind
them with the comparison engine version. Receiving recomputes the comparison,
rejecting stale results, forged claims or changed source/target attribution.
Successful receiving proves integrity even when the comparison is negative;
inspect its result before interpreting it as a successful adaptation. It does
not establish native-language clarity, equivalent difficulty, cultural quality,
or a real model contribution. Outputs are new files; existing files are never
silently overwritten.

`compare` exits 0 only when `mechanicalPreserved` is true, 2 for a valid negative
comparison, and 1 for invalid input. Preservation requires equal nonempty sets
of clue-consistent orders under the mapping and mechanical success of both
episodes. `sameOrderSet` alone is insufficient: two contradictory puzzles can
have equal empty sets. Comparison export and receiving exit 0 for a valid
negative comparison as well; their success is an integrity result. The episode
engine and comparison engine each retain their own version, currently 0.1.0;
the enclosing kit version is 0.3.8-portable.1b623a99.

Both the default mapping marker (`null` in an export) and any explicit mapping
array are digest-bound. The result also includes the resolved canonical mapping.
Hints, story, provenance, and authored review flags remain bound as episode
content; an authored review flag is not evidence of a native human playtest.

## Keep and receive a player session record

Start the local server with `node serve.mjs`, then open the author workbench at
`http://127.0.0.1:4173/` (use the printed port if different). Select an episode,
make the desired edits, and choose **Open a separate playtest**. This captures
the current valid episode revision at the moment you click. Later author edits
do not change the already-open session. Each player window accepts one episode
and creates its own session identifier.

The separate player also has its own **UI language** selector. A window launched
from the author workbench starts with the author's selected interface language;
a standalone window defaults from the browser. Changing this selector changes
presentation only: it does not translate the authored puzzle, replace the fixed
episode revision, clear the recorded journal, or change its evidence. You can
therefore use English controls for a Spanish puzzle, or Spanish controls for an
English puzzle. This choice is not evidence of the player's language proficiency.

If the browser blocks the popup, export the checked episode from the workbench,
open `http://127.0.0.1:4173/web/playtest.html`, and choose that episode export file.
The standalone page verifies the exported episode before starting. These source player pages use the server URL. For a player that opens directly
as a local file, use **Download playable HTML** in the author workbench.

In the player window, try an order and answer, optionally use hints or reveal,
then choose **Download play record** (Spanish: **Descargar registro de juego**).
Download before closing or reloading: sessions have no persistent browser
storage. Resetting keeps earlier attempts, hints and reveals in the journal;
it does not erase their history. Open a new player window for a fresh session.

Back in the author workbench, choose **Reopen a play record** and select the
downloaded record JSON. Its replayed summary and journey refer to the recorded
revision and do not replace your current authored episode. You can also inspect
the record with the CLI:

```sh
node cli.mjs playtest-receive playtest-record.json
```

Receiving snapshots the full episode, session identifier and event journal,
replays the journal, and checks the recomputed result and version-bound hashes.
Exit 0 means the record passes integrity and replay checks; exit 1 means malformed,
stale or forged data was rejected. A valid record may show failures, hints or a
solution reveal. Successful receiving does not mean successful solving.

Keep the downloaded JSON file itself, then reopen that file in the author
receiver or pass its path to `playtest-receive`; a screenshot of the summary is
not a replayable record. The record refers to its captured episode revision,
not any later author edits. Records are bounded to 10,000 events and the episode
engine's two-to-eight-card limit. `successfulAttempts` counts individual attempts
that satisfy the encoded clues and answer, not certification that the entire
episode has unique reasoning or that a person solved it unaided.

These are client-recorded events with self-reported timing. They do not attest
human identity, native-language status, independent participation, linguistic
quality or model contribution. A session identifier is a label, not an identity
credential. Even a journal without a recorded reveal does not establish an
unaided attempt or rule out assistance outside the player window. Hashes make
content changes detectable against their retained binding; they are not signatures
and cannot authenticate the client that authored a consistent record.

## Continue a saved play record

Download the play record before closing or reloading the player. To continue,
open a new, empty player window at the server's `/web/playtest.html` address, or
reopen a downloaded playable HTML file, and choose **Continue a saved play record** (Spanish: **Continuar un registro de juego
guardado**). Select your newest downloaded record JSON. An already-open session
keeps its current episode and history; it cannot be replaced by an import.

The player verifies the complete record before opening it. It restores the exact
captured episode, card order, visible hints, revealed solution and previous
attempt feedback. It retains the same session identifier and every earlier event.
Unsubmitted answer text was never recorded and does not return. Interface language
remains separate from the captured puzzle's language.

New actions append to the existing journal. Their elapsed time continues from the
last recorded event plus time in the reopened window; closed time and any earlier
unrecorded time are not recovered. These timings remain client-reported. Download
again to keep the extended record. There is no automatic save or cross-window sync.

Continue a given record in only one window. Earlier downloads and a later prefix
extension count as one session in cohort review, while divergent continuations of
the same session are rejected as conflicting histories. A record already at the
10,000-event limit can be reopened and downloaded, with play controls disabled.

Malformed, oversized, altered or unsupported records are refused before a session
is adopted. The existing narrow support for original 0.1.0 play records also
applies to continuation. A failed import leaves both file choices available.

The maintained receiving course uses a real player download, closes that player,
continues its record in a fresh window, downloads the extension and verifies the
existing cohort interpretation. It also covers explicit synthetic boundary cases:

```sh
node tests/playtest-continuation-receiver.mjs \
  --app-root /absolute/path/to/episode-kit \
  --playwright /absolute/path/to/playwright/index.mjs \
  --browser /absolute/path/to/chrome \
  --out /absolute/path/outside/episode-kit/continuation-evidence
```

## Summarize downloaded play records

Keep each player's downloaded record JSON. In the author workbench, go to
**See how the puzzle is played.** and choose **Review multiple play records**
(Spanish: **Revisar varios registros de juego**). Select the downloaded JSON files
together in the file picker. The workbench verifies every selected record and
displays totals for each exact captured episode revision. The selection replaces
the previous batch; it does not append to it. Select all the files you want in
the report each time.

The summary shows the number of verified files, distinct recorded session IDs,
repeated downloads excluded, and earlier snapshots replaced. Each episode group
shows its title, ID, revision, content language, full SHA-256 and recorded totals.
These belong to the imported records, even if you are currently editing a
different episode. Reviewing a batch does not change your authored episode,
draft, revision or checks. Switching **UI language** translates the review
controls and labels without translating the captured content or regrouping it.

While a new selection is checked, the previous verified report remains visible
with a notice identifying it as the previous report. If any selected file fails,
the whole new batch is rejected: the previous report stays visible and explicitly
excludes the rejected selection. If there is no previous report, no totals are
shown. A later selection supersedes an unfinished earlier selection; an old read
finishing afterward cannot replace the newer result. Reloading or closing the tab clears the displayed report. Keep the original
downloaded files to recreate it.

**Reopen a play record** remains a separate, independent review for one session's
event journey. Opening or replacing that single-record review does not replace
the multi-file report, and reviewing a batch does not replace the single-record
journey. Use it to inspect the attempts and assistance behind an aggregate count.

The same aggregation is available through the maintained CLI:

```sh
node cli.mjs playtest-cohort player-a.json player-b.json
```

The standalone `node playtest-cohort.mjs <record1.json> [record2.json ...]`
entry point produces the same report. Every input passes through the maintained
record reader, including its narrow support for historical 0.1.0 records.
Altered bindings, replay results, or evidence claims reject the entire request.
Exit 0 means every input was verified; it does not mean a player succeeded.
Exit 1 emits an error without a partial cohort report.

Reports group the exact captured episode content by SHA-256. Two episodes with
the same displayed ID or revision but different content remain separate.
Repeated downloads of one session count once. If one download extends an earlier
journal from that session, the longest valid history supplies its totals;
`duplicateFiles` counts additional copies of the same verified normalized
journal, including equivalent historical and current encodings.
`supersededSnapshots` counts distinct shorter prefixes that did not add sessions.
Conflicting histories or episode content under one session ID reject the entire
report. Session IDs are client-created labels, so distinct IDs do not establish
distinct people.

Each group reports recorded attempts, successful attempts, moves, hints and
resets, plus the number of sessions containing a success, hint or reveal. An
earlier success still counts when a later attempt failed; a reset does not erase
recorded assistance. Empty journals remain valid unfinished sessions with zero
attempts. Self-reported elapsed times are deliberately excluded.

Both routes accept 1–100 files, with at most 20,000,000 bytes (20 MB) per file
and 40,000,000 bytes (40 MB) combined. The browser checks the entire selection's
file count and sizes before reading any contents. The CLI requires regular files
and checks each file's size and the running total before reading that file.
Keep the downloaded files unchanged during the command. The report preserves explicit limitations: these
client-recorded outcomes do not establish human identity, unaided solving,
native-language proficiency, translation quality or comparable difficulty.
Use the original record files to inspect individual journeys.

The maintained browser course uses the same existing Playwright/Chrome setup and
`PLAYWRIGHT_PACKAGE` / `LUDO_EVIDENCE_DIR` variables described above:

```sh
node tests/playtest-cohort-receiver.mjs
```

It downloads real player journals, passes those files to the maintained CLI,
checks duplicate and superseded snapshots, and rejects a corrupted record.
Its receipt and screenshot describe an actual run only after it has completed.

## Long imported content

Long titles, reference URLs, card labels and authored notes wrap within the
author, comparison and player views. The display keeps the complete content;
exports retain the original strings and evidence. This display improvement
does not change schema limits or puzzle mechanics.

The content receiver exercises valid long imported content at 390px and 1280px,
including captured-source previews, English/Spanish controls, player hints and
actual export/reopen integrity. Use the same existing Playwright/Chrome setup
as the other browser receivers and keep its evidence outside the source tree:

```sh
PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright \
LUDO_EVIDENCE_DIR=/absolute/path/outside/episode-kit/content-evidence \
node tests/content-receiver.mjs
```


## Find a conflicting set of clues

When a valid episode has no clue-consistent order, the author result can show one
proven conflicting set using the current labels and clue numbers. **Edit clue**
focuses that clue's left-card control; a text badge and outline identify all
participating rows. Editing clears the explanation and requires a fresh check.
Interface changes translate the guidance while preserving the authored clue text.
The explanation is hidden with the other author controls in player mode.

The selected set cannot all hold together. It does not identify the author's
mistake, prove a globally smallest or unique conflict, or guarantee that one edit
resolves every contradiction. It uses the same ordering predicate as the verifier,
including adjacency. Required-action mismatch and ambiguity are separate outcomes.
Malformed or unfinished clues remain on the ordinary invalid-input path.

Diagnostic work is bounded across all searches (at most 1,000 raw clues, 64 distinct
constraints, 50,000 visited full orders and 200,000 predicate evaluations). If that
budget is insufficient, the result keeps the accurate inconsistency finding and
says that a detailed explanation is unavailable; it does not display a partial
proof. Analysis and exported verification fields remain unchanged. A checked
negative result can still be exported and verified on reopening.

The clue-diagnostic receiver uses the existing Playwright/Chrome setup:

```sh
PLAYWRIGHT_PACKAGE=/absolute/path/to/playwright \
LUDO_EVIDENCE_DIR=/absolute/path/outside/episode-kit/clue-evidence \
node tests/clue-conflict-receiver.mjs
```

### Reopening records from the first playtest draft

The receiver also accepts the original 0.1.0 playtest records whose saved final
attempt predates the `tokenMatches` field. It replays the complete captured episode
and journal, verifies every historical validation and evidence field against the
original representation and binding, then returns current derived validation.
The episode, session identity, event order, answers, hints, reveals and resets
remain unchanged. An earlier failed attempt remains a failed attempt.

This is a narrow compatibility rule. An explicitly supplied incorrect or null
`tokenMatches`, an altered result or evidence claim, a mismatched digest, or an
unsupported version is still rejected. Returning current validation does not
modify the original downloaded file. The author record viewer remains a review
of the saved journey. To append new actions, use **Continue a saved play record**
in a new, empty player window; it preserves the original session identifier.

Hashes establish consistency with the supplied episode and events, not who
authored them. A fully consistent replacement history can still be authored by
a caller. The native fixtures record the exact historical engine/writer blobs
and immutable old-record hashes in `tests/fixtures/playtest-v0.1-provenance.json`.
