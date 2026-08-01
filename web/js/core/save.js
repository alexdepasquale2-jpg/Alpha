// Persistence: localStorage first (instant, always available), then the Python
// host (durable, survives clearing browser data). On boot we take whichever
// copy is newer, so losing the network costs you nothing.

import { emit, EVENTS } from './events.js';
import { migrate, SAVE_VERSION, setState } from './state.js';

const LS_PREFIX = 'ironfield:save:';
const API = '/api/save';
const REQUEST_TIMEOUT_MS = 6000;

/** Set false after a failed request so we stop paying the timeout each save. */
let serverAvailable = true;
let lastServerError = null;

function lsKey(slot) { return `${LS_PREFIX}${slot}`; }

async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(body?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/* ---- reads -------------------------------------------------------------- */

function readLocal(slot) {
  try {
    const raw = localStorage.getItem(lsKey(slot));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[save] local read failed', err);
    return null;
  }
}

async function readServer(slot) {
  if (!serverAvailable) return null;
  try {
    return await fetchJson(`${API}/${encodeURIComponent(slot)}`);
  } catch (err) {
    if (err.status === 404) return null;   // absent is not a failure
    serverAvailable = false;
    lastServerError = err.message;
    console.warn('[save] server read failed, running local-only:', err.message);
    return null;
  }
}

/* ---- writes ------------------------------------------------------------- */

function writeLocal(slot, save) {
  try {
    localStorage.setItem(lsKey(slot), JSON.stringify(save));
    return true;
  } catch (err) {
    console.warn('[save] local write failed', err);
    return false;
  }
}

async function writeServer(slot, save) {
  if (!serverAvailable) return false;
  try {
    await fetchJson(`${API}/${encodeURIComponent(slot)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(save),
    });
    return true;
  } catch (err) {
    serverAvailable = false;
    lastServerError = err.message;
    console.warn('[save] server write failed, running local-only:', err.message);
    return false;
  }
}

/* ---- public API --------------------------------------------------------- */

/**
 * Persist `save` to slot. localStorage is written synchronously so the save is
 * safe the instant this returns; the server write is awaited but non-fatal.
 */
export async function save(state, slot = 'auto') {
  state.meta.savedAt = Date.now();
  state.version = SAVE_VERSION;
  const local = writeLocal(slot, state);
  const remote = await writeServer(slot, state);
  if (!local && !remote) {
    emit(EVENTS.SAVE_FAILED, { slot, error: lastServerError ?? 'no writable storage' });
    return { ok: false, local, remote };
  }
  emit(EVENTS.SAVED, { slot, local, remote, savedAt: state.meta.savedAt });
  return { ok: true, local, remote };
}

/**
 * Load a slot, preferring whichever of local/server was written last.
 * Returns the migrated state, or null if the slot is empty everywhere.
 */
export async function load(slot = 'auto') {
  const [local, remote] = await Promise.all([
    Promise.resolve(readLocal(slot)),
    readServer(slot),
  ]);

  let chosen = null;
  const localAt = local?.meta?.savedAt ?? -1;
  const remoteAt = remote?.meta?.savedAt ?? -1;
  if (local && remote) chosen = remoteAt > localAt ? remote : local;
  else chosen = local ?? remote;

  if (!chosen) return null;

  if (chosen.version > SAVE_VERSION) {
    console.warn(`[save] slot "${slot}" is version ${chosen.version}, newer than this build (${SAVE_VERSION})`);
  }
  const migrated = migrate(chosen);
  if (!migrated) return null;

  // Whichever side lost the comparison is now stale; bring it back in line.
  if (local && remote && localAt !== remoteAt) {
    if (chosen === remote) writeLocal(slot, migrated);
    else writeServer(slot, migrated);
  }
  return setState(migrated);
}

/** Slot listing for a load menu. Merges server and local views. */
export async function listSlots() {
  const found = new Map();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LS_PREFIX)) continue;
    const slot = key.slice(LS_PREFIX.length);
    const data = readLocal(slot);
    if (data) found.set(slot, { slot, where: 'local', summary: data.meta ?? null });
  }

  if (serverAvailable) {
    try {
      const body = await fetchJson('/api/saves');
      for (const entry of body?.slots ?? []) {
        const prior = found.get(entry.slot);
        const savedAt = entry.summary?.savedAt ?? 0;
        if (!prior || savedAt > (prior.summary?.savedAt ?? 0)) {
          found.set(entry.slot, { slot: entry.slot, where: prior ? 'both' : 'server', summary: entry.summary });
        } else {
          prior.where = 'both';
        }
      }
    } catch (err) {
      serverAvailable = false;
      console.warn('[save] slot listing failed', err.message);
    }
  }

  return [...found.values()].sort(
    (a, b) => (b.summary?.savedAt ?? 0) - (a.summary?.savedAt ?? 0),
  );
}

export async function deleteSlot(slot) {
  try { localStorage.removeItem(lsKey(slot)); } catch { /* nothing to do */ }
  if (serverAvailable) {
    try {
      await fetchJson(`${API}/${encodeURIComponent(slot)}`, { method: 'DELETE' });
    } catch (err) {
      if (err.status !== 404) console.warn('[save] server delete failed', err.message);
    }
  }
}

export function serverStatus() {
  return { available: serverAvailable, error: lastServerError };
}

/** Retry the host after a failure — called when a manual save is requested. */
export function resetServerStatus() {
  serverAvailable = true;
  lastServerError = null;
}
