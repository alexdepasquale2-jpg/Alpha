// Settings: who you are, how you like to work, and your data.

import { h, btn, field, input, numberInput, select, segmented, pageHead, confirmDialog, toast, toggle } from '../core/dom.js';
import { icon } from '../core/icons.js';
import * as store from '../core/store.js';
import { go } from '../core/router.js';
import { online, serverInfo, moderatorKey, setModeratorKey, checkModerator } from '../core/api.js';
import { avatar } from './common.js';
import { clearSamples } from './seed.js';
import { applyTheme } from '../core/theme.js';
import { canInstall, install, isInstalled } from '../core/install.js';

const COLORS = ['#b4481f', '#93391a', '#c08a1e', '#5c7a57', '#2f6690', '#7a4a78', '#a3294a', '#3b3b3b'];

export function render(root) {
  let st = store.settings();
  const save = async (patch) => {
    st = await store.saveSettings(patch);
    return st;
  };
  const avatarBox = h('span');
  const drawAvatar = () => avatarBox.replaceChildren(avatar(st.name || '?', st.color));
  drawAvatar();

  root.append(
    pageHead('Settings', 'Make Loopwright work the way you do.'),
    h('div.cols',
      h('div.stack',
        h('div.card',
          h('h3', 'You'),
          h('div.row', { style: { margin: '10px 0' } }, avatarBox,
            h('div.grow', field('Display name', input({ value: st.name, maxlength: 40, placeholder: 'Your name or maker handle', onChange: async (e) => { await save({ name: e.target.value.trim() }); drawAvatar(); toast('Saved.'); } })))),
          h('div.field-label', { style: { marginBottom: '6px' } }, 'Color'),
          h('div.row.wrap', COLORS.map((c) => h('button', {
            type: 'button', 'aria-label': `Use ${c}`, style: { width: '34px', height: '34px', borderRadius: '50%', border: '3px solid var(--surface)', boxShadow: `0 0 0 ${st.color === c ? 2 : 1}px ${st.color === c ? 'var(--ink)' : 'var(--line-2)'}`, background: c, cursor: 'pointer' },
            onClick: async (e) => { await save({ color: c }); drawAvatar(); e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => { b.style.boxShadow = `0 0 0 ${b === e.currentTarget ? 2 : 1}px ${b === e.currentTarget ? 'var(--ink)' : 'var(--line-2)'}`; }); },
          })))),
        h('div.card',
          h('h3', 'How you crochet'),
          h('div.stack', { style: { marginTop: '10px' } },
            field('Pattern terms', segmented([['US', 'US (sc, hdc, dc)'], ['UK', 'UK (dc, htr, tr)']], st.terms, (v) => save({ terms: v })), 'New patterns start in these terms, and the stitch dictionary leads with them.'),
            field('Units', segmented([['in', 'Inches & yards'], ['cm', 'Centimetres & metres']], st.units, (v) => save({ units: v }))),
            field('Hand', segmented([['right', 'Right-handed'], ['left', 'Left-handed']], st.handed, (v) => save({ handed: v })), 'Sets which way tapestry rows read in charts.'),
            field('Theme', segmented([['auto', 'Match device', 'eye'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']], st.theme, async (v) => { applyTheme(v); await save({ theme: v }); })))),
        h('div.card',
          h('h3', 'Estimates'),
          h('div.fields', { style: { marginTop: '10px' } },
            field('Your speed', h('div.input-group', numberInput(st.speed, (v) => save({ speed: Math.max(1, v || 20) }), { min: 1, step: 1 }), h('span.addon', 'sc / minute')), 'Most people make 15–30'),
            field('Yarn use', select([[0.8, 'I crochet tight (−20%)'], [0.9, 'A bit tight (−10%)'], [1, 'Average'], [1.1, 'A bit loose (+10%)'], [1.2, 'I crochet loose (+20%)']], st.yarnCalibration || 1, (v) => save({ yarnCalibration: Number(v) })), 'Nudges every yardage estimate')),
          h('div.fields', { style: { marginTop: '12px' } },
            field('Hourly rate', numberInput(st.rate, (v) => save({ rate: v || 0 }), { min: 0 }), 'For pricing what you sell'),
            field('Currency symbol', input({ value: st.currency, maxlength: 4, onChange: (e) => save({ currency: e.target.value || '$' }) })))),
        h('div.card',
          h('h3', 'While you work'),
          h('div.stack.tight', { style: { marginTop: '10px' } },
            toggle('Vibrate on taps', !!st.haptics, (v) => save({ haptics: v }), 'On phones that support it')))),
      h('div.stack',
        h('div.card',
          h('h3', 'Your data'),
          h('p.soft', { style: { fontSize: '14px', margin: '6px 0 12px' } }, 'Projects, patterns, stash, charts and your journal are stored in this browser on this device. Nothing leaves it unless you post or share it.'),
          h('div.btn-row',
            btn('Backup and restore', () => go('/share'), { ico: 'archive' }),
            btn('Remove sample content', async () => {
              if (!(await confirmDialog('Remove the samples?', 'The Pocket Whale pattern and the other example projects, yarns and charts will be deleted. Your own things stay.', { ok: 'Remove samples' }))) return;
              const n = await clearSamples();
              toast(`Removed ${n} sample items.`);
            }, { kind: 'ghost', ico: 'trash' }))),
        isInstalled() ? null : h('div.card',
          h('h3', 'Install the app'),
          h('p.soft', { style: { fontSize: '14px', margin: '6px 0 12px' } }, 'Runs full screen, opens from your home screen, and works offline at the market or on the train.'),
          canInstall()
            ? btn('Install Loopwright', async () => { if (await install()) toast('Installed. Find it on your home screen.'); }, { kind: 'primary', ico: 'download' })
            : h('p.muted', { style: { fontSize: '13px' } }, 'On iPhone or iPad: tap Share, then “Add to Home Screen”. On Android: browser menu → “Install app”.')),
        h('div.card',
          h('h3', 'Community server'),
          (() => {
            const status = h('div.row', { style: { marginTop: '8px' } }, h('span.dot'), h('span', 'Checking…'));
            const mod = h('div');
            online(true).then((ok) => {
              status.replaceChildren(h('span.dot', { class: ok ? 'on' : '' }), h('span', ok ? 'Connected. Posts and short share codes are on.' : 'Not connected. Everything else still works.'));
              if (!ok || !serverInfo().moderation) return;
              let key = moderatorKey();
              const draw = () => mod.replaceChildren(h('div.field-label', { style: { margin: '14px 0 6px' } }, 'Moderator key'),
                moderatorKey()
                  ? h('div.row', h('span.chip.sage', icon('check'), 'This device can remove posts and comments'), btn('Forget key', () => { setModeratorKey(''); draw(); }, { small: true, kind: 'ghost' }))
                  : h('div.row', h('div.grow', input({ type: 'password', placeholder: 'From whoever runs this server', autocomplete: 'off', onInput: (e) => { key = e.target.value; } })),
                    btn('Check', async () => {
                      try {
                        if (await checkModerator(key)) {
                          setModeratorKey(key);
                          toast('Moderator key accepted.');
                          draw();
                        } else toast('That key isn’t right.', { kind: 'err' });
                      } catch (err) {
                        toast(err.message, { kind: 'err' });
                      }
                    }, { small: true })));
              draw();
            });
            return h('div', status, mod);
          })(),
          h('p.muted', { style: { fontSize: '13px', marginTop: '8px' } }, 'Start one with python3 server.py and open Loopwright from the address it prints. Anyone on the same network can join the board.')),
        h('div.card',
          h('h3', 'Keyboard'),
          h('dl.kv', { style: { marginTop: '8px' } },
            h('dt', h('kbd', 'Space')), h('dd', 'Next stitch or row (Build)'),
            h('dt', h('kbd', '←')), h('dd', 'Back (Build)'),
            h('dt', h('kbd', 'Space')), h('dd', 'Shuffle palette (Imagine)'),
            h('dt', h('kbd', 'B G L R E I')), h('dd', 'Chart tools'),
            h('dt', h('kbd', 'Ctrl Z')), h('dd', 'Undo in charts'))),
        h('div.card.flat', { style: { background: 'transparent' } },
          h('div.row', icon('yarn'), h('div', h('b', 'Loopwright 1.0'), h('div.muted', { style: { fontSize: '13px' } }, 'Plan · create · post · share · build · imagine')))))));
  return null;
}
