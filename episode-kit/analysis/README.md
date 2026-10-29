# Clue progression: inspect the discovery path, not just the solution

A localized puzzle can pass the existing **final-order-set** comparison yet disclose
its clues in a different order. That changes the exact candidate orders the player
must consider at each stage. This additive, private audit identifies that gap
without changing the episode, comparison, player, export, or server contracts.

From the existing episode-kit directory:

    node analysis/clue-progression-cli.mjs en-original es-adapted
    node analysis/clue-progression-cli.mjs en-original es-literal

Use authored fixture IDs or paths to raw episode JSON; optionally supply a third
mapping JSON file containing the existing complete sourceId/targetId pairs.
A JSON null mapping selects equal IDs. Source and target are never mutated.

The audit counts all orders after each clue in authored order, records how many
orders each clue excludes, and shows an exact source-role witness at the first
prefix where the surviving sets differ. It separately carries forward the
maintained comparison engine's final mechanical result. An unchanged path
and unchanged final solution are two different observations.

Try the negative control: reverse the Spanish adapted episode's clue array in
a copied JSON input. Its final order set and action stay valid but the first
clue leaves 12 orders rather than 6. The audit exposes that discrepancy.
Duplicate a valid clue with a fresh ID: final mechanics still pass, but the
extra redundant step appears.

Exit codes: 0 = valid, mechanically preserved and same per-prefix survivor sets;
2 = valid negative comparison or changed progression; 1 = malformed input or an
unavailable bounded diagnostic. An exit 2 is *not* failure to read source.
The explicit 64-clue diagnostic ceiling avoids unbounded duplicated-clue work;
2–8 cards follow the existing episode validator.

    node --test tests/clue-progression.test.mjs

The calculations are exact for the encoded ordering predicates and declared
role mapping. Number of surviving orders and log2 narrowing are **not human
difficulty measures**. Clue language, pacing, cultural nuance, genuine native
speaker comprehension, inference service execution, and external contributor
attribution remain unverified. Treat this as a better question for the author
and human playtest, not a quality certificate.
