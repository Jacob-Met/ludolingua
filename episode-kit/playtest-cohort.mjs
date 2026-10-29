#!/usr/bin/env node
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { summarizePlaytestCohort, MAX_COHORT_FILES, MAX_RECORD_BYTES, MAX_COHORT_BYTES } from './lib/playtest-cohort.mjs';
export { summarizePlaytestCohort, MAX_COHORT_FILES, MAX_RECORD_BYTES, MAX_COHORT_BYTES } from './lib/playtest-cohort.mjs';

export async function runCli(paths = process.argv.slice(2)) {
  try {
    if (paths.length === 0 || paths.length > MAX_COHORT_FILES) {
      throw new Error(`Usage: node playtest-cohort.mjs <record1.json> [record2.json ...] (1-${MAX_COHORT_FILES} files)`);
    }
    let bytes = 0;
    const records = [];
    for (const path of paths) {
      const info = await stat(path);
      if (!info.isFile() || info.size > MAX_RECORD_BYTES) {
        throw new Error('An input is not a regular file or exceeds the 20 MB record limit.');
      }
      bytes += info.size;
      if (bytes > MAX_COHORT_BYTES) throw new Error('The combined input exceeds the 40 MB cohort limit.');
      records.push(await readFile(path, 'utf8')); 
    }
    process.stdout.write(JSON.stringify(await summarizePlaytestCohort(records), null, 2) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n');
    process.exitCode = 1;
  }
}

// Node resolves the module URL through symlinks unless instructed otherwise.
// Normalize both paths so linked entrypoints run, while ordinary imports stay quiet.
const invokedAsMain = process.argv[1] && await Promise.all([
  realpath(process.argv[1]),
  realpath(fileURLToPath(import.meta.url))
]).then(([entry, source]) => entry === source, () => false);

if (invokedAsMain) {
  await runCli();
}
