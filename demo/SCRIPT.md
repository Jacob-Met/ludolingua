# Demo narration (about 2 minutes)

| # | On screen | Narration |
|---|-----------|-----------|
| 1 | Adaptation bench | This is Ludolingua, a bench for adapting word puzzles between languages. It is for game and puzzle localization teams, who know that translating the words of a puzzle can break the puzzle. |
| 2 | Source cards O P E N | Here is one. Four cards, ordered by three clues. Read the first letter of each card, left to right, and they spell open. |
| 3 | Same | A literal Spanish translation would spell something else entirely. So the words must change, while the order and the clues stay the same. |
| 4 | Click Adapt with Nemotron | The local server calls NVIDIA Nemotron 3 Super on Nebius Token Factory with the cards, clues and story, and gets new Spanish labels, action and story. |
| 5 | Verdict panel | Nemotron only proposes. The engine and the browser check one clue-consistent order, initials spelling abre, same order as the source. Failed proposals go back with reasons, up to three tries. |
| 6 | Same | The checks prove the mechanic survived, not that the Spanish reads well. |
| 7 | Choose the five-card signal panel | Now a larger puzzle, where the word is press. |
| 8 | Click Adapt | Same loop with five cards. |
| 9 | Verdict | Download the checked episode and open it in the workbench. The model does the language work; the checker decides if the puzzle works. |
