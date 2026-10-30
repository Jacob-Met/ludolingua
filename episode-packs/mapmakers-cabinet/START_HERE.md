# The Mapmaker’s Cabinet

Extract the complete ZIP, then open `PLAY.html` in your browser. Choose English or Español. Both players contain their puzzle and player runtime and can be played offline.

Arrange all seven cards using the notes and enter the word you uncover. Hints are optional. Download the playtest record before closing if you want to retain your play; the player does not automatically save it.

If opening this file inside the source pack rather than the release root, use the neighboring `OPEN_ME.html`.

## For authors

From the extracted bundle or repository root, run:

```sh
node episode-kit/serve.mjs
```

Node.js 22 or newer is needed for the author workbench. Open the local address printed by the server. Import an episode from `episode-packs/mapmakers-cabinet/exports/episodes/`, or a comparison from its `exports/comparisons/` directory. The README beside the pack contains solutions and explains the deliberately broken literal translation.

No model service or dependency installation is needed for ordinary play or authoring. This pack records authored content and mechanical checks; it does not record human playtesting or model inference.
