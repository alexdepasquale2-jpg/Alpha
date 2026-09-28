// Local-first storage. Everything a person makes lives in IndexedDB on their
// device; the server only ever sees what they choose to post or share.
//
// All record stores are small, so they're read into memory at startup and
// served synchronously. Photos live in their own store as Blobs and are
// loaded on demand.

import { uid } from './util.js';

const DB_NAME = 'loopwright';
const DB_VERSION = 2;
export const STORES = ['projects', 'patterns', 'charts', 'yarns', 'tools', 'palettes', 'journal', 'shopping', 'people', 'meta'];
const MEDIA = 'media';

const cache = Object.fromEntries(STORES.map((s) => [s, new Map()]));
const listeners = new Map();
let idb = null;
let persistent = true;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of [...STORES, MEDIA]) {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage is blocked by another open tab'));
  });
}

function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = idb.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    const r = fn(os);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
}

export const ready = (async () => {
  try {
    idb = await openDb();
    await Promise.all(STORES.map(async (s) => {
      const rows = await tx(s, 'readonly', (os) => os.getAll());
      for (const row of rows || []) cache[s].set(row.id, row);
    }));
  } catch (err) {
    console.warn('Loopwright: falling back to memory-only storage', err);
    persistent = false;
    idb = null;
  }
  return persistent;
})();

export const isPersistent = () => persistent;

function emit(store, detail) {
  for (const fn of listeners.get(store) || []) {
    try {
      fn(detail);
    } catch (err) {
      console.error(err);
    }
  }
  for (const fn of listeners.get('*') || []) fn({ store, ...detail });
}

/** Subscribe to changes in a store ('*' for all). Returns an unsubscribe. */
export function on(store, fn) {
  if (!listeners.has(store)) listeners.set(store, new Set());
  listeners.get(store).add(fn);
  return () => listeners.get(store).delete(fn);
}

export function all(store, { sort = 'updatedAt' } = {}) {
  const rows = [...cache[store].values()];
  if (sort) rows.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
  return rows;
}

export const get = (store, id) => cache[store].get(id) || null;

export async function put(store, obj, { silent = false } = {}) {
  const now = Date.now();
  const row = { ...obj, id: obj.id || uid(), createdAt: obj.createdAt || now, updatedAt: now };
  cache[store].set(row.id, row);
  if (idb) await tx(store, 'readwrite', (os) => os.put(row));
  if (!silent) emit(store, { type: 'put', id: row.id, row });
  return row;
}

export async function remove(store, id) {
  const row = cache[store].get(id);
  cache[store].delete(id);
  if (idb) await tx(store, 'readwrite', (os) => os.delete(id));
  emit(store, { type: 'remove', id, row });
}

// ---------------------------------------------------------------------------
// Settings and small values
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  name: '',
  color: '#b4481f',
  clientId: null,
  terms: 'US',
  units: 'in',
  handed: 'right',
  theme: 'auto',
  speed: 20,
  yarnCalibration: 1,
  rate: 15,
  currency: '$',
  haptics: true,
  sounds: false,
};

export function settings() {
  const row = cache.meta.get('settings');
  return { ...DEFAULT_SETTINGS, ...(row ? row.value : {}) };
}

export async function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  await put('meta', { id: 'settings', value: next });
  return next;
}

export function metaGet(key, fallback = null) {
  const row = cache.meta.get(key);
  return row ? row.value : fallback;
}

export function metaSet(key, value) {
  return put('meta', { id: key, value }, { silent: true });
}

/** A stable random id for this device, used for likes and authorship. */
export async function clientId() {
  const s = settings();
  if (s.clientId) return s.clientId;
  const id = uid(20);
  await saveSettings({ clientId: id });
  return id;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

const memoryMedia = new Map();
const urls = new Map();

export async function putMedia(blob, info = {}) {
  const row = { id: uid(), blob, type: blob.type, createdAt: Date.now(), ...info };
  if (idb) await tx(MEDIA, 'readwrite', (os) => os.put(row));
  else memoryMedia.set(row.id, row);
  return row.id;
}

export async function getMedia(id) {
  if (!id) return null;
  if (!idb) return memoryMedia.get(id) || null;
  return (await tx(MEDIA, 'readonly', (os) => os.get(id))) || null;
}

export async function removeMedia(id) {
  if (urls.has(id)) {
    URL.revokeObjectURL(urls.get(id));
    urls.delete(id);
  }
  if (idb) await tx(MEDIA, 'readwrite', (os) => os.delete(id));
  else memoryMedia.delete(id);
}

/** An object URL for a stored photo (cached for the session). */
export async function mediaUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const row = await getMedia(id);
  if (!row) return null;
  const url = URL.createObjectURL(row.blob);
  urls.set(id, url);
  return url;
}

async function allMedia() {
  if (!idb) return [...memoryMedia.values()];
  return (await tx(MEDIA, 'readonly', (os) => os.getAll())) || [];
}

// ---------------------------------------------------------------------------
// Backup and restore
// ---------------------------------------------------------------------------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Decoded by hand: fetch() on a data: URL is blocked by the page's CSP.
function dataUrlToBlob(url) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url || '');
  if (!m) throw new Error('A photo in the backup is damaged.');
  const type = m[1] || 'application/octet-stream';
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type });
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportAll({ media = true } = {}) {
  const out = { app: 'loopwright', kind: 'backup', v: 1, at: Date.now(), stores: {} };
  for (const s of STORES) out.stores[s] = all(s, { sort: null });
  if (media) {
    out.media = [];
    for (const m of await allMedia()) {
      out.media.push({ id: m.id, type: m.type, w: m.w, h: m.h, createdAt: m.createdAt, data: await blobToDataUrl(m.blob) });
    }
  }
  return out;
}

/**
 * Restore a backup. 'merge' keeps existing records and adds or updates from
 * the backup (newer wins); 'replace' wipes first.
 */
export async function importAll(data, mode = 'merge') {
  if (!data || data.app !== 'loopwright' || data.kind !== 'backup') throw new Error('That file is not a Loopwright backup.');
  let count = 0;
  if (mode === 'replace') {
    for (const s of STORES) {
      for (const id of [...cache[s].keys()]) {
        if (s === 'meta' && id === 'settings') continue;
        await remove(s, id);
      }
    }
  }
  for (const s of STORES) {
    for (const row of data.stores?.[s] || []) {
      if (!row || typeof row.id !== 'string') continue;
      if (s === 'meta' && row.id === 'settings') {
        const keep = settings();
        await put('meta', { id: 'settings', value: { ...row.value, clientId: keep.clientId || row.value?.clientId } }, { silent: true });
        continue;
      }
      const existing = cache[s].get(row.id);
      if (mode === 'merge' && existing && (existing.updatedAt || 0) > (row.updatedAt || 0)) continue;
      cache[s].set(row.id, row);
      if (idb) await tx(s, 'readwrite', (os) => os.put(row));
      count++;
    }
    emit(s, { type: 'import' });
  }
  for (const m of data.media || []) {
    const blob = dataUrlToBlob(m.data);
    const row = { id: m.id, blob, type: m.type, w: m.w, h: m.h, createdAt: m.createdAt };
    if (idb) await tx(MEDIA, 'readwrite', (os) => os.put(row));
    else memoryMedia.set(row.id, row);
  }
  emit('meta', { type: 'import' });
  return count;
}

export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { ...est, persisted };
}
