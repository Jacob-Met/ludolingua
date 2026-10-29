# The Storm Signal — authored bilingual LUDOLINGUA case

A watch-station storm puzzle uses five ordered brass tags to recover a signal. The English source spells ALERT. Literal Spanish labels spell ALEST and fail the authored Spanish operational code AVISO. An explicit semantic adaptation changes four coastal-watch referents and spells AVISO with the same unique reasoning. The fourth case deliberately omits a clue; one solution spells AVISO but more than one order remains legal.

Four variants: English source (positive), Spanish literal translation (negative), Spanish coordinated adaptation (positive), and missing-clue Spanish adaptation (negative). The examples are authored original fiction, not real emergency procedures or validated cultural translations.

On Node.js 22+, from the repository root run:
    node --test episode-packs/storm-signal/oracle.test.mjs
    node episode-packs/storm-signal/build.mjs /tmp/storm-signal-unique-output
    node episode-kit/cli.mjs check /tmp/storm-signal-unique-output/episodes/01-en-source.json
    node episode-kit/cli.mjs check /tmp/storm-signal-unique-output/episodes/02-es-literal.json
    node episode-kit/cli.mjs check /tmp/storm-signal-unique-output/episodes/03-es-adapted.json
    node episode-kit/cli.mjs comparison-receive /tmp/storm-signal-unique-output/comparisons/source-vs-adapted.json
    node episode-kit/serve.mjs

The original check CLI exits 0 on mechanical success, 2 for a valid negative, and 1 for invalid input. The negative variants deliberately exit 2, which is evidence of correct refusal, not a failed integrity check. Generated digest-bound JSON exports reopen in the existing author workbench; play them blind using the separate player before inspecting author answers.

Generated files and manifest carry original SHA-256 and byte lengths. Source is pinned to maintained private repository commit 70cafeee869db01369ed453d793357c7a9feee64. The case preserves the existing engine and existing product owner hamon-a19-20261027. The only proposed source addition is episode-packs/storm-signal/.

No NVIDIA/Nebius inference, actual native-speaker review, human playtest, equivalent difficulty, cultural suitability, public release or semantic equivalence is established. The Spanish code AVISO is authored, not a literal translation of ALERT; an object becomes a lookout, an echo becomes an island, a rope becomes a siren and a tower becomes an observatory.

Contributor: estate-gpt6-ad664b52-c41d-47a6-a8a5-06d7663ffbf1.
