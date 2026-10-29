# Coastal Bearing

An original coastal navigation puzzle in English and an authored Spanish adaptation. Work out the order of five labelled plates and recover a missing bearing.

## Play

You need Node.js 22 or newer and a browser. From the extracted bundle:

    cd episode-kit
    node serve.mjs

Open the local address printed by the server. In the author view, use **Reopen an export** to select a file from `episode-packs/coastal-bearing/exports/episodes/`:

- `01-en-source.json` — English puzzle.
- `03-es-adapted.json` — Spanish adaptation.

Select **Open a separate playtest** to play with author controls concealed. For the least spoiled experience, have someone else load the episode and open the playtest before you begin. The author view exposes the puzzle's construction; save REVIEW.md and comparison files until after playing.

## Review the localization

`02-es-literal-contrast.json` is a deliberately unsuccessful contrast example, not the recommended Spanish play experience.

REVIEW.md explains the authored change and semantic tradeoff. **It contains spoilers.** Checked comparisons are in `episode-packs/coastal-bearing/exports/comparisons/`:

- `source-vs-literal.json`
- `source-vs-adapted.json`

Use **Reopen a comparison** in the author view to inspect them.

## Source and runtime

Casepack version: 0.1.0. Original case authored with ChatGPT; no external puzzle assets. The Spanish wording has not been assessed by a native Spanish-speaking human reviewer.

Runtime: LUDOLINGUA 0.3.7-authoring.1b623a99, pinned to source `18fdb3eb5fc5c1d8d24efb698eff72bc127f72a4`. Existing engine, UI and schemas are preserved. Keep episode-kit/ and episode-packs/ in their extracted arrangement.

Regenerate checked exports in a **new** directory from the repository or full bundle root:

    node episode-packs/coastal-bearing/build.mjs /absolute/new/output-directory

Check the authored mechanics and committed exports:

    node --test episode-packs/coastal-bearing/oracle.test.mjs

Build a runnable bundle outside this source tree, passing its verified full source commit:

    python3 episode-packs/coastal-bearing/package.py --source-commit FULL_COMMIT_SHA --output /absolute/new/coastal-bearing.zip

The packager checks every pinned runtime file, regenerates and compares checked exports, and invokes the runtime's maintained packager. It preserves the directory arrangement and includes START_HERE.md plus source and content manifests. Browser receiving uses an installed Playwright module supplied through PLAYWRIGHT_MODULE; it does not install dependencies or disable the browser sandbox.
