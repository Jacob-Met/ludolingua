import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExport } from '../../../episode-kit/lib/export.mjs';
import { createComparisonExport } from '../../../episode-kit/lib/comparison-export.mjs';
const caseRoot = fileURLToPath(new URL('../', import.meta.url));
const output = process.argv[2] && resolve(process.argv[2]);
if (!output || process.argv.length !== 3) throw new Error('Usage: node scripts/generate.mjs NEW_DIRECTORY');
await mkdir(output); // Refuse existing output directories.
const read = async name => JSON.parse(await readFile(resolve(caseRoot, name), 'utf8'));
const names = ['en-source','es-literal','es-repaired','es-meaning-control'];
const episodes = Object.fromEntries(await Promise.all(names.map(async name => [name, await read('episodes/' + name + '.json')])));
const mapping = await read('mapping.json');
await mkdir(resolve(output, 'exports'));
await mkdir(resolve(output, 'comparisons'));
const put = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
for (const name of names) await put('exports/' + name + '.export.json', await createExport(episodes[name]));
for (const name of names.slice(1)) await put('comparisons/en-to-' + name + '.comparison.json', await createComparisonExport(episodes['en-source'], episodes[name], mapping));
console.log(JSON.stringify({output, episodeExports:4, comparisons:3}));
