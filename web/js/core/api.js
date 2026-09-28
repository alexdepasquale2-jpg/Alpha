// Client for the community server. The app works fully without it; anything
// here fails soft and callers check `online()` first.

import { clientId, metaGet, metaSet } from './store.js';

let status = null;
let checkedAt = 0;
let info = {};

// The moderator key is a per-device secret, kept out of backups.
const MOD_KEY = 'loopwright-moderator';
export function moderatorKey() {
  try {
    return localStorage.getItem(MOD_KEY) || '';
  } catch {
    return '';
  }
}
export function setModeratorKey(key) {
  try {
    if (key) localStorage.setItem(MOD_KEY, key);
    else localStorage.removeItem(MOD_KEY);
  } catch {
    /* storage unavailable */
  }
}
export const isModerator = () => !!moderatorKey();
export const serverInfo = () => info;

export async function online(force = false) {
  if (!force && status !== null && Date.now() - checkedAt < 20000) return status;
  checkedAt = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    const body = res.ok ? await res.json() : null;
    status = !!(body && body.app === 'loopwright' && body.community);
    info = status ? body : {};
  } catch {
    status = false;
  }
  return status;
}

export const lastKnownOnline = () => status;

async function call(method, path, body = null, headers = {}) {
  const init = {
    method,
    headers: { 'X-Loopwright-Client': await clientId(), ...headers },
    cache: 'no-store',
  };
  if (body !== null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    status = false;
    throw new Error('Can’t reach the Loopwright server right now.');
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(data?.error ? capitalise(data.error) : `Server said ${res.status}`);
  return data;
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Delete tokens for things this device posted.
function tokens() {
  return metaGet('tokens', {});
}
async function keepToken(key, token) {
  const t = { ...tokens(), [key]: token };
  await metaSet('tokens', t);
}
export const ownsPost = (id) => !!tokens()[id];
export const ownsComment = (id) => !!tokens()[`c:${id}`];

export async function listPosts({ tag = '', before = 0, limit = 20, author = '' } = {}) {
  const q = new URLSearchParams();
  if (tag) q.set('tag', tag);
  if (before) q.set('before', String(before));
  if (author) q.set('author', author);
  q.set('limit', String(limit));
  return call('GET', `/api/posts?${q}`);
}

export async function createPost(payload) {
  const res = await call('POST', '/api/posts', payload);
  await keepToken(res.post.id, res.token);
  return res.post;
}

const modHeader = () => (moderatorKey() ? { 'X-Loopwright-Moderator': moderatorKey() } : {});

export async function deletePost(id) {
  await call('DELETE', `/api/posts/${encodeURIComponent(id)}`, null, { 'X-Loopwright-Token': tokens()[id] || '', ...modHeader() });
}

export async function checkModerator(key) {
  const res = await call('GET', '/api/moderator', null, { 'X-Loopwright-Moderator': key });
  return !!res?.moderator;
}

export const toggleLike = (id) => call('POST', `/api/posts/${encodeURIComponent(id)}/like`, {});

export async function addComment(id, payload) {
  const res = await call('POST', `/api/posts/${encodeURIComponent(id)}/comments`, payload);
  await keepToken(`c:${res.comment.id}`, res.token);
  return res.comment;
}

export async function deleteComment(postId, commentId) {
  const t = tokens();
  const token = t[`c:${commentId}`] || t[postId] || '';
  await call('DELETE', `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, null, { 'X-Loopwright-Token': token, ...modHeader() });
}

export const createShare = (envelope) => call('POST', '/api/shares', { envelope });
export const getShare = (code) => call('GET', `/api/shares/${encodeURIComponent(code)}`);
