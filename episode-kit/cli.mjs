#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { EPISODES } from './fixtures/episodes.mjs';
import { analyzeEpisode } from './lib/engine.mjs';
import { createExport, readExport } from './lib/export.mjs';

const [command, target, output, ...extra] = process.argv.slice(2);
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const fixture = id => EPISODES.find(e => e.id === id);
try {
  if (extra.length) throw new Error('Too many arguments');
  if (command === 'list' && !target) {
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
  } else throw new Error('Usage: node cli.mjs list | check <fixture-id or exported.json> | export <fixture-id> <new-output.json> | receive <exported.json>');
} catch (error) {
  print({ ok: false, error: error.message });
  process.exitCode = 1;
}
