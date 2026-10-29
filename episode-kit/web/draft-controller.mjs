import { sourceDigest } from '../lib/export.mjs';
import { draftKey, captureDraft, readDraft, writeDraft, removeDraft } from '../lib/drafts.mjs';

const SELECTED_KEY = 'ludolingua.author-draft-selection';
const copy = value => structuredClone(value);
const statusCopy = {
  clean: 'Bundled episode drafts save in this browser as you edit.',
  restored: 'Draft restored. Check this revision before exporting.',
  saved: 'Draft saved in this browser.',
  saving: 'Saving draft…',
  unavailable: 'Draft kept in this tab only. Reloading may lose your edits.',
  invalid: 'Saved draft could not be restored. Its saved data is preserved until you keep these edits or discard it.',
  incompatible: 'Saved draft belongs to a different episode version. Its saved data is preserved until you keep these edits or discard it.',
  conflict: 'A different draft was saved in another tab. Your edits are still here.',
  loadFailed: 'The other saved draft could not be restored. Your edits are still here.',
  discarded: 'Draft discarded. Original episode loaded; check it before exporting.'
};

// Local author input is recoverable convenience, never validation evidence.
// Web Locks serialize participating tabs; storage guards preserve observed conflicts.
// Browsers without Web Locks retain edits in memory and never promise a disk save.
export async function createFixtureDrafts(sources, onReplace, t = key => key) {
  const hashes = new Map(await Promise.all(sources.map(async source => {
    try { return [source.id, await sourceDigest(source)]; }
    catch { return [source.id, null]; }
  })));
  const entries = new Map();
  let active = null;
  const status = document.getElementById('draft-status');
  const announcement = document.getElementById('draft-announcement');
  const discard = document.getElementById('discard-draft');
  const load = document.getElementById('load-draft');
  const keep = document.getElementById('keep-draft');

  function render(entry = active) {
    if (entry !== active) return;
    if (!entry) {
      const message = t('Reopened exports stay in this tab. Export checked changes to keep them after closing.');
      status.textContent = message;
      if (announcement.textContent !== message) announcement.textContent = message;
      status.dataset.state = 'detached';
      discard.disabled = true; load.hidden = true; keep.hidden = true;
      return;
    }
    const message = t(statusCopy[entry.state]);
    if (status.textContent !== message) status.textContent = message;
    if (entry.state !== 'saving' && announcement.textContent !== message) announcement.textContent = message;
    status.dataset.state = entry.state;
    const unreadable = ['invalid', 'incompatible'].includes(entry.state);
    discard.disabled = (entry.conflict && !unreadable) || (!entry.dirty && entry.raw === null);
    load.hidden = !entry.conflict || unreadable;
    keep.hidden = !entry.conflict;
  }
  function unavailable(entry) { entry.state = 'unavailable'; render(entry); }
  function conflict(entry) { entry.conflict = true; entry.state = 'conflict'; render(entry); }
  function storage() { return globalThis.localStorage; }

  async function locked(entry, action) {
    const sequence = entry.sequence;
    if (!entry.hash || !globalThis.navigator?.locks?.request) { unavailable(entry); return; }
    try { await navigator.locks.request('ludolingua-draft-lock:' + entry.key, action); }
    catch { if (sequence === entry.sequence) unavailable(entry); }
  }
  function save(entry, overwrite = false) {
    const sequence = entry.sequence;
    if (entry.conflict && !overwrite) { render(entry); return; }
    entry.state = 'saving'; render(entry);
    return locked(entry, () => {
      if (sequence !== entry.sequence || (entry.conflict && !overwrite)) return;
      if (entry.raw === undefined && !overwrite) { unavailable(entry); return; }
      let result;
      try {
        const store = storage();
        const expected = overwrite ? store.getItem(entry.key) : entry.raw;
        const record = captureDraft(entry.source, entry.hash, entry.episode, crypto.randomUUID(), entry.hintText);
        result = writeDraft(store, entry.key, expected, record);
      } catch { unavailable(entry); return; }
      if (result.state === 'conflict') { conflict(entry); return; }
      if (result.state !== 'saved') { unavailable(entry); return; }
      entry.raw = result.raw; entry.dirty = false; entry.conflict = false; entry.state = 'saved';
      render(entry);
    });
  }

  function open(source) {
    let entry = entries.get(source.id);
    if (!entry) {
      entry = { source: copy(source), hash: hashes.get(source.id), key: draftKey(source.id),
        episode: copy(source), hintText: source.hints.join('\n'), raw: undefined, sequence: 0, dirty: false, conflict: false, state: 'clean' };
      try {
        entry.raw = storage().getItem(entry.key);
        const restored = readDraft(entry.raw, source, entry.hash);
        if (restored.state === 'ready') { entry.episode = restored.episode; entry.hintText = restored.hintText; entry.state = 'restored'; }
        else if (restored.state !== 'missing') { entry.state = restored.state; entry.conflict = true; }
      } catch { entry.state = 'unavailable'; }
      if (!entry.hash || !globalThis.navigator?.locks?.request) entry.state = 'unavailable';
      entries.set(source.id, entry);
    } else {
      try {
        const raw = storage().getItem(entry.key);
        if (raw !== entry.raw) {
          entry.sequence += 1;
          if (entry.raw === undefined && raw === null) entry.raw = null;
          else conflict(entry);
        }
      } catch { unavailable(entry); }
    }
    active = entry;
    try { storage().setItem(SELECTED_KEY, source.id); } catch {}
    render();
    return copy(entry.episode);
  }
  function changed(episode, hintText) {
    if (!active) return;
    active.episode = copy(episode); active.hintText = hintText; active.sequence += 1; active.dirty = true;
    void save(active);
  }
  function detach() { active = null; render(); }

  discard.addEventListener('click', () => {
    const entry = active;
    if (!entry) return;
    const sequence = ++entry.sequence;
    void locked(entry, () => {
      if (sequence !== entry.sequence) return;
      const result = removeDraft(storage(), entry.key, entry.raw);
      if (result.state === 'conflict') { conflict(entry); return; }
      if (result.state !== 'saved') { unavailable(entry); return; }
      entry.episode = copy(entry.source); entry.hintText = entry.source.hints.join('\n'); entry.raw = null;
      entry.dirty = false; entry.conflict = false; entry.state = 'discarded';
      if (entry === active) onReplace(copy(entry.episode), entry.hintText);
      render(entry);
    });
  });
  load.addEventListener('click', () => {
    const entry = active;
    if (!entry) return;
    const sequence = ++entry.sequence;
    void locked(entry, () => {
      if (sequence !== entry.sequence) return;
      const raw = storage().getItem(entry.key);
      const restored = readDraft(raw, entry.source, entry.hash);
      if (!['ready', 'missing'].includes(restored.state)) {
        entry.conflict = true; entry.state = 'loadFailed'; render(entry); return;
      }
      entry.episode = restored.state === 'ready' ? restored.episode : copy(entry.source);
      entry.hintText = restored.state === 'ready' ? restored.hintText : entry.source.hints.join('\n');
      entry.raw = raw; entry.dirty = false; entry.conflict = false;
      entry.state = restored.state === 'ready' ? 'restored' : 'clean';
      if (entry === active) onReplace(copy(entry.episode), entry.hintText);
      render(entry);
    });
  });
  keep.addEventListener('click', () => {
    if (!active) return;
    active.sequence += 1;
    void save(active, true);
  });
  window.addEventListener('storage', event => {
    for (const entry of entries.values()) {
      if (event.key !== null && event.key !== entry.key) continue;
      try {
        // Read current bytes; an earlier queued event is not the current state.
        if (storage().getItem(entry.key) === entry.raw) continue;
        entry.sequence += 1;
        conflict(entry);
      } catch { unavailable(entry); }
    }
  });

  let selectedId = null;
  try { const candidate = storage().getItem(SELECTED_KEY); if (sources.some(source => source.id === candidate)) selectedId = candidate; } catch {}
  return { open, changed, detach, selectedId, hintText: () => active?.hintText ?? '', relocalize: () => render() };
}
