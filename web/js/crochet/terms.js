// US <-> UK terminology. The two systems reuse the same words for different
// stitches (US dc is UK tr, UK dc is US sc), so conversion happens in a single
// regex pass: every term is matched once and replaced once, never chained.

const US_TO_UK = [
  ['single crochet', 'double crochet'],
  ['half double crochet', 'half treble crochet'],
  ['double crochet', 'treble crochet'],
  ['treble crochet', 'double treble crochet'],
  ['triple crochet', 'double treble crochet'],
  ['double treble crochet', 'triple treble crochet'],
  ['double treble', 'triple treble'],
  ['slip stitch', 'slip stitch'],
  ['gauge', 'tension'],
  ['yarn over', 'yarn round hook'],
  ['skip', 'miss'],
  ['sc', 'dc'],
  ['hdc', 'htr'],
  ['dc', 'tr'],
  ['tr', 'dtr'],
  ['trc', 'dtr'],
  ['dtr', 'trtr'],
  ['yo', 'yrh'],
  ['sk', 'miss'],
  ['sl st', 'ss'],
  ['esc', 'edc'],
  ['fsc', 'fdc'],
  ['fdc', 'ftr'],
  ['csc', 'cdc'],
];

const UK_TO_US = [
  ['double crochet', 'single crochet'],
  ['half treble crochet', 'half double crochet'],
  ['half treble', 'half double crochet'],
  ['treble crochet', 'double crochet'],
  ['double treble crochet', 'treble crochet'],
  ['double treble', 'treble crochet'],
  ['triple treble crochet', 'double treble crochet'],
  ['triple treble', 'double treble'],
  ['tension', 'gauge'],
  ['yarn round hook', 'yarn over'],
  ['yarn over hook', 'yarn over'],
  ['miss', 'skip'],
  ['dc', 'sc'],
  ['htr', 'hdc'],
  ['tr', 'dc'],
  ['dtr', 'tr'],
  ['trtr', 'dtr'],
  ['yrh', 'yo'],
  ['yoh', 'yo'],
  ['ss', 'sl st'],
  ['edc', 'esc'],
  ['fdc', 'fsc'],
  ['ftr', 'fdc'],
  ['cdc', 'csc'],
];

// Stitch abbreviations can carry prefixes and suffixes: FPdc, BPdc, dc2tog,
// dc3tog, "dc-cl". Only the stitch core is swapped.
const PREFIX = '(fp|bp)?';
const SUFFIX = '(\\d+tog)?';

function buildConverter(pairs) {
  const map = new Map(pairs.map(([a, b]) => [a.toLowerCase(), b]));
  // Longest first so "half double crochet" wins over "double crochet".
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  // "miss"/"skip" only when followed by something that looks like a count or a
  // stitch, so ordinary prose ("don't miss the last stitch") survives.
  const re = new RegExp(`(?<![A-Za-z])${PREFIX}(${escaped.join('|')})${SUFFIX}(?![A-Za-z])`, 'gi');
  return (text) =>
    text.replace(re, (whole, pre = '', word, suf = '', offset, str) => {
      const key = word.toLowerCase().replace(/\s+/g, ' ');
      if ((key === 'miss' || key === 'skip' || key === 'sk')) {
        const after = str.slice(offset + whole.length, offset + whole.length + 12).toLowerCase();
        if (!/^\s*(next|\d|the|\w+\s*(st|ch|sp)|st|ch|sp|over|1)/.test(after)) return whole;
      }
      const to = map.get(key);
      if (to === undefined) return whole;
      return (pre || '') + matchCase(word, to) + (suf || '');
    });
}

function matchCase(src, dst) {
  if (src === src.toUpperCase() && /[A-Z]/.test(src)) return dst.toUpperCase();
  if (src[0] === src[0].toUpperCase() && /[A-Z]/.test(src[0])) return dst[0].toUpperCase() + dst.slice(1);
  return dst;
}

export const usToUk = buildConverter(US_TO_UK);
export const ukToUs = buildConverter(UK_TO_US);

export function convertTerms(text, from, to) {
  if (from === to) return text;
  return from === 'US' ? usToUk(text) : ukToUs(text);
}

/**
 * A rough guess at which system a pattern is written in. UK patterns never use
 * "sc" or "hdc"; US patterns never use "htr" or "dtr" as their basic stitches.
 */
export function detectTerms(text) {
  const t = ` ${text.toLowerCase()} `;
  const count = (re) => (t.match(re) || []).length;
  const us = count(/[^a-z](sc|hdc|sc2tog|single crochet|half double|skip|sk|yo|gauge)[^a-z]/g);
  const uk = count(/[^a-z](htr|dtr|ss|miss|yrh|tension|half treble)[^a-z]/g);
  if (us === 0 && uk === 0) return null;
  return uk > us ? 'UK' : 'US';
}
