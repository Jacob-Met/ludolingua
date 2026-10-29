# The Signal Panel / El panel de señales

An authored five-card episode expands the original four-card kit without changing its engine or player controls. Choose one of the Signal Panel entries in the episode selector, then use **Play the episode** or **Adapt & check**.

The signal panel has a brass button and five card slots. Its English source has two different cards with the same initial. The coordinated Spanish adaptation preserves the declared card roles and precedence relations while changing all five referents.

## Four versions

| Episode ID | Purpose |
| --- | --- |
| `en-signal-original` | A uniquely ordered English source. |
| `es-signal-literal` | Intentional negative example: literal labels preserve the order but fail to encode the Spanish command. |
| `es-signal-adapted` | A coordinated Spanish adaptation with the same unique role order. |
| `en-signal-ambiguous` | One clue is missing. Two distinct layouts spell the same word; the author check must still report ambiguity. |

The last example has valid individual attempts. Both layouts may work in the player while the author check refuses a claim of unique reasoning. It is not an unsolvable command. This same-word ambiguity is specific to the English labels; do not transfer that claim to the Spanish adaptation.

Clues use **before**, meaning somewhere earlier in the order. None of this episode's clues means **immediately before**. Hints differ between the complete and incomplete versions so the missing relation is not silently restored.

## Run and carry the evidence

From `episode-kit`, run `node serve.mjs` and open its printed loopback URL. Node.js 22 or newer is required. The interface can be English or Spanish independently of the authored episode. The existing draft, comparison and export behavior remains available. **Open a separate playtest** captures the chosen revision; download its play record before closing. Matching attempts in a record do not establish a unique global order.

For a command-line course, use new output paths:

```sh
node cli.mjs check en-signal-original
node cli.mjs check es-signal-literal
node cli.mjs check en-signal-ambiguous
node cli.mjs export en-signal-original /tmp/signal-source.json
node cli.mjs export es-signal-adapted /tmp/signal-adapted.json
node cli.mjs compare /tmp/signal-source.json /tmp/signal-adapted.json
node cli.mjs export en-signal-ambiguous /tmp/signal-ambiguous.json
node cli.mjs receive /tmp/signal-ambiguous.json
```

The literal and ambiguous checks intentionally exit 2. Successfully receiving the ambiguous export establishes integrity of that negative result, not a successful unique-order puzzle. The original six bundled episodes remain unchanged.

The independent tests in `tests/signal-panel.test.mjs` use fixed player-text witnesses and enumerate all 120 permutations. The real browser course in `tests/signal-panel-receiver.mjs` uses the existing Playwright and sandboxed Chrome runtime, with `PLAYWRIGHT_PACKAGE` and `LUDO_EVIDENCE_DIR` configured as in the main README. Run the maintained package builder and receive the extracted build before making delivery claims.

## Interpretation

The episodes were authored with ChatGPT. Retained model reviewers assessed the clues and language; this is not a native-human playtest. The Spanish literal version retains the referents; the coordinated adaptation changes them explicitly to recover the localized button action. Mechanical preservation does not establish equal difficulty, native-language clarity, cultural suitability or NVIDIA/Nebius model benefit. Those claims remain open.

Original LUDOLINGUA product custody stays with `hamon-a19-20261027`. This content contribution does not replace the existing first-episode, authoring or standalone-session work.
