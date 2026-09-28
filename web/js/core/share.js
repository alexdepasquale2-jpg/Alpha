// Sharing: wrap a pattern, chart or palette in an envelope and turn it into a
// link. With the community server the link is a short code; without it the
// whole thing is compressed into the link's #fragment (which never reaches
// any server's logs).

import { online, createShare } from './api.js';
import { settings } from './store.js';

export const KINDS = {
  pattern: 'Pattern',
  chart: 'Chart',
  palette: 'Palette',
};

const LOCAL_FIELDS = ['id', 'createdAt', 'updatedAt', 'coverId', 'photoIds'];

export function envelope(kind, data) {
  const clean = { ...data };
  for (const f of LOCAL_FIELDS) delete clean[f];
  const s = settings();
  return { app: 'loopwright', v: 1, kind, data: clean, from: s.name ? { name: s.name } : null, at: Date.now() };
}

function toB64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try {
      return `z${toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
    } catch {
      /* fall through */
    }
  }
  return `j${toB64Url(bytes)}`;
}

export async function unpack(str) {
  const kind = str[0];
  const bytes = fromB64Url(str.slice(1));
  let raw;
  if (kind === 'z') raw = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind === 'j') raw = bytes;
  else throw new Error('Unrecognised share data');
  const obj = JSON.parse(new TextDecoder().decode(raw));
  if (!obj || obj.app !== 'loopwright' || !KINDS[obj.kind]) throw new Error('That link doesn’t hold a Loopwright share');
  return obj;
}

const base = () => `${location.origin}${location.pathname}`;
export const codeLink = (code) => `${base()}#/s/${code}`;
export const dataLink = (packed) => `${base()}#/import/${packed}`;

/**
 * Make the best link available. Returns { url, code, mode } where mode is
 * 'server' (short code, works for anyone who can reach this server) or
 * 'link' (self-contained, works anywhere the app is hosted).
 */
export async function makeLink(env, { preferServer = true } = {}) {
  if (preferServer && (await online())) {
    try {
      const { code } = await createShare(env);
      return { url: codeLink(code), code, mode: 'server' };
    } catch (err) {
      console.warn('Share code failed, falling back to a data link', err);
    }
  }
  const packed = await pack(env);
  return { url: dataLink(packed), code: null, mode: 'link', size: packed.length };
}

/** Pull a share out of pasted text: a link, a bare code, or packed data. */
export function parseShareInput(text) {
  const t = String(text || '').trim();
  let m = /#\/s\/([A-Za-z0-9]{8})\b/.exec(t) || /^([A-HJ-NP-Za-hj-np-z2-9]{8})$/.exec(t);
  if (m) return { code: m[1].toUpperCase() };
  m = /#\/import\/([zj][A-Za-z0-9_-]+)/.exec(t) || /^([zj][A-Za-z0-9_-]{20,})$/.exec(t);
  if (m) return { packed: m[1] };
  return null;
}
