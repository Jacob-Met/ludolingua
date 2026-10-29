# LUDOLINGUA episode, comparison and playtest kit — 0.3.0

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
server running while using the receiver; do not open the HTML as a `file:` URL.
The loopback HTTP origin supports the browser Web Crypto digest operation.
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

The archive contains source, fixtures, tests, startup instructions and a generated
`MANIFEST.json` with every included source file's byte length and SHA256. Archive
entries use fixed timestamps, ordering and permissions with no compression. Its
SHA256 is written to a separate `.sha256` file, never into its own manifest.
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
the enclosing kit version is 0.3.0.

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
The standalone page verifies the exported episode before starting. Keep using
the server URL rather than opening the HTML as a local file.

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
