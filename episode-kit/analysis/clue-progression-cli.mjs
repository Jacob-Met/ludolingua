#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { EPISODES } from '../fixtures/episodes.mjs';
import { compareClueProgression } from '../lib/clue-progression.mjs';

const usage = 'Usage: node analysis/clue-progression-cli.mjs <source-fixture-id-or-episode.json> <target-fixture-id-or-episode.json> [mapping.json]';
function episode(input) {
  const fixture = EPISODES.find(e => e.id === input);
  return fixture ? structuredClone(fixture) : JSON.parse(readFileSync(input, 'utf8'));
}
const args = process.argv.slice(2);
if (args.length < 2 || args.length > 3) {
  console.error(usage);
  process.exitCode = 1;
} else {
  try {
    const mapping = args[2] === undefined ? undefined : JSON.parse(readFileSync(args[2], 'utf8'));
    const result = compareClueProgression(episode(args[0]), episode(args[1]), mapping);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = !result.valid || !result.available ? 1 :
      result.mechanicalPreserved && result.sameClueProgression ? 0 : 2;
  } catch (err) {
    console.error('Clue progression audit failed: ' + err.message);
    process.exitCode = 1;
  }
}
