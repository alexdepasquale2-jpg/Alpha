// Where the browser can't save files (inside an artifact), `download()` hands
// the file here instead: pictures are shown so they can be saved with a long
// press or right-click, and text is shown ready to copy.

import { h, modal, toast } from './dom.js';
import { copyText } from './util.js';

const SHOW_LIMIT = 1_500_000;

export async function saveSheet(filename, blob) {
  if (blob.type.startsWith('image/')) return imageSheet(filename, blob);
  const text = await blob.text();
  const big = text.length > SHOW_LIMIT;
  await modal({
    title: `Save ${filename}`,
    body: h('div.stack.tight',
      h('p.soft', { style: { fontSize: '14px' } }, 'This browser frame can’t save files, so here’s the content to copy. Paste it into a note or a text file named ', h('code', filename), '.'),
      big
        ? h('p.muted', { style: { fontSize: '13px' } }, `${(text.length / 1048576).toFixed(1)} MB: too long to show, but Copy still takes all of it.`)
        : h('textarea.save-text', { readonly: true, rows: 10, 'aria-label': filename, onFocus: (e) => e.target.select() }, text)),
    actions: [
      { label: 'Close', kind: 'ghost', value: null },
      { label: 'Copy', kind: 'primary', ico: 'copy', run: () => { copyText(text).then((ok) => toast(ok ? 'Copied.' : 'Couldn’t copy: select the text and copy it yourself.', ok ? {} : { kind: 'err' })); return false; } },
    ],
  });
}

async function imageSheet(filename, blob) {
  const url = URL.createObjectURL(blob);
  const canCopy = typeof ClipboardItem === 'function' && blob.type === 'image/png';
  await modal({
    title: `Save ${filename}`,
    body: h('div.stack.tight',
      h('img.save-image', { src: url, alt: filename }),
      h('p.muted', { style: { fontSize: '13px' } }, 'Press and hold the picture (phone) or right-click it (computer) to save it.')),
    actions: [
      { label: 'Close', kind: 'ghost', value: null },
      canCopy ? {
        label: 'Copy image', kind: 'primary', ico: 'copy', run: () => {
          navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
            .then(() => toast('Image copied.'), () => toast('Couldn’t copy here: save it with a long press or right-click.', { kind: 'err' }));
          return false;
        },
      } : null,
    ].filter(Boolean),
  });
  URL.revokeObjectURL(url);
}
