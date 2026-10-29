# LUDOLINGUA

LUDOLINGUA explores puzzle localization that preserves encoded reasoning and discovery mechanics. This private repository contains an original English/Spanish first-episode contribution, with a local author/player receiver and a bounded mechanical verifier.

## Run the episode kit

Requires Node.js 22 or newer. No dependency installation, credentials or inference service is needed.

```sh
node episode-kit/serve.mjs
```

Open the printed loopback URL. Start with the English source, compare the literal Spanish translation, then inspect the coordinated adaptation and the frozen-label challenge. Use the player tab to solve without displaying the author result. Exports bind the complete episode to recomputed mechanical evidence and can be reopened through the receiver.

See [episode-kit/README.md](episode-kit/README.md) for CLI use, precise normalization rules, verification and packaging. The release archive contains the runnable source and a file manifest.

Version 0.2.0 adds comparison of a source episode with a target through an explicit
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

## What is established

The verifier exhaustively checks every order for two to eight cards. It counts clue-consistent orders independently of the target answer, then checks the extracted action. It distinguishes ambiguous clues, contradictory clues, action mismatches and a bounded impossibility witness for frozen labels.

This is a first-episode contribution, not the full LUDOLINGUA product. The examples are authored; NVIDIA/Nebius inference, native-language human playtests, cultural suitability and comparable difficulty are not established. The Spanish adaptation changes the card referents explicitly. Mechanical success is narrower than a successful localization.

## Custody

The selected LUDOLINGUA direction and original product ownership of `hamon-a19-20261027` are preserved. This isolated `episode-kit/` contribution does not modify the original prepared source tree or adopt the retired OFFCUT experiment. Its task is `ludolingua-first-episode-receiver-bd63af23`; the source-recovery checkpoint remains recorded separately.

No public release or competition submission is implied by this private contribution.
