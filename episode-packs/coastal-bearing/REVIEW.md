# Coastal Bearing — localization review

**Spoilers:** This document explains the answer and construction.

This original authored case compares a source puzzle, a literal-label contrast and a narrow Spanish adaptation. The change was chosen by the authors; the runtime did not discover or translate it.

## What the labels do

| Role | English source | Spanish literal contrast | Spanish adaptation |
|---|---|---|---|
| nest | Nest | Nido | Nido |
| sea | Ocean | Océano | Océano |
| river | River | Río | Río |
| tower | Tower | Torre | Torre |
| landing | Harbor | Puerto | Embarcadero |
| Ordered initials | **NORTH** | **NORTP** | **NORTE** |

The two immediate-before relations form sea → river → tower. The nest must precede that block; the landing follows it. Four clues force one of 120 possible orders. Removing each clue in its authored order leaves 3, 6, 3 and 6 orders, checked with an independent enumerator and the existing engine.

Literal Spanish retains the intended role order but extracts NORTP against the required NORTE. This is an intentional negative example. A faithfully verified export does not turn it into a successful puzzle.

The adaptation changes only the fifth Spanish **card label**, Puerto → Embarcadero. The other four labels, stable role IDs, clues, story, hints, extraction and required bearing are identical between Spanish variants. Their episode IDs and provenance distinguish them. Accents in Océano and Río are retained.

## The semantic tradeoff

Puerto is a context-appropriate port rendering for Harbor here, not a universal exact translation. Embarcadero narrows the referent to a place for boarding or landing; it need not be a constructed pier. The replacement changes what the fifth plate refers to. It is not a literal synonym substitution.

The scene allows a coastal landing place: names come from coastal notes, and no map or image requires an entire harbor. That makes the authored change narratively plausible, but a mechanical pass does not certify natural wording, comparable difficulty or cultural suitability.

The review question is whether this narrower referent is an acceptable tradeoff for recovering the Spanish direction in this scene. Native-language human review and human playtesting remain open.

## Inspect the evidence

Episode exports are under exports/episodes/. Checked comparisons under exports/comparisons/ retain the complete source, target and role mapping. The source-versus-literal pair exposes the broken extraction; the source-versus-adapted pair shows the selected repair.

This uses existing authored-episode behavior. It adds no solver, automatic translation, model-generated repair capability, schema or engine change. Content hashes bind supplied content and checks; they do not certify authorship or human participation.
