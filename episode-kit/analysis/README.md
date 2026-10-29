# Clue progression: inspect listed-clue prefixes alongside the solution

A localized puzzle can pass the existing **final-order-set** comparison yet list
its encoded clues in a different order. This audit compares the exact candidate
orders that would remain after each prefix of that list. The current player shows
all encoded clues at once; its separately revealed hints are not audited here.
These are hypothetical listed-clue stages, not an observed learner journey. The
additive, private audit leaves episode, comparison, player, export and server
contracts unchanged.

From the existing episode-kit directory:

    node analysis/clue-progression-cli.mjs en-original es-adapted
    node analysis/clue-progression-cli.mjs en-original es-literal

Use authored fixture IDs or paths to raw episode JSON; optionally supply a third
mapping JSON file containing the existing complete sourceId/targetId pairs.
A JSON null mapping selects equal IDs. Source and target are never mutated.

The audit counts all orders after each hypothetical listed-clue prefix, records
how many orders each clue excludes, and shows an exact source-role witness at the
first prefix where the surviving sets differ. It separately carries forward the
maintained comparison engine's final mechanical result. Matching listed-clue
prefixes and matching final solutions are separate observations. `sameClueProgression`
does not compare hint wording or hint order, or establish how a player reasons.
A different prefix sequence can be a deliberate author choice; it does not by
itself establish a failed localization.

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

Survivor sets and counts are exact for the encoded ordering predicates and
declared role mapping. The reported `informationBits` is
log2(beforeCount/afterCount), rounded to six decimal places when both counts are
positive; otherwise it is null. It describes
count reduction under a uniform-candidate interpretation, not actual learner
information acquisition. Survivor counts and this rounded reduction are **not
human difficulty measures**. Clue language, pacing, cultural nuance, genuine native
speaker comprehension, inference service execution, and external contributor
attribution remain unverified. Treat this as a better question for the author
and human playtest, not a quality certificate.
