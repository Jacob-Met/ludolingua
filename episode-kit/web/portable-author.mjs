import { canonicalJSON, createExport } from '../lib/export.mjs';
import { createPortablePlayerPage } from '../lib/portable-player-export.mjs';

export function setupPortableAuthor({ getEpisode, getUILocale, notice, maxBytes }) {
  const button = document.getElementById('download-portable-player');
  let pending = false, bundlePromise = null;
  function loadBundle() {
    if (!bundlePromise) bundlePromise = (async () => {
      const response = await fetch(new URL('./portable-player-bundle.json', import.meta.url), { cache: 'no-store' });
      if (response.status === 503) throw new Error("The downloadable player is out of date or unavailable. You can keep editing, export checked JSON, or open a separate playtest. Ask the kit maintainer to refresh the player bundle, then try again.");
      if (!response.ok) throw new Error('The portable player runtime could not be loaded.');
      const text = await response.text();
      if (new TextEncoder().encode(text).length > 2_000_000) throw new Error('The portable player runtime is too large.');
      return JSON.parse(text);
    })().catch(error => { bundlePromise = null; throw error; });
    return bundlePromise;
  }
  button.addEventListener('click', async () => {
    if (pending) return;
    pending = true; button.disabled = true;
    try {
      const source = canonicalJSON(getEpisode()), snapshot = JSON.parse(source), uiLocale = getUILocale();
      notice('Preparing a playable copy of this revision…');
      const [episodeExport, bundle] = await Promise.all([createExport(snapshot), loadBundle()]);
      const page = await createPortablePlayerPage(episodeExport, bundle, { uiLocale, maxBytes });
      if (canonicalJSON(getEpisode()) !== source) throw new Error('The episode changed while the playable file was being prepared. Download the current revision again.');
      const blob = new Blob([page.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = page.filename;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice('Downloaded revision {revision} as a playable HTML file. Open it directly in a browser.', false, { revision: page.episode.revision });
    } catch (error) { notice('Cannot download playable file: {message}', true, { message: error.message }); }
    finally {
      // Every later export must revalidate the served runtime, including after success.
      bundlePromise = null; pending = false; button.disabled = false;
    }
  });
}
