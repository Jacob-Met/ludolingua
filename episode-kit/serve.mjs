import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const runFile = promisify(execFile);
const portableBundle = resolve(root, 'web/portable-player-bundle.json');
async function checkedPortableBytes(file) {
  const before = await readFile(file);
  await runFile(process.execPath, [resolve(root, 'scripts/build-player-bundle.mjs'), '--check'],
    { cwd: root, timeout: 10_000, maxBuffer: 131_072 });
  const after = await readFile(file);
  if (!before.equals(after)) throw new Error('The portable player bundle changed during verification.');
  return after;
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
export function startReceiver({ port = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const server = createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/') { res.writeHead(302, { Location: '/web/index.html', 'Cache-Control': 'no-store' }); res.end(); return; }
      const path = decodeURIComponent(url.pathname);
      const file = resolve(root, '.' + path);
      if (!file.startsWith(root + sep) || path.includes('\0') || !['/web/', '/lib/', '/fixtures/'].some(prefix => path.startsWith(prefix))) { res.writeHead(404); res.end('Not found'); return; }
      let bytes;
      if (file === portableBundle) {
        try { bytes = await checkedPortableBytes(file); }
        catch (error) {
          const detail = typeof error.stderr === 'string' ? error.stderr.trim() : error.message;
          console.error('Portable player download unavailable: ' + detail +
            '\nRun node scripts/build-player-bundle.mjs --check and follow the README rebuild instructions.');
          const message = 'The downloadable player is out of date or unavailable. Refresh its bundle before trying again.\n';
          res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': Buffer.byteLength(message), 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
          res.end(req.method === 'HEAD' ? undefined : message); return;
        }
      } else {
        if (!(await stat(file)).isFile()) { res.writeHead(404); res.end('Not found'); return; }
        bytes = await readFile(file);
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolveReady({ server, url: `http://127.0.0.1:${server.address().port}` })); });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, url } = await startReceiver({ port: process.env.PORT === undefined ? 4173 : Number(process.env.PORT) });
  console.log(`LUDOLINGUA episode receiver: ${url}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
}
