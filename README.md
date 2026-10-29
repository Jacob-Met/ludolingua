# LUDOLINGUA

LUDOLINGUA explores puzzle localization that preserves encoded reasoning and discovery mechanics. This private repository contains an original English/Spanish first-episode contribution, with a local author/player receiver and a bounded mechanical verifier.

## Run the episode kit

Requires Node.js 22 or newer. No dependency installation, credentials or inference service is needed.

```sh
node episode-kit/serve.mjs
```

Open the printed loopback URL. Start with the English source, compare the literal Spanish translation, then inspect the coordinated adaptation and the frozen-label challenge. Use the player tab to solve without displaying the author result. Exports bind the complete episode to recomputed mechanical evidence and can be reopened through the receiver.

See [episode-kit/README.md](episode-kit/README.md) for CLI use, precise normalization rules, verification and packaging. The release archive contains the runnable source and a file manifest.

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
explicit choice to load the saved draft or keep the current edits. Reopened exports
and comparison mappings still need their own exports for durable retention.
Author draft recovery does not save separate player journals: download the play
record before closing its window. See the kit README for storage limits, conflict
controls and draft receiving instructions.

Version 0.3.1 adds bounded author guidance for inconsistent clues: one proven
conflicting set, current labels and direct links to the relevant editor controls.
It clears on edits and leaves analysis, checked exports and captured play sessions
unchanged. Other conflicts can remain; this does not identify the author's intent.

## What is established

The verifier exhaustively checks every order for two to eight cards. It counts clue-consistent orders independently of the target answer, then checks the extracted action. It distinguishes ambiguous clues, contradictory clues, action mismatches and a bounded impossibility witness for frozen labels.

This is a first-episode contribution, not the full LUDOLINGUA product. The examples are authored; NVIDIA/Nebius inference, native-language human playtests, cultural suitability and comparable difficulty are not established. The Spanish adaptation changes the card referents explicitly. Mechanical success is narrower than a successful localization.

## Custody

The selected LUDOLINGUA direction and original product ownership of `hamon-a19-20261027` are preserved. This isolated `episode-kit/` contribution does not modify the original prepared source tree or adopt the retired OFFCUT experiment. Its task is `ludolingua-first-episode-receiver-bd63af23`; the source-recovery checkpoint remains recorded separately.

No public release or competition submission is implied by this private contribution.
