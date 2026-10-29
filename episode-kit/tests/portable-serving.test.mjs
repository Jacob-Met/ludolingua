import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = dirname(dirname(fileURLToPath(import.meta.url)));
test('local receiver serves only a fresh portable runtime and keeps ordinary routes available', async t => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'ludolingua-serving-'));
  const kit = resolve(temporary, 'episode-kit');
  await cp(source, kit, { recursive: true });
  const { startReceiver } = await import(pathToFileURL(resolve(kit, 'serve.mjs')).href);
  const engine = resolve(kit, 'lib/engine.mjs'), bundle = resolve(kit, 'web/portable-player-bundle.json');
  const checker = resolve(kit, 'scripts/build-player-bundle.mjs');
  const engineBytes = await readFile(engine), bundleBytes = await readFile(bundle), checkerBytes = await readFile(checker);
  let active = await startReceiver();
  const request = (path = '/web/portable-player-bundle.json', method = 'GET') => fetch(new URL(path, active.url), { method });
  async function fresh() {
    const response = await request(); assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bundleBytes);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  async function unavailable(path = '/web/portable-player-bundle.json', method = 'GET') {
    const response = await request(path, method); assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    if (method === 'HEAD') assert.equal(text, '');
    else assert.match(text, /Refresh its bundle/);
  }
  async function ordinary() {
    for (const path of ['/web/index.html', '/web/playtest.html', '/web/app.mjs', '/lib/engine.mjs']) {
      const response = await request(path); assert.equal(response.status, 200, path);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
  }
  async function close() { await new Promise(done => { active.server.close(done); active.server.closeIdleConnections?.(); }); }
  try {
    await t.test('fresh GET returns exact bytes and HEAD returns headers without a body', async () => {
      await fresh(); const head = await request('/web/portable-player-bundle.json', 'HEAD');
      assert.equal(head.status, 200); assert.equal(await head.text(), '');
      assert.equal(Number(head.headers.get('content-length')), bundleBytes.length);
    });
    await t.test('source changes during a running server refuse GET, HEAD and equivalent resolved paths', async () => {
      await writeFile(engine, Buffer.concat([engineBytes, Buffer.from('\n// isolated freshness receiving edit\n')]));
      await unavailable(); await unavailable('/web/portable-player-bundle.json', 'HEAD');
      await unavailable('/web/%70ortable-player-bundle.json?receiving=1'); await ordinary();
    });
    await t.test('restoring exact source permits downloading without restarting', async () => {
      await writeFile(engine, engineBytes); await fresh();
    });
    await t.test('a stale source present before startup does not block ordinary author/player routes', async () => {
      await close(); await writeFile(engine, Buffer.concat([engineBytes, Buffer.from('\n// stale before startup\n')]));
      active = await startReceiver(); await ordinary(); await unavailable();
      await writeFile(engine, engineBytes); await fresh();
    });
    await t.test('missing bundle yields a controlled refusal and can be restored', async () => {
      await rm(bundle); await unavailable(); await unavailable('/web/portable-player-bundle.json', 'HEAD'); await ordinary();
      await writeFile(bundle, bundleBytes); await fresh();
    });
    await t.test('corrupt bundle cannot be served and recovery uses the real compiler-free checker', async () => {
      await writeFile(bundle, '{"corrupt":true}\n'); await unavailable(); await ordinary();
      await writeFile(bundle, bundleBytes); await fresh();
    });
    await t.test('controlled verifier success cannot serve a bundle replaced during the check', async () => {
      // Fault injection in this disposable copy isolates the check/read race.
      const injected = 'import { writeFile } from "node:fs/promises";\n' +
        'await writeFile(' + JSON.stringify(bundle) + ', "replaced during check\\n");\n';
      try {
        await writeFile(checker, injected); await unavailable();
      } finally {
        await writeFile(checker, checkerBytes); await writeFile(bundle, bundleBytes);
      }
      await fresh();
    });
    await t.test('concurrent fresh requests have independent correct responses', async () => {
      await Promise.all([fresh(), fresh()]); await ordinary();
    });
  } finally {
    await close(); await rm(temporary, { recursive: true, force: true });
  }
});
