// Post: a community board shared by everyone on this Loopwright server, and a
// private journal that never leaves the device.

import { h, mount, btn, iconBtn, input, textarea, segmented, pageHead, confirmDialog, toast, empty, menu, select } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { timeAgo, blobToDataUrl, shrinkImage } from '../core/util.js';
import * as api from '../core/api.js';
import { envelope, makeLink } from '../core/share.js';
import { photo, addPhotos, avatar, richText, tagsFrom, projectProgress } from './common.js';

const POLL_MS = 30000;

export function render(root, route) {
  let tab = route.query.tab || 'community';
  let tag = route.query.tag || '';
  let online = api.lastKnownOnline();
  let posts = [];
  let more = false;
  let trending = [];
  let loading = false;
  let poll = null;

  root.append(pageHead('Post', 'Show your work, ask for help, cheer each other on.'));
  const tabs = segmented([['community', 'Community', 'users'], ['journal', 'My journal', 'book']], tab, (v) => { tab = v; drawFeed(); }, { label: 'Feed' });
  const composerEl = h('div');
  const feedEl = h('div.feed');
  root.append(h('div.cols.side', h('div.stack', composerEl, h('div.row.between.wrap', tabs, h('div.row', btn(null, () => refresh(true), { ico: 'refresh', kind: 'ghost', title: 'Refresh' }))), feedEl), sideInfo()));

  // ---- composer ------------------------------------------------------------
  const draft = { text: '', photos: [], attach: null, where: 'community', keep: true };
  if (route.query.project) {
    const p = store.get('projects', route.query.project);
    if (p) {
      const prog = projectProgress(p);
      draft.text = p.status === 'done' ? `Finished: ${p.name}! #fo ` : `Progress on ${p.name}${prog.step ? `: up to ${prog.step.part} ${prog.step.label}` : ''} #wip `;
      draft.projectId = p.id;
      draft.photos = (p.photoIds || []).slice(-1);
    }
  }

  function drawComposer() {
    const st = store.settings();
    if (!st.name) {
      let name = '';
      const inp = input({ placeholder: 'Display name', maxlength: 40, onInput: (e) => { name = e.target.value; } });
      mount(composerEl, h('div.card',
        h('h3', 'What should people call you?'),
        h('p.soft', { style: { fontSize: '14px' } }, 'Your name is shown on posts and comments. No account, no email.'),
        h('div.row', { style: { marginTop: '10px' } }, h('div.grow', inp), btn('Continue', async () => {
          if (!name.trim()) return;
          await store.saveSettings({ name: name.trim() });
          drawComposer();
        }, { kind: 'primary' }))));
      return;
    }
    const ta = textarea(draft.text, (v) => { draft.text = v; }, { placeholder: 'A finished object, a work in progress, a question… #amigurumi #wip', 'aria-label': 'Post text', rows: 3, maxlength: 4000 });
    const projects = store.all('projects');
    mount(composerEl, h('div.card.composer',
      h('div.row.top', avatar(st.name, st.color), h('div.grow', ta)),
      draft.photos.length ? h('div.attach-grid', { style: { margin: '8px 0 0 46px' } }, draft.photos.map((id) => h('div.ph', photo(id), h('button', { type: 'button', 'aria-label': 'Remove photo', onClick: () => { draft.photos = draft.photos.filter((x) => x !== id); drawComposer(); } }, icon('x'))))) : null,
      draft.attach ? h('div.post-attach', { style: { margin: '10px 0 0 46px' } }, icon(draft.attach.kind === 'chart' ? 'grid' : draft.attach.kind === 'palette' ? 'palette' : 'book'), h('div.grow', h('b', draft.attach.title), h('div.muted', { style: { fontSize: '12.5px' } }, `${draft.attach.kind} · shared with a link`)), iconBtn('x', 'Remove attachment', () => { draft.attach = null; drawComposer(); })) : null,
      h('div.row.wrap.between', { style: { marginTop: '12px', gap: '8px' } },
        h('div.row.wrap', { style: { gap: '4px' } },
          btn('Photo', async () => {
            const ids = await addPhotos({ max: 1600 });
            draft.photos = [...draft.photos, ...ids].slice(0, 4);
            drawComposer();
          }, { ico: 'camera', kind: 'ghost', small: true }),
          btn('Attach', (e) => attachMenu(e.currentTarget), { ico: 'link', kind: 'ghost', small: true }),
          projects.length ? select([['', 'No project'], ...projects.map((p) => [p.id, p.name])], draft.projectId || '', (v) => { draft.projectId = v || null; }, { style: { width: 'auto', minHeight: '32px', padding: '4px 30px 4px 10px', fontSize: '13px' }, 'aria-label': 'Link a project' }) : null),
        h('div.row.wrap', { style: { gap: '8px' } },
          segmented([['community', 'Community'], ['journal', 'Journal only']], draft.where, (v) => { draft.where = v; }, { small: true, label: 'Where to post' }),
          btn('Post', submit, { kind: 'primary', ico: 'send' })))));
  }

  function attachMenu(anchor) {
    const pats = store.all('patterns');
    const charts = store.all('charts');
    const pals = store.all('palettes');
    const pick = async (kind, item) => {
      draft.attach = { kind, title: item.title || item.name, id: item.id };
      drawComposer();
    };
    menu(anchor, [
      ...pats.slice(0, 6).map((p) => ({ label: `Pattern: ${p.title}`, ico: 'book', run: () => pick('pattern', p) })),
      ...charts.slice(0, 4).map((c) => ({ label: `Chart: ${c.name}`, ico: 'grid', run: () => pick('chart', c) })),
      ...pals.slice(0, 4).map((c) => ({ label: `Palette: ${c.name}`, ico: 'palette', run: () => pick('palette', c) })),
      !pats.length && !charts.length && !pals.length ? { label: 'Nothing to attach yet', ico: 'info', run: () => {} } : null,
    ]);
  }

  async function submit() {
    const st = store.settings();
    const text = draft.text.trim();
    if (!text && !draft.photos.length) {
      toast('Write something or add a photo.');
      return;
    }
    const tags = tagsFrom(text);
    let attachment = null;
    if (draft.attach) {
      const src = store.get(draft.attach.kind === 'pattern' ? 'patterns' : draft.attach.kind === 'chart' ? 'charts' : 'palettes', draft.attach.id);
      if (src) {
        const link = await makeLink(envelope(draft.attach.kind, src));
        attachment = { kind: draft.attach.kind, title: draft.attach.title, code: link.code, url: link.url };
      }
    }
    if (draft.where === 'community') {
      if (!(await api.online(true))) {
        toast('Can’t reach the community server, so this went to your journal.', { kind: 'err' });
        draft.where = 'journal';
      } else {
        try {
          const images = [];
          for (const id of draft.photos) {
            const m = await store.getMedia(id);
            if (!m) continue;
            const { blob } = await shrinkImage(m.blob, 1400, 0.82);
            images.push(await blobToDataUrl(blob));
          }
          const post = await api.createPost({
            author: { id: await store.clientId(), name: st.name, color: st.color },
            text, tags, images, attachment: attachment?.code ? attachment : null,
          });
          if (draft.keep) await store.put('journal', { text, tags, photoIds: draft.photos, projectId: draft.projectId || null, attachment, remoteId: post.id, at: Date.now() });
          toast('Posted.');
        } catch (err) {
          toast(err.message, { kind: 'err' });
          return;
        }
      }
    }
    if (draft.where === 'journal') {
      await store.put('journal', { text, tags, photoIds: draft.photos, projectId: draft.projectId || null, attachment, at: Date.now() });
      toast('Saved to your journal.');
      tab = 'journal';
    }
    draft.text = '';
    draft.photos = [];
    draft.attach = null;
    drawComposer();
    await refresh(true);
    if (route.query.project) history.replaceState(null, '', '#/post');
  }

  // ---- feed ----------------------------------------------------------------
  async function refresh(force = false) {
    online = await api.online(force);
    if (tab === 'community' && online) {
      loading = true;
      drawFeed();
      try {
        const res = await api.listPosts({ tag, limit: 20 });
        posts = res.posts;
        more = res.more;
        trending = res.tags || [];
      } catch (err) {
        toast(err.message, { kind: 'err' });
      }
      loading = false;
    }
    drawFeed();
  }

  async function loadMore() {
    const last = posts[posts.length - 1];
    if (!last) return;
    const res = await api.listPosts({ tag, before: last.at, limit: 20 });
    posts = [...posts, ...res.posts];
    more = res.more;
    drawFeed();
  }

  function setTag(t) {
    tag = t;
    tab = 'community';
    refresh(true);
  }

  function drawFeed() {
    tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (i === 0) === (tab === 'community')));
    if (tab === 'journal') {
      const items = store.all('journal', { sort: 'at' });
      mount(feedEl, items.length ? items.map((j) => journalCard(j)) : empty('book', 'Your journal is empty', 'Journal posts stay on this device: progress notes, photos, what you’d do differently next time.'));
      return;
    }
    if (!online) {
      mount(feedEl, h('div.card.stitched',
        h('h3', 'The community board lives on a Loopwright server'),
        h('p.soft', 'Run ', h('code', 'python3 server.py'), ' and open the app from the address it prints: everyone using that server (your guild, your market stall, your friends on the same wifi) shares one board. Until then, posts go to your journal.'),
        btn('Try again', () => refresh(true), { ico: 'refresh', small: true })));
      return;
    }
    mount(feedEl,
      trending.length || tag ? h('div.chips', tag ? h('button.chip.on', { onClick: () => setTag('') }, `#${tag}`, icon('x')) : null, trending.filter((t) => t !== tag).map((t) => h('button.chip', { onClick: () => setTag(t) }, `#${t}`))) : null,
      loading && !posts.length ? h('p.muted.pulse', 'Loading…') : null,
      !loading && !posts.length ? empty('users', tag ? `Nothing tagged #${tag} yet` : 'Be the first to post', 'Share a progress photo or something you finished. Everyone on this server will see it.') : null,
      posts.map((p) => postCard(p)),
      more ? btn('Load more', loadMore, { kind: 'ghost' }) : null);
  }

  function postCard(p) {
    const own = api.ownsPost(p.id);
    const comments = h('div.comments', { hidden: true });
    const likeBtn = btn(p.likes ? String(p.likes) : 'Like', async () => {
      try {
        const r = await api.toggleLike(p.id);
        p.likes = r.likes;
        p.liked = r.liked;
        likeBtn.classList.toggle('liked', r.liked);
        likeBtn.querySelector('span').textContent = r.likes ? String(r.likes) : 'Like';
      } catch (err) {
        toast(err.message, { kind: 'err' });
      }
    }, { ico: 'heart', kind: 'ghost', small: true });
    if (p.liked) likeBtn.classList.add('liked');
    const drawComments = () => {
      const inp = input({ placeholder: 'Add a comment…', maxlength: 1000, 'aria-label': 'Comment' });
      const send = async () => {
        const text = inp.value.trim();
        if (!text) return;
        const st = store.settings();
        if (!st.name) {
          toast('Set your name first (top of this page).');
          return;
        }
        try {
          const c = await api.addComment(p.id, { author: { id: await store.clientId(), name: st.name, color: st.color }, text });
          p.comments = [...(p.comments || []), c];
          drawComments();
          countBtn.querySelector('span').textContent = String(p.comments.length);
        } catch (err) {
          toast(err.message, { kind: 'err' });
        }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      mount(comments,
        (p.comments || []).map((c) => h('div.comment', avatar(c.author.name, c.author.color, true), h('div.body', h('b', c.author.name), c.text, h('div.muted', { style: { fontSize: '11.5px' } }, timeAgo(c.at))),
          api.ownsComment(c.id) || own ? iconBtn('x', 'Delete comment', async () => {
            try {
              await api.deleteComment(p.id, c.id);
              p.comments = p.comments.filter((x) => x.id !== c.id);
              drawComments();
            } catch (err) {
              toast(err.message, { kind: 'err' });
            }
          }) : null)),
        h('div.row', h('div.grow', inp), btn('Send', send, { small: true, kind: 'primary' })));
    };
    const countBtn = btn(String((p.comments || []).length || 'Comment'), () => {
      comments.hidden = !comments.hidden;
      if (!comments.hidden) {
        drawComments();
        comments.querySelector('input')?.focus();
      }
    }, { ico: 'comment', kind: 'ghost', small: true });
    return h('article.post',
      h('header.post-head', avatar(p.author.name, p.author.color), h('div.grow', h('div.who', p.author.name), h('div.when', timeAgo(p.at))),
        own ? iconBtn('more', 'Post options', (e) => menu(e.currentTarget, [{ label: 'Delete post', ico: 'trash', danger: true, run: async () => {
          if (!(await confirmDialog('Delete this post?', 'It will be removed for everyone.', { ok: 'Delete', danger: true }))) return;
          try {
            await api.deletePost(p.id);
            posts = posts.filter((x) => x.id !== p.id);
            drawFeed();
          } catch (err) {
            toast(err.message, { kind: 'err' });
          }
        } }])) : null),
      p.text ? h('div.post-text', richText(p.text, setTag)) : null,
      p.images?.length ? h('div.post-images', { class: `n${Math.min(p.images.length, 2)}` }, p.images.map((src) => h('img', { src, alt: '', loading: 'lazy', onClick: () => lightbox(src) }))) : null,
      p.attachment ? h('a.post-attach', { href: `#/s/${p.attachment.code}` }, icon(p.attachment.kind === 'chart' ? 'grid' : p.attachment.kind === 'palette' ? 'palette' : 'book'),
        h('div.grow', h('b', p.attachment.title), h('div.muted', { style: { fontSize: '12.5px' } }, `Shared ${p.attachment.kind} · tap to preview and save`)), icon('chevron-right')) : null,
      h('footer.post-foot', likeBtn, countBtn),
      comments);
  }

  function journalCard(j) {
    const st = store.settings();
    const proj = j.projectId ? store.get('projects', j.projectId) : null;
    return h('article.post',
      h('header.post-head', avatar(st.name || 'Me', st.color), h('div.grow', h('div.who', st.name || 'Me', j.remoteId ? h('span.chip.sage', { style: { marginLeft: '8px' } }, 'posted') : h('span.chip', { style: { marginLeft: '8px' } }, 'private')), h('div.when', `${timeAgo(j.at || j.createdAt)}${proj ? ` · ${proj.name}` : ''}`)),
        iconBtn('more', 'Journal options', (e) => menu(e.currentTarget, [
          proj ? { label: 'Open project', ico: 'plan', run: () => go(`/plan/projects/${proj.id}`) } : null,
          { label: 'Delete from journal', ico: 'trash', danger: true, run: async () => { if (await confirmDialog('Delete this entry?', 'It will be removed from your journal on this device.', { ok: 'Delete', danger: true })) store.remove('journal', j.id); } },
        ]))),
      j.text ? h('div.post-text', richText(j.text, null)) : null,
      j.photoIds?.length ? h('div.post-images', { class: `n${Math.min(j.photoIds.length, 2)}` }, j.photoIds.map((id) => {
        const img = photo(id);
        img.addEventListener('click', () => lightbox(img.src));
        return img;
      })) : null,
      j.attachment ? h('a.post-attach', { href: j.attachment.code ? `#/s/${j.attachment.code}` : j.attachment.url?.replace(/^.*#/, '#') || '#/share' }, icon('link'), h('div.grow', h('b', j.attachment.title), h('div.muted', { style: { fontSize: '12.5px' } }, j.attachment.kind)), icon('chevron-right')) : null);
  }

  function lightbox(src) {
    const lb = h('div.lightbox', { role: 'dialog', 'aria-label': 'Photo', onClick: () => lb.remove() }, h('img', { src, alt: '' }));
    const esc = (e) => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
    document.body.append(lb);
  }

  function sideInfo() {
    const st = store.settings();
    return h('div.stack',
      h('div.card',
        h('h3', 'Posting as'),
        h('div.row', { style: { marginTop: '8px' } }, avatar(st.name || '?', st.color), h('div.grow', h('b', st.name || 'No name yet'), h('div.muted', { style: { fontSize: '12.5px' } }, 'Change in Settings'))),
        h('p.muted', { style: { fontSize: '12.5px', marginTop: '10px' } }, 'No accounts. Only this device can delete what it posts.')),
      h('div.card',
        h('h3', 'Tags people use'),
        h('div.chips', { style: { marginTop: '8px' } }, ['wip', 'fo', 'amigurumi', 'granny', 'c2c', 'help', 'stash', 'gift'].map((t) => h('button.chip', { onClick: () => setTag(t) }, `#${t}`)))));
  }

  drawComposer();
  drawFeed();
  refresh(true);
  poll = setInterval(() => { if (document.visibilityState === 'visible' && tab === 'community') refresh(); }, POLL_MS);
  const off = store.on('journal', () => { if (tab === 'journal') drawFeed(); });
  return () => { clearInterval(poll); off(); };
}

