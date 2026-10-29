import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
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
      if (!(await stat(file)).isFile()) { res.writeHead(404); res.end('Not found'); return; }
      const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolveReady({ server, url: `http://127.0.0.1:${server.address().port}` })); });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, url } = await startReceiver({ port: process.env.PORT === undefined ? 4173 : Number(process.env.PORT) });
  console.log(`LUDOLINGUA episode receiver: ${url}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
}
