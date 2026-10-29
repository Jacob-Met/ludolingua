import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createOriginalEpisode } from '../lib/authoring.mjs';
import { createExport, readExport } from '../lib/export.mjs';
import { createPortablePlayerPage } from '../lib/portable-player-export.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await fs.readFile(path.join(root, 'web/portable-player-bundle.json'), 'utf8'));
const story = 'Literal $& and $' + "'" + ' and $' + String.fromCharCode(96) +
  '\n</script><script>globalThis.unwantedExecution=true</script>\n日本語 · E\u0301toile · 🧩 · \u2028 · \u2029';
function episode() {
  const value = createOriginalEpisode({ title: 'Portable 日本語', story, locale: 'en',
    labels: ['Sun', 'Apple', 'Yarn'], action: 'SAY' }, { id: 'portable-native-example' });
  value.clues = [
    { id: 'c1', kind: 'before', left: 'keeper-1', right: 'keeper-2' },
    { id: 'c2', kind: 'before', left: 'keeper-2', right: 'keeper-3' }
  ];
  return value;
}
function seed(html) {
  const match = html.match(/<script id="ludolingua-portable-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'one intact seed script');
  assert.equal((html.match(/<script\b/g) ?? []).length, 2);
  return JSON.parse(match[1]);
}

test('portable HTML retains an exact verified export with hostile markup, replacement tokens and raw Unicode', async () => {
  const exported = await createExport(episode()), saved = structuredClone(exported);
  const page = await createPortablePlayerPage(exported, bundle, { uiLocale: 'es' });
  const decoded = seed(page.html);
  assert.deepEqual(decoded.episodeExport, saved); assert.equal(decoded.uiLocale, 'es');
  assert.equal(decoded.bundleSha256, bundle.sha256);
  const received = await readExport(decoded.episodeExport);
  assert.deepEqual(received.episode, saved.episode);
  assert.equal(page.episodeSha256, received.integrity.episodeSha256);
  assert.equal(page.episode.locale, 'en'); assert.equal(page.episode.title, saved.episode.title);
  assert.equal(page.filename, 'ludolingua-portable-native-example-r1-player.html');
  assert.deepEqual(exported, saved);
  assert.equal(page.html.includes('<script>globalThis.unwantedExecution'), false);
  assert.equal(page.html.includes('<script type="module" src='), false);
  assert.equal(page.html.includes('<link rel="stylesheet"'), false);
});

test('portable generation captures both caller inputs before asynchronous validation', async () => {
  const exported = await createExport(episode()), runtime = structuredClone(bundle), before = structuredClone(exported);
  const pending = createPortablePlayerPage(exported, runtime, { uiLocale: 'en' });
  exported.episode.story = 'Changed after invocation'; runtime.html = 'Changed after invocation';
  const page = await pending;
  assert.deepEqual(seed(page.html).episodeExport, before);
  assert.ok(page.html.startsWith('<!doctype html>'));
});

test('portable generation rejects altered episode evidence and altered runtime contents', async () => {
  const exported = await createExport(episode());
  const changed = structuredClone(exported); changed.episode.story += ' altered';
  await assert.rejects(createPortablePlayerPage(changed, bundle), /stale|altered|digest|integrity/i);
  const evidence = structuredClone(exported); evidence.evidence.humanQualityVerified = true;
  await assert.rejects(createPortablePlayerPage(evidence, bundle), /evidence|claim|altered/i);
  const runtime = structuredClone(bundle); runtime.javascript += '\n/* changed */';
  await assert.rejects(createPortablePlayerPage(exported, runtime), /bundle integrity/i);
});

test('portable size cap counts the entire UTF-8 file at an exact byte boundary', async () => {
  const exported = await createExport(episode()), page = await createPortablePlayerPage(exported, bundle);
  assert.equal(page.bytes, Buffer.byteLength(page.html, 'utf8')); assert.ok(page.bytes > page.html.length);
  assert.equal((await createPortablePlayerPage(exported, bundle, { maxBytes: page.bytes })).html, page.html);
  await assert.rejects(createPortablePlayerPage(exported, bundle, { maxBytes: page.bytes - 1 }), /too large/);
  for (const maxBytes of [0, -1, 1.5, Infinity, NaN, 20_000_001]) {
    await assert.rejects(createPortablePlayerPage(exported, bundle, { maxBytes }), /Invalid playable file size limit/);
  }
  await assert.rejects(createPortablePlayerPage(exported, bundle, { uiLocale: 'fr' }), /Unsupported interface language/);
});

test('compiler-free bundle check detects a stale maintained player source', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ludo-portable-check-'));
  try {
    const copied = path.join(temporary, 'episode-kit');
    await fs.cp(root, copied, { recursive: true });
    const env = { ...process.env }; delete env.LUDO_ESBUILD_BINARY;
    const run = () => spawnSync(process.execPath, ['scripts/build-player-bundle.mjs', '--check'], { cwd: copied, env, encoding: 'utf8' });
    const fresh = run(); assert.equal(fresh.status, 0, fresh.stderr);
    assert.equal(JSON.parse(fresh.stdout).verified, true);
    await fs.appendFile(path.join(copied, 'web/playtest.mjs'), '\n// native freshness probe\n');
    const stale = run(); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /stale: web\/playtest\.mjs/);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
