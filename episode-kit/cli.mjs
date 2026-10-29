#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { EPISODES } from './fixtures/episodes.mjs';
import { analyzeEpisode } from './lib/engine.mjs';
import { createExport, readExport } from './lib/export.mjs';
import { compareEpisodes } from './lib/compare.mjs';
import { createComparisonExport, readComparisonExport } from './lib/comparison-export.mjs';

const [command, target, output, ...extra] = process.argv.slice(2);
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const fixture = id => EPISODES.find(e => e.id === id);
const readEpisode = async path => {
  const value = JSON.parse(await readFile(path, 'utf8'));
  return value?.schema === 'ludolingua.episode-export.v1' ? (await readExport(value)).episode : value;
};
const readMapping = async path => {
  if (path === undefined) return undefined;
  const value = JSON.parse(await readFile(path, 'utf8'));
  return value === null ? undefined : value;
};
try {
  if (command === 'compare' && target && output && extra.length <= 1) {
    const result = compareEpisodes(await readEpisode(target), await readEpisode(output), await readMapping(extra[0]));
    print(result); process.exitCode = !result.valid ? 1 : result.mechanicalPreserved ? 0 : 2;
  } else if (command === 'comparison-export' && target && output && extra.length >= 1 && extra.length <= 2) {
    const value = await createComparisonExport(await readEpisode(target), await readEpisode(output), await readMapping(extra[1]));
    await writeFile(extra[0], JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    print({ output: extra[0], bindingSha256: value.validation.bindingSha256, mechanicalPreserved: value.validation.result.mechanicalPreserved });
  } else if (command === 'comparison-receive' && target && !output && !extra.length) {
    print(await readComparisonExport(await readFile(target, 'utf8')));
  } else if (extra.length) throw new Error('Too many arguments');
  else if (command === 'list' && !target) {
    print(EPISODES.map(({ id, title, locale }) => ({ id, title, locale })));
  } else if (command === 'check' && target && !output) {
    const episode = fixture(target) ?? (await readExport(await readFile(target, 'utf8'))).episode;
    const result = analyzeEpisode(episode);
    print(result);
    process.exitCode = !result.valid ? 1 : result.mechanicalSuccess ? 0 : 2;
  } else if (command === 'export' && target && output) {
    const episode = fixture(target);
    if (!episode) throw new Error('Unknown fixture: ' + target);
    const value = await createExport(episode);
    await writeFile(output, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    print({ output, episodeSha256: value.validation.episodeSha256, mechanicalSuccess: value.validation.result.mechanicalSuccess });
  } else if (command === 'receive' && target && !output) {
    const result = await readExport(await readFile(target, 'utf8'));
    print(result);
  } else throw new Error('Usage: node cli.mjs list | check <fixture-id or exported.json> | export <fixture-id> <new-output.json> | receive <exported.json> | compare <source.json> <target.json> [mapping.json] | comparison-export <source.json> <target.json> <new-output.json> [mapping.json] | comparison-receive <comparison.json>');
} catch (error) {
  print({ ok: false, error: error.message });
  process.exitCode = 1;
}
