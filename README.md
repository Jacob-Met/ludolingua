# LUDOLINGUA

Adapt language-dependent puzzles across languages while preserving how they are solved.
The puzzle here is an ordering-and-acrostic episode: arrange cards by the clues, read the first
letter of each card, and the letters spell the action that opens the door. A literal translation
breaks it (Otter, Pine, Eagle, Nest spell OPEN; their Spanish words spell NPÁN, not ABRE). A good
adaptation changes the words and keeps the solution. LUDOLINGUA asks **NVIDIA Nemotron on Nebius
Token Factory** to propose that adaptation, and the app's own deterministic checker decides whether
the mechanic survived.

Audience: puzzle and game localization teams, escape-room and educational-game authors.

## Quick start

Requires Node.js 22+. No npm install, no dependencies.

```sh
export NEBIUS_API_KEY=...        # Nebius Token Factory key; stays on the server, never sent to the browser
cd episode-kit
PORT=4410 node serve.mjs
# open http://127.0.0.1:4410
```

Pick a source puzzle, press **Adapt with Nemotron**, read the checks, and download the verified export.
Without a key the page says so and everything else (workbench, comparison, player, CLI) still works offline.

```sh
cd episode-kit && node --test tests/*.test.mjs     # all tests run without network or key
```

## How it uses NVIDIA Nemotron on Nebius Token Factory

- **Runtime call.** `POST /api/adapt` on the local server calls
  `https://api.tokenfactory.nebius.com/v1/chat/completions` (OpenAI-compatible, `lib/nebius.mjs`) with the
  key from `NEBIUS_API_KEY`.
- **Model.** Default `nvidia/nemotron-3-super-120b-a12b`. The task is a constraint puzzle (find words whose
  first letters spell a target in a fixed order, keep the story coherent, write natural target-language
  text), which small models often get wrong; the 120B-A12B reasoning model gets it right in one pass most
  of the time while staying fast and cheap because only 12B parameters are active. Nemotron 3 Nano
  (30B-A3B) and Ultra (550B-A55B) are selectable in the UI.
- **What Nemotron does.** Given the source cards in solved order, the clues and the story, it proposes
  new target-language labels, the localized action word, title, story and hints.
- **How its output is checked.** The model never decides anything. `lib/nemotron-adapt.mjs` builds the
  adapted episode and runs the existing engine and comparison code: the episode must be valid, have exactly
  one clue-consistent order, that order's initials must spell the action, and the comparison engine must find the
  same solution order as the source under the role mapping. A rejected proposal is sent back to Nemotron with
  the checker's exact reasons (up to 3 attempts); if none pass, nothing is accepted. The browser re-runs the
  same checks on the returned episode instead of trusting the server's verdict.
- **Provenance.** Accepted episodes record in their change log that Nemotron proposed the wording. Mechanical
  agreement is not human validation.

## Honest limits

- The checker proves the encoded mechanic (order set and initials). It does not judge whether the Spanish
  reads naturally, whether hints leak the answer, or difficulty. Those need native-speaker playtests.
- Only English and Spanish, first-letter acrostic episodes with 2 to 8 cards.
- The interface of the adaptation bench is English only; the workbench has English and Spanish controls.
- Model quality varies between runs; the retry loop and checker are what make the result trustworthy.

## The rest of the kit

The workbench (`/web/index.html`) compares a source and a target card by card with typed clue relations,
inspects solution mechanics, edits labels, clues and hints, and exports digest-bound evidence. The player
(`/web/playtest.html`) records playtest journals. Everything below is the original kit documentation.

LUDOLINGUA explores puzzle localization that preserves encoded reasoning and discovery mechanics. This private repository contains an original English/Spanish first-episode contribution, with a local author/player receiver and a bounded mechanical verifier.

## Run the episode kit

Requires Node.js 22 or newer. The kit needs no installation or credentials; only the Nemotron adaptation needs NEBIUS_API_KEY.

```sh
node episode-kit/serve.mjs
```

Open the printed loopback URL. Start with the English source, compare the literal Spanish translation, then inspect the coordinated adaptation and the frozen-label challenge. Use the player tab to solve without displaying the author result. Exports bind the complete episode to recomputed mechanical evidence and can be reopened through the receiver.

See [episode-kit/README.md](episode-kit/README.md) for CLI use, precise normalization rules, verification and packaging. The release archive contains the runnable source and a file manifest.

The author workbench also lets you edit the episode title and story directly.
Wording edits preserve their exact text in drafts and exports, clear prior checks,
and leave an already-open player's captured scene unchanged. Earlier local drafts
still reopen with the wording of their original bundled episode. Empty wording can
be saved as an unfinished draft, but needs completion before episode verification.

The integrated action-authoring controls let authors explicitly edit the required
action alongside labels, clues and hints. Every action edit clears earlier
episode and comparison checks and resets the workbench player. An already-open
separate playtest keeps its captured revision. Recheck and export to carry the
authored action into a verified receiving flow; matching mechanics still leaves
human review open.

Version 0.2.0 introduced comparison of a source episode with a target through an explicit
card mapping and typed clue relations. Comparison exports bind both complete
episodes, their mapping and the comparison engine version, then recompute on
receive. This supports inspecting encoded preservation and failures; it does
not turn mechanical agreement into a claim of human or model validation.

Version 0.3.0 adds a dedicated player session record and replay-based receiving.
The exported journal binds the exact episode, session label and recorded actions;
the author receiver and CLI recompute its summary. It can retain failed attempts,
hints and reveals. These client records and self-reported timings do not attest
human identity, native-language proficiency, unaided solving or model use.

A new empty player window can continue a verified saved play record. It restores
the captured puzzle and recorded state, preserves the session identifier and prior
events, and appends later actions to that history. Use the newest download in one
window and download again before leaving. Closed or unrecorded time and unsubmitted
answers are not recovered; there is no automatic save or cross-window merge.

The workbench and separate player each let you choose English or Spanish
interface controls independently of the authored puzzle. A launched player
inherits the author's interface choice; standalone play defaults from the
browser. Switching controls leaves the episode, comparison evidence and recorded
play journal unchanged. It does not translate authored content or establish
native-language review. See the kit README for the complete launch, download,
reopen and locale verification instructions.

Bundled author episodes can recover unfinished drafts in the same browser profile
and exact server origin. Wait for the saved status before leaving; restored drafts
need fresh checks and are not verified exports. Cross-tab conflicts require an
explicit choice to load the saved draft or keep the current edits. Original and
reopened episodes can be kept with **Download unfinished draft**, including incomplete
words, clues and hints; **Reopen a draft** restores those edits for a fresh check.
Comparison mappings still need their own exports for durable retention.
Author draft recovery does not save separate player journals: download the play
record before closing its window. See the kit README for storage limits, conflict
controls and draft receiving instructions.

Version 0.3.1 adds bounded author guidance for inconsistent clues: one proven
conflicting set, current labels and direct links to the relevant editor controls.
It clears on edits and leaves analysis, checked exports and captured play sessions
unchanged. Other conflicts can remain; this does not identify the author's intent.

## Give a learner an offline player

Choose **Download playable HTML** in the author workbench to capture the current
puzzle as one file. A learner can open that HTML directly in a browser without
running the author server or installing anything. The file includes the maintained
player, puzzle and styles, with English or Spanish controls independent of the
puzzle language. Later author edits need a new download.

Start the included puzzle or continue a downloaded play record. Download the
newest record before closing or reloading; there is no automatic player save.
Keep the checked episode JSON as the editable author copy. The kit README covers
offline receiving, continuation, and the generated player's maintenance checks.

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
Download an unfinished draft before closing or reloading; use a checked episode
export when you want to keep mechanical results. If the new window cannot open, choose
**Download starting episode**, open a workbench and use **Reopen an export**.
The downloaded file carries the same starting episode and recomputable result.

Mechanical checks cover encoded ordering and extraction. They do not evaluate
the writing or establish human playtesting, equivalent difficulty or model use.

## What is established

The verifier exhaustively checks every order for two to eight cards. It counts clue-consistent orders independently of the target answer, then checks the extracted action. It distinguishes ambiguous clues, contradictory clues, action mismatches and a bounded impossibility witness for frozen labels.

This is a first-episode contribution, not the full LUDOLINGUA product. The examples are authored; NVIDIA/Nebius inference, native-language human playtests, cultural suitability and comparable difficulty are not established. The Spanish adaptation changes the card referents explicitly. Mechanical success is narrower than a successful localization.

## Custody

The selected LUDOLINGUA direction and original product ownership of `hamon-a19-20261027` are preserved. This isolated `episode-kit/` contribution does not modify the original prepared source tree or adopt the retired OFFCUT experiment. Its task is `ludolingua-first-episode-receiver-bd63af23`; the source-recovery checkpoint remains recorded separately.

No public release or competition submission is implied by this private contribution.

## The Signal Panel

A second authored English/Spanish episode uses five cards, including two English cards with the same initial. Play its complete source and coordinated adaptation, then inspect the missing-clue version: two different layouts can spell the same word while the author check correctly reports ambiguous reasoning. The literal Spanish version is an intentional negative example.

Choose a Signal Panel entry in the episode selector. [The episode guide](episode-kit/SIGNAL-PANEL.md) explains the four versions, player-versus-author distinction, CLI course and evidence limits. The existing six episodes and engine remain unchanged.

Use **Start an adaptation in another language** to make a separate target from the
current original revision. The original is captured for comparison; stable card roles,
clues and constraints carry over, while the target uses the chosen content language.
All wording initially remains unchanged and requires the author's translation and
review. Download unfinished target work as a draft; export a checked comparison to
carry both full versions and their role mapping.

## Explain localization decisions

**Explain your localization choices** lets you write notes about changed referents,
wording, clues or actions. Compare the pair and choose **Attach notes to checked pair**.
Download the notes with both complete captured revisions and their role map. Reopening
verifies the file and restores that pair and your exact notes; the explanations remain
author statements. Later edits mark the notes as attached to an earlier pair. Compare
and explicitly attach again to carry your notes with newer revisions. An unfinished
episode draft does not save these notes; download them before closing the tab.
