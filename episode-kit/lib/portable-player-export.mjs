import { canonicalJSON, readExport, sourceDigest } from './export.mjs';

const SCHEMA = 'ludolingua.portable-player-bundle.v1';
const LIMIT = 20_000_000;
const STYLE = '<link rel="stylesheet" href="./style.css">';
const SCRIPT = '<script type="module" src="./playtest.mjs"></script>';
const once = (text, token) => text.split(token).length === 2;

export async function readPortableBundle(value) {
  const snapshot = JSON.parse(canonicalJSON(typeof value === 'string' ? JSON.parse(value) : value));
  if (!snapshot || snapshot.schema !== SCHEMA ||
      Object.keys(snapshot).sort().join(',') !== 'compiler,css,html,javascript,schema,sha256,sources' ||
      snapshot.compiler?.name !== 'esbuild' || typeof snapshot.compiler.version !== 'string' ||
      !Array.isArray(snapshot.sources) || !snapshot.sources.length ||
      !['html', 'css', 'javascript'].every(key => typeof snapshot[key] === 'string' && snapshot[key].length) ||
      !/^[a-f0-9]{64}$/.test(snapshot.sha256 ?? '')) throw new Error('Invalid portable player bundle.');
  const { sha256, ...payload } = snapshot;
  if (await sourceDigest(payload) !== sha256) throw new Error('Portable player bundle integrity check failed.');
  if (!once(snapshot.html, STYLE) || !once(snapshot.html, SCRIPT) || !once(snapshot.html, '</body>') || !once(snapshot.html, '</head>')) throw new Error('Unsupported portable player template.');
  if (/<\/style/i.test(snapshot.css) || /<\/script/i.test(snapshot.javascript)) throw new Error('Unsupported inline player asset.');
  return snapshot;
}

function inertJSON(value) {
  return JSON.stringify(value).replace(/[<\u2028\u2029]/g, character =>
    character === '<' ? '\\u003c' : character === '\u2028' ? '\\u2028' : '\\u2029');
}

export async function createPortablePlayerPage(episodeExport, bundle, { uiLocale = 'en', maxBytes = LIMIT } = {}) {
  if (!['en', 'es'].includes(uiLocale)) throw new Error('Unsupported interface language.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > LIMIT) throw new Error('Invalid playable file size limit.');
  // Both caller inputs are captured before asynchronous integrity checks.
  const captured = JSON.parse(canonicalJSON(episodeExport));
  const capturedBundle = JSON.parse(canonicalJSON(bundle));
  const [received, runtime] = await Promise.all([readExport(captured), readPortableBundle(capturedBundle)]);
  const data = inertJSON({ schema: 'ludolingua.portable-player-data.v1', episodeExport: captured, uiLocale, bundleSha256: runtime.sha256 });
  const tail = '<script id="ludolingua-portable-data" type="application/json">' + data + '</script>\n<script>\n' + runtime.javascript + '\n</script>\n</body>';
  const html = runtime.html.replace(STYLE, () => '<style>\n' + runtime.css + '\n</style>')
    .replace(SCRIPT, '')
    .replace('</head>', () => '<meta name="ludolingua-portable-runtime-sha256" content="' + runtime.sha256 + '">\n</head>')
    .replace('</body>', () => tail);
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > maxBytes) throw new Error('The playable HTML file is too large. Reduce episode content before downloading.');
  const episode = received.episode;
  return {
    html, bytes, episodeSha256: received.integrity.episodeSha256, bundleSha256: runtime.sha256,
    episode: { id: episode.id, revision: episode.revision, title: episode.title, locale: episode.locale },
    filename: 'ludolingua-' + episode.id.replace(/[^a-z0-9_-]/gi, '-') + '-r' + episode.revision + '-player.html'
  };
}
