// The pattern checker: reads written crochet instructions line by line, works
// out how many stitches each row eats from the row below and how many it
// leaves behind, and compares that to the count the pattern declares.
//
//   Rnd 3: (sc, inc) x6 (18)       -> consumes 12, produces 18, declared 18
//
// It is deliberately forgiving: anything it can't read becomes a note on the
// line rather than a failure, and a line it only partly understood never
// raises a hard error, only a hint. Everything here is US terms; UK patterns
// are converted before they get here.

import { stitchInfo } from './stitches.js';
import { ukToUs } from './terms.js';

const MAX_ATOMS = 1500;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const NUMBER_WORDS = {
  once: '1 times', twice: '2 times', thrice: '3 times',
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7',
  eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
};

// Ordered rewrites applied to the lowercased body. Multi-word stitch names
// collapse to single tokens so the tokenizer never has to look ahead.
const REWRITES = [
  [/[×✕✖]/g, ' x '],
  [/[–—−]/g, '-'],
  [/[’‘]/g, "'"],
  [/\b(?:rep(?:eat)?|rpt)\b/g, 'rep'],
  [/\bsl(?:ip)?[\s-]*st(?:itch(?:es)?|s)?\b/g, 'slst'],
  [/\bhalf[\s-]+double[\s-]+crochets?\b/g, 'hdc'],
  [/\bsingle[\s-]+crochets?\b/g, 'sc'],
  [/\bdouble[\s-]+treble(?:[\s-]+crochets?)?\b/g, 'dtr'],
  [/\bdouble[\s-]+crochets?\b/g, 'dc'],
  [/\b(?:treble|triple)[\s-]+crochets?\b/g, 'tr'],
  [/\btrc\b/g, 'tr'],
  [/\bfront[\s-]+post[\s-]*(sc|hdc|dc|tr)\b/g, 'fp$1'],
  [/\bback[\s-]+post[\s-]*(sc|hdc|dc|tr)\b/g, 'bp$1'],
  [/\b(fp|bp)[\s-]+(sc|hdc|dc|tr)\b/g, '$1$2'],
  [/\binv(?:isible)?[\s-]*dec(?:rease)?s?\b/g, 'invdec'],
  [/\bincreases?\b/g, 'inc'],
  [/\bincs\b/g, 'inc'],
  [/\bdecreases?\b/g, 'dec'],
  [/\bdecs\b/g, 'dec'],
  [/\b(sc|hdc|dc|tr)[\s-]*(\d)[\s-]*tog\b/g, '$1$2tog'],
  [/\b(?:magic|adjustable)[\s-]+(?:ring|circle|loop)\b/g, 'mr'],
  [/\bmagic ring\b/g, 'mr'],
  [/\bpuff[\s-]*st(?:itch)?(?:es)?\b/g, 'puff'],
  [/\bbobble[\s-]*st(?:itch)?(?:es)?\b/g, 'bobble'],
  [/\bpopcorn[\s-]*st(?:itch)?(?:es)?\b/g, 'pc'],
  [/\bpopcorns?\b/g, 'pc'],
  [/\bbobbles\b/g, 'bobble'],
  [/\bpuffs\b/g, 'puff'],
  [/\bshells\b/g, 'shell'],
  [/\bv[\s-]*st(?:itch)?(?:es)?\b/g, 'vst'],
  [/\bx[\s-]*st(?:itch)?(?:es)?\b/g, 'xst'],
  [/\bspike[\s-]*(?:sc|st(?:itch)?)\b/g, 'spike'],
  [/\b(?:reverse|rev)[\s-]*sc\b/g, 'crab'],
  [/\bcrab[\s-]*st(?:itch)?\b/g, 'crab'],
  [/\bextended[\s-]*sc\b/g, 'esc'],
  [/\bfoundation[\s-]*(sc|hdc|dc)\b/g, 'f$1'],
  [/\b(?:ch(?:ain)?[\s-]*\d*[\s-]*(?:sp(?:ace)?s?)|spaces?|sps)\b/g, 'sp'],
  [/\bcorner\s+sp\b/g, 'sp'],
  [/\bchains?\b/g, 'ch'],
  [/\bchs\b/g, 'ch'],
  [/\bstitch(?:es)?\b/g, 'st'],
  [/\bsts\b/g, 'st'],
  [/\b(?:skip|miss)\b/g, 'sk'],
  [/\bremaining\b/g, 'rem'],
  [/\bfasten(?:ed)?\s+off\b/g, 'fo'],
  [/\b(\d+)(?:st|nd|rd|th)\s+(?:ch|st)\s+from\s+(?:the\s+)?hook\b/g, 'fromhook$1'],
];

// Loop modifiers are pulled out of the text and reported on the line.
const MODIFIERS = [
  [/\bin\s+(?:the\s+)?back\s+loops?(?:\s+only)?\b|\bthrough\s+(?:the\s+)?back\s+loops?(?:\s+only)?\b|\bback\s+loops?\s+only\b|\bblo\b|\bbl\b/g, 'BLO'],
  [/\bin\s+(?:the\s+)?front\s+loops?(?:\s+only)?\b|\bfront\s+loops?\s+only\b|\bflo\b|\bfl\b/g, 'FLO'],
  [/\b(?:in\s+(?:the\s+)?)?(?:3rd|third)\s+loops?(?:\s+only)?\b|\bback\s+bump\b/g, '3rd loop'],
];

function normalise(body) {
  let s = ` ${body.toLowerCase()} `;
  const mods = [];
  for (const [re, name] of MODIFIERS) {
    if (re.test(s)) {
      mods.push(name);
      s = s.replace(re, ' ');
    }
    re.lastIndex = 0;
  }
  for (const [re, to] of REWRITES) s = s.replace(re, to);
  s = s.replace(/\b(once|twice|thrice|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (w) => NUMBER_WORDS[w]);
  // "6sc" -> "6 sc", "sc6" -> "sc 6", but keep "sc2tog" and "fromhook2" whole.
  s = s.replace(/\b(\d+)([a-z]+)\b/g, (m, n, w) => (/^(st|nd|rd|th)$/.test(w) ? m : `${n} ${w}`));
  s = s.replace(/\b([a-z]+)(\d+)\b/g, (m, w) => (w === 'fromhook' || /tog$/.test(m) ? m : m.replace(/([a-z]+)(\d+)/, '$1 $2')));
  s = s.replace(/([)\]}])\s*\*\s*(\d+)/g, '$1 x $2');
  s = s.replace(/\baround\s+(?:the\s+)?(?:post\s+of\s+)?(?:the\s+)?(next|each|first|last|same|following|every)\b/g, 'in $1');
  s = s.replace(/\bx\s*(\d)/g, 'x $1');
  s = s.replace(/(\d)\s*x\b/g, '$1 x');
  s = s.replace(/([()[\]{},;*:])/g, ' $1 ');
  s = s.replace(/\s+/g, ' ').trim();
  return { text: s, mods };
}

// ---------------------------------------------------------------------------
// Line framing: label, declared count, kind
// ---------------------------------------------------------------------------

const LABEL_RE = /^\s*(rounds?|rnds?|rds?|rows?|r)\.?\s*(\d+)(?:\s*(?:-|–|—|to|through|thru|&|and)\s*(?:rounds?|rnds?|rds?|rows?|r)?\.?\s*(\d+))?\s*(\(\s*(?:rs|ws|right side|wrong side)\s*\))?\s*[:.)-]?\s*/i;
const BARE_LABEL_RE = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*[:.)]\s+/;
const DECLARED_RE = /(?:[([{<]\s*(?:=\s*)?(\d+)\s*(st|sts|stitches|sc|hdc|dc|tr|total|stitch)?\s*\.?\s*[)\]}>]|(?:[-=:]|→|->)\s*(\d+)\s*(?:st|sts|stitches)\b\.?)\s*\.?\s*$/i;

const TOTALS_RE = /[([]\s*((?:\d+\s+[a-z][a-z0-9-]*(?:\s+(?:sps?|spaces?))?\s*(?:,|and|&)?\s*)+)[)\]]\s*\.?\s*$/i;

function frame(raw) {
  const out = { label: null, num: null, numTo: null, side: null, word: null, body: raw.trim(), declared: null };
  let m = LABEL_RE.exec(raw);
  if (m) {
    out.word = m[1].toLowerCase();
    out.num = Number(m[2]);
    out.numTo = m[3] ? Number(m[3]) : out.num;
    if (m[4]) out.side = /w/i.test(m[4]) ? 'WS' : 'RS';
    out.body = raw.slice(m[0].length).trim();
  } else if ((m = BARE_LABEL_RE.exec(raw))) {
    out.word = '';
    out.num = Number(m[1]);
    out.numTo = m[2] ? Number(m[2]) : out.num;
    out.body = raw.slice(m[0].length).trim();
  }
  if (out.numTo !== null && out.numTo < out.num) out.numTo = out.num;
  const d = DECLARED_RE.exec(out.body);
  if (d) {
    out.declared = Number(d[1] ?? d[3]);
    if (d[2] && /^(sc|hdc|dc|tr)$/i.test(d[2])) out.declaredUnit = d[2].toLowerCase();
    out.body = out.body.slice(0, d.index).replace(/[\s,.;]+$/, '');
  } else {
    // Itemised totals: "(24 dc, 4 ch-2 sps)", "[12 sc and 6 bobbles]".
    const t = TOTALS_RE.exec(out.body);
    if (t) {
      out.totals = [...t[1].matchAll(/(\d+)\s+([a-z][a-z0-9-]*(?:\s+(?:sps?|spaces?))?)/gi)].map((x) => ({ n: Number(x[1]), what: x[2] }));
      out.totalsText = t[1].trim();
      out.body = out.body.slice(0, t.index).replace(/[\s,.;]+$/, '');
    }
  }
  const side = /\(\s*(rs|ws)\s*\)/i.exec(out.body);
  if (side && !out.side) out.side = side[1].toUpperCase();
  return out;
}

// ---------------------------------------------------------------------------
// Tokens -> item tree
// ---------------------------------------------------------------------------

const SEPARATORS = new Set([',', ';', 'and', 'then', ':']);
const OPEN = { '(': ')', '[': ']', '{': '}' };
const NOTE_START = /^(fo|stuff|weave|place|pm|move|leave|cut|finish|close|sew|with|change|switch|drop|pick|carry|work|working|continue|using|note|do not|don't|dont|begin|beg|attach|insert|embroider|fill|pull|secure|make|repeat for|this|you|it|each round|each row|marker|safety|mark|remove|join new|join colou?r|join yarn|colou?r|go to|flatten|fold|tie|hide|block|rs|ws|right side|wrong side|end|ending|next|now|start|counts|count|does|do)\b/;

function pretty(text) {
  return text.replace(/ ([,;:)\]}])/g, '$1').replace(/([([{]) /g, '$1');
}

function tokenize(text) {
  return text.split(' ').filter(Boolean);
}

function isSep(tok) {
  return SEPARATORS.has(tok);
}

function findClose(tokens, i) {
  const open = tokens[i];
  const close = OPEN[open];
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    if (tokens[j] === open) depth++;
    else if (tokens[j] === close) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return tokens.length;
}

// Tokens up to the next separator at this depth (the suffix of a group:
// "x 6", "around", "in next st", "5 more times").
function takeSuffix(tokens, i) {
  const out = [];
  while (i < tokens.length && !isSep(tokens[i]) && !OPEN[tokens[i]] && tokens[i] !== '*') {
    out.push(tokens[i]);
    i++;
  }
  return [out, i];
}

// Locate a star repeat starting at i (tokens[i] === '*'). Handles
//   *sc, inc* x6        *sc, inc; rep from * around        *sc 2, inc* rep 5 times
function starRegion(tokens, i) {
  let depth = 0;
  for (let j = i + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (OPEN[t]) depth++;
    else if (Object.values(OPEN).includes(t)) depth--;
    if (depth > 0) continue;
    if (t === 'rep' && tokens[j + 1] === 'from' && tokens[j + 2] === '*') {
      let end = j;
      while (end > i + 1 && isSep(tokens[end - 1])) end--;
      const [suffix, after] = takeSuffix(tokens, j + 3);
      return { inner: tokens.slice(i + 1, end), suffix, next: after, fromRep: true };
    }
    if (t === '*' && tokens[j - 1] !== 'from') {
      const [suffix, after] = takeSuffix(tokens, j + 1);
      return { inner: tokens.slice(i + 1, j), suffix, next: after, fromRep: false };
    }
  }
  // An unclosed star: treat everything after it as the repeat, once.
  return { inner: tokens.slice(i + 1), suffix: [], next: tokens.length, fromRep: false };
}

function parseSeq(tokens) {
  const items = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (isSep(tok)) {
      i++;
      continue;
    }
    if (tok === '*') {
      const r = starRegion(tokens, i);
      const group = { t: 'group', items: parseSeq(r.inner), reps: 1, place: null, text: pretty(r.inner.join(' ')) };
      applySuffix(group, r.suffix, r.fromRep);
      items.push(group);
      i = r.next;
      continue;
    }
    if (OPEN[tok]) {
      const j = findClose(tokens, i);
      const inner = tokens.slice(i + 1, j);
      const [suffix, after] = takeSuffix(tokens, j + 1);
      const innerText = inner.join(' ');
      const aside = /\bcounts?\b|\bcounted\b|\bturning\b/.test(innerText);
      const innerItems = aside ? [] : parseSeq(inner);
      if (!innerItems.some(isWork)) {
        // A parenthetical with no stitches: "(counts as dc)", "(RS)", "(20 + 1)".
        const text = inner.join(' ');
        const prev = items[items.length - 1];
        if (/counts?\s+as/.test(text) && !/not|n't/.test(text) && prev) {
          const as = /counts? as (?:a |an |the |first |1st |beg )*([a-z0-9]+)/.exec(text);
          prev.countsAs = as && STITCH_WORD.test(as[1]) ? as[1] : true;
        }
        items.push({ t: 'note', text });
        if (suffix.length) items.push(parsePhrase(suffix, items));
      } else {
        const group = { t: 'group', items: innerItems, reps: 1, place: null, text: pretty(inner.join(' ')) };
        applySuffix(group, suffix, false);
        items.push(group);
      }
      i = after;
      continue;
    }
    // A plain phrase: up to the next separator, bracket or star.
    const phrase = [];
    while (i < tokens.length && !isSep(tokens[i]) && !OPEN[tokens[i]] && tokens[i] !== '*') {
      phrase.push(tokens[i]);
      i++;
    }
    // "rep ... times" after a separator modifies the previous group.
    if (phrase[0] === 'rep') {
      const last = [...items].reverse().find(isWork);
      if (last && last.t === 'group') {
        applySuffix(last, phrase.slice(1), true);
        continue;
      }
      // "FPdc in next st, BPdc in next st; rep across": no brackets, so the
      // repeat is everything since the start (after any turning chain).
      let start = 0;
      while (start < items.length && (items[start].t === 'note' || items[start].t === 'ch' || items[start].t === 'join' || items[start].t === 'move')) start++;
      const body = items.splice(start);
      if (body.some(isWork)) {
        const group = { t: 'group', items: body, reps: 1, place: null, text: body.map((b) => b.text).filter(Boolean).join(', ') };
        applySuffix(group, phrase.slice(1), true);
        items.push(group);
        continue;
      }
      items.push(...body);
    }
    if (phrase.length) items.push(parsePhrase(phrase, items));
  }
  return items;
}

function isWork(item) {
  return item.t === 'st' || item.t === 'group' || item.t === 'ch' || item.t === 'skip' || item.t === 'mr';
}

// Repeat counts and placement for a group or stitch, read from its suffix.
function applySuffix(node, suffix, fromRep) {
  const s = ` ${suffix.join(' ')} `;
  let m;
  if ((m = / (\d+) more times? /.exec(s)) || (m = / (\d+) times? more /.exec(s))) {
    node.reps = Number(m[1]) + 1;
  } else if ((m = / x (\d+) /.exec(s)) || (m = / (\d+) times? /.exec(s)) || (m = / (\d+) x /.exec(s))) {
    const n = Number(m[1]);
    if (fromRep) {
      // "rep from * 5 times" is ambiguous between 5 in total and 5 more.
      node.reps = n + 1;
      node.repsAlt = n;
    } else {
      node.reps = n;
    }
  } else if (/ (around|across|to end|to the end|rem|in each|in every) /.test(s) || (fromRep && !/ to last /.test(s) && suffix.length === 0)) {
    node.reps = 'fill';
  }
  if ((m = / to (?:the )?last (\d+)? ?(?:st|ch|sp)? /.exec(s))) {
    node.reps = 'fill';
    node.reserve = m[1] ? Number(m[1]) : 1;
  }
  const place = placementOf(s);
  if (place) {
    if (node.t === 'group') node.place = place;
    else if (!node.place) node.place = place;
    if (place === 'each') node.reps = 'fill';
  }
}

// Where a stitch or group goes, from phrasing like "in next st".
function placementOf(s) {
  if (/ in(?:to)? (?:the )?(?:mr|ring|center|centre) /.test(s)) return 'ring';
  if (/ in(?:to)? (?:the )?same (?:st|ch|sp|place)? ?/.test(s) || / in (?:the )?st just made /.test(s)) return 'same';
  if (/ in(?:to)? (?:each|every) (?:rem )?(?:st|ch|sp|sc|dc|hdc)? ?/.test(s)) return 'each';
  if (/ in(?:to)? (?:the )?(?:next |first |last |following |beg |top of |each )?(?:\d+ )?(?:sp|ch-sp) /.test(s)) return 'sp';
  if (/ in(?:to)? (?:the )?(?:next|following|first|last) (?:st|ch|sc|dc|hdc)? ?/.test(s)) return 'next';
  if (/ in(?:to)? (?:the )?(?:next|following) /.test(s)) return 'next';
  return null;
}

const STITCH_WORD = /^(ch|slst|sc|hdc|dc|tr|dtr|inc|dec|invdec|fsc|fdc|fhdc|esc|crab|spike|bobble|puff|pc|shell|vst|xst|picot|waistcoat|csc|camel|(?:fp|bp)(?:sc|hdc|dc|tr)|(?:sc|hdc|dc|tr|dtr)\dtog)$/;
const ALIAS = { csc: 'waistcoat', bo: 'bobble', ps: 'puff', popcorn: 'pc', cl: 'bobble' };

function parsePhrase(tokens, siblings) {
  const text = pretty(tokens.join(' '));
  let m;

  if (/^(turn|ch \d+ (?:and )?turn|ch (?:and )?turn)$/.test(text)) {
    m = /^ch (\d+)/.exec(text);
    return { t: 'ch', n: m ? Number(m[1]) : 0, turning: true, text };
  }
  // Joins never count: "join", "sl st to first sc", "join with sl st to top of ch-3".
  if (/^join\b/.test(text) || (/^slst\b/.test(text) && /\b(join|first|1st|beg|beginning|starting|top)\b/.test(text) && !/\bnext \d/.test(text))) {
    return { t: 'join', text };
  }
  if (/^(make |start with |begin with )?(a )?mr$/.test(text)) return { t: 'mr', text };
  // "sl st to next ch-2 sp", "sl st across next 2 sts": repositioning, not fabric.
  if (/^slst (?:to|into|over|across|along|in(?:to)? next (?:sp|ch-sp))\b/.test(text) && !/join|first|beg|top/.test(text)) return { t: 'move', text };
  if (/^(do not turn|don'?t turn)/.test(text)) return { t: 'note', text };
  // "ending with 3 dc in last sc" rewrites the final repeat; don't guess.
  if (/^(ending|end|finishing|finish)\b/.test(text)) return { t: 'unknown', text, soft: true };

  // Chains: "ch 3", "3 ch", "ch 20 and join to form a ring".
  if ((m = /^ch (\d+)\b(.*)$/.exec(text)) || (m = /^(\d+) ch\b(.*)$/.exec(text)) || (m = /^ch()$/.exec(text))) {
    const n = m[1] ? Number(m[1]) : 1;
    const rest = m[2] || '';
    const ring = /join|ring|circle/.test(rest);
    const turning = /turn/.test(rest);
    return { t: 'ch', n, ring, turning, text, place: placementOf(` ${rest} `) };
  }
  if ((m = /^sk (?:next |the next |over )?(\d+)?/.exec(text))) {
    const n = m[1] ? Number(m[1]) : 1;
    return { t: 'skip', n, text };
  }

  // Find the stitch word.
  // "ch" after "in each" / "in next 3" is a place, not a stitch to make.
  const NOUN_AFTER = /^(in|into|each|every|next|same|first|last|following|rem|the|of|from|\d+)$/;
  let idx = tokens.findIndex((tk, k) => STITCH_WORD.test(ALIAS[tk] || tk) && !(tk === 'ch' && k > 0 && NOUN_AFTER.test(tokens[k - 1])));
  let st = idx >= 0 ? ALIAS[tokens[idx]] || tokens[idx] : null;
  let inherited = false;
  if (!st && /^(in|into|and in|work in)\b/.test(text)) {
    // "sc in 2nd ch from hook, in each ch across": borrow the previous stitch.
    const prev = [...siblings].reverse().find((x) => x.t === 'st');
    if (prev) {
      st = prev.st;
      inherited = true;
    }
  }
  if (!st) {
    if (NOTE_START.test(text) || !/\d/.test(text)) return { t: 'note', text };
    return { t: 'unknown', text };
  }
  // "hdc inc", "dc dec", "sc dec": a sized increase or decrease.
  const next = tokens[idx + 1];
  let base = st;
  if ((next === 'inc' || next === 'dec') && /^(sc|hdc|dc|tr)$/.test(st)) {
    base = st;
    st = next;
    idx += 1;
  }
  const info = stitchInfo(st === 'inc' || st === 'dec' ? st : st) || stitchInfo('sc');
  let unitC = info.c;
  let unitP = info.p;
  if ((st === 'inc' || st === 'dec') && base !== st) {
    // Keep counting the same; remember the base stitch for display.
  }

  const before = inherited ? [] : tokens.slice(0, idx);
  const after = inherited ? tokens : tokens.slice(idx + 1);
  const afterStr = ` ${after.join(' ')} `;
  let lead = null;
  if (before.length === 1 && /^\d+$/.test(before[0])) lead = Number(before[0]);
  else if (before.length && !/^\d+$/.test(before[0]) && !inherited) {
    // Words before the stitch ("work 6 sc", "then sc"): allow a trailing number.
    const num = before.filter((w) => /^\d+$/.test(w));
    if (num.length === 1) lead = Number(num[0]);
  }
  let reps = 1;
  let reserve = 0;
  let place = placementOf(afterStr);
  let skipBefore = 0;

  if ((m = / fromhook(\d+) /.exec(afterStr))) {
    // "sc in 2nd ch from hook": the first N-1 chains are skipped.
    skipBefore = Number(m[1]) - 1;
    place = 'next';
  }

  const nextN = / in(?:to)? (?:the )?(?:next|following|first|last) (\d+) /.exec(afterStr);
  const trailing = /^\d+$/.test(after[0] || '') ? Number(after[0]) : null;
  const times = / x (\d+) /.exec(afterStr) || / (\d+) times? /.exec(afterStr);
  const fill = / (around|across|to end|to the end|rem|in each|in every|to last) /.test(afterStr) || place === 'each';

  const multiInto = lead !== null && lead > 1 && ['next', 'same', 'sp', 'ring', 'each'].includes(place) && !nextN;

  if (multiInto) {
    // "3 dc in next st", "6 sc in mr", "2 sc in each st around".
    unitP = info.p * lead;
    unitC = place === 'same' || place === 'ring' ? 0 : Math.max(1, info.c);
    reps = place === 'each' || fill ? 'fill' : 1;
  } else {
    const count = lead ?? (nextN ? Number(nextN[1]) : null) ?? trailing;
    if (count !== null) reps = count;
    else if (fill) reps = 'fill';
    if (place === 'same' || place === 'ring') unitC = 0;
  }
  let timesN = null;
  if (times) {
    const n = Number(times[1]);
    timesN = reps === 'fill' ? null : n;
    reps = reps === 'fill' ? n : reps * n;
  }
  if ((m = / to (?:the )?last (\d+)? ?(?:st|ch|sp)? /.exec(afterStr))) {
    reps = 'fill';
    reserve = m[1] ? Number(m[1]) : 1;
  }
  // "sc in 2nd ch from hook" is a single stitch after the skip; the "and in
  // each ch across" part arrives as its own phrase.
  if (skipBefore && !fill) reps = typeof reps === 'number' ? reps : 1;

  const first = / in(?:to)? (?:the )?(?:first|1st) /.test(afterStr);
  return {
    t: 'st', st, base: base !== st ? base : null, unitC, unitP, reps, reserve, place, skipBefore, first,
    multi: multiInto ? lead : null, timesN, text,
  };
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/**
 * Resolve 'fill' repeats against the stitches available and total up what a
 * list of items consumes and produces. Mutates nodes with `n` (resolved reps).
 */
function measure(items, avail, issues, ctx) {
  let c = 0;
  let p = 0;
  const fills = [];
  let leading = !ctx.nested;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    // Slip stitches before any real work only move the hook along
    // ("sl st in next 2 sts and into ch-2 sp"); they leave nothing to count.
    if (leading && it.t === 'st' && it.st === 'slst' && typeof it.reps === 'number' && items.slice(k + 1).some((x) => isWork(x) && !(x.t === 'st' && x.st === 'slst'))) {
      it.role = 'move';
      it.n = it.reps;
      c += it.n * it.unitC + (it.skipBefore || 0);
      continue;
    }
    if (isWork(it)) leading = false;
    switch (it.t) {
      case 'st': {
        const skip = it.skipBefore || 0;
        c += skip;
        if (it.reps === 'fill') fills.push(it);
        else {
          it.n = it.reps;
          c += it.n * it.unitC;
          p += it.n * it.unitP;
        }
        break;
      }
      case 'group': {
        const innerCtx = { ...ctx, nested: true };
        const inner = measure(it.items, undefined, issues, innerCtx);
        if (innerCtx.uncertain) ctx.uncertain = true;
        if (it.place === 'same' || it.place === 'ring') {
          it.unitC = 0;
        } else if (it.place === 'next' || it.place === 'sp' || it.place === 'each') {
          it.unitC = 1;
        } else {
          it.unitC = inner.c;
        }
        it.unitP = inner.p;
        if (it.reps === 'fill') fills.push(it);
        else {
          it.n = it.reps;
          c += it.n * it.unitC;
          p += it.n * it.unitP;
        }
        break;
      }
      case 'ch': {
        const first = k === 0 || items.slice(0, k).every((x) => x.t === 'note' || x.t === 'move' || x.role === 'move');
        const last = items.slice(k + 1).every((x) => x.t === 'note' || x.t === 'ch' && x.turning || x.t === 'join');
        const top = !ctx.nested;
        const turning = it.turning || (top && ctx.inRow && first && !ctx.foundationOnly) || (top && ctx.inRow && last && /turn/.test(ctx.body));
        if (turning && !it.countsAs) {
          it.role = 'turning';
        } else if (turning && it.countsAs) {
          // "ch 3 (counts as dc)" stands in for a stitch in the first st.
          it.role = 'counts';
          // ...unless the next stitch goes "in first st", which is the same one.
          const nextWork = items.slice(k + 1).find(isWork);
          c += it.place === 'same' || ctx.ring || (nextWork && nextWork.first) ? 0 : 1;
          p += 1;
        } else {
          it.role = 'body';
          p += it.n;
        }
        break;
      }
      case 'skip':
        c += it.n;
        break;
      default:
        break;
    }
  }
  if (fills.length) {
    const main = fills[0];
    if (avail === undefined || avail === null) {
      main.n = 0;
      if (!ctx.nested) issues.push({ level: 'info', msg: `“${shorten(main.text)}” needs the previous row's count to work out` });
      ctx.uncertain = true;
    } else {
      const remaining = avail - c - (main.reserve || 0);
      if (main.unitC <= 0) {
        main.n = 0;
        ctx.uncertain = true;
      } else if (remaining < 0) {
        main.n = 0;
        issues.push({ level: 'error', msg: `Needs ${c} stitches before “${shorten(main.text)}”, but only ${avail} are there` });
      } else {
        main.n = Math.floor(remaining / main.unitC);
        if (remaining % main.unitC !== 0) {
          issues.push({
            level: 'error',
            msg: `“${shorten(main.text)}” uses ${main.unitC} st per repeat, which doesn't divide the ${remaining} st left (${remaining % main.unitC} over)`,
          });
        }
      }
      c += main.n * main.unitC;
      p += main.n * main.unitP;
    }
    for (const extra of fills.slice(1)) {
      extra.n = 0;
      ctx.uncertain = true;
    }
  }
  return { c, p };
}

function shorten(text, n = 28) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

// Expand the resolved tree into one atom per placement, for the stitch-by-
// stitch tracker and the symbol diagram.
function expand(items, out) {
  for (const it of items) {
    if (out.length > MAX_ATOMS) return out;
    if (it.t === 'st') {
      for (let s = 0; s < (it.skipBefore || 0); s++) out.push({ st: 'sk', c: 1, p: 0 });
      for (let r = 0; r < (it.n || 0); r++) {
        if (it.place === 'ring' && it.multi) {
          // "6 sc in MR" is six separate stitches into the ring.
          for (let k = 0; k < it.multi; k++) out.push({ st: it.st, base: it.base, c: 0, p: it.unitP / it.multi, place: 'ring' });
        } else if (it.role === 'move') {
          out.push({ st: it.st, c: it.unitC, p: 0, move: true });
        } else {
          out.push({ st: it.st, base: it.base, c: it.unitC, p: it.unitP, multi: it.multi, place: it.place });
        }
        if (out.length > MAX_ATOMS) return out;
      }
    } else if (it.t === 'group') {
      for (let r = 0; r < (it.n || 0); r++) {
        if (it.place && it.place !== 'each') {
          // Everything in the group lands in one stitch: one atom.
          const inner = expand(it.items, []);
          out.push({ st: 'group', c: it.unitC, p: it.unitP, place: it.place, inner, text: it.text });
        } else {
          expand(it.items, out);
        }
        if (out.length > MAX_ATOMS) return out;
      }
    } else if (it.t === 'ch' && it.role !== 'turning') {
      if (it.role === 'counts') out.push({ st: 'ch', c: 1, p: 1, countsAs: typeof it.countsAs === 'string' ? it.countsAs : null, n: it.n });
      else for (let r = 0; r < it.n; r++) out.push({ st: 'ch', c: 0, p: 1 });
    } else if (it.t === 'skip') {
      for (let r = 0; r < it.n; r++) out.push({ st: 'sk', c: 1, p: 0 });
    }
  }
  return out;
}

// A compact, readable summary of the top level for the tracker:
//   [{ text: '(sc 2, inc)', reps: 6 }, { text: 'sc 3', reps: 1 }]
function summarise(items) {
  return items
    .filter((it) => it.t === 'group' || it.t === 'st' || (it.t === 'ch' && it.role !== 'turning') || it.t === 'skip')
    .map((it) => {
      if (it.t === 'group') {
        return { text: `(${it.text})`, reps: it.n || 0, perRep: it.unitP, st: 'group' };
      }
      if (it.t === 'st') {
        return { text: it.text, reps: it.n || 0, perRep: it.unitP, st: it.st };
      }
      if (it.t === 'ch') return { text: `ch ${it.n}`, reps: 1, perRep: it.role === 'counts' ? 1 : it.n, st: 'ch' };
      return { text: `sk ${it.n}`, reps: 1, perRep: 0, st: 'sk' };
    });
}

function hasWork(items) {
  return items.some((it) => it.t === 'st' || it.t === 'group' || it.t === 'skip' || (it.t === 'ch' && it.role !== 'turning'));
}

function containsKind(items, pred) {
  for (const it of items) {
    if (pred(it)) return true;
    if (it.t === 'group' && containsKind(it.items, pred)) return true;
  }
  return false;
}

// Stitch heads left behind, by the stitch they're made of: an inc leaves two
// sc heads, a dc2tog one dc head, "ch 3 (counts as dc)" one dc head.
const BASE_OF = { inc: 'sc', dec: 'sc', invdec: 'sc', esc: 'sc', crab: 'sc', spike: 'sc', waistcoat: 'sc', fsc: 'sc', fdc: 'dc', fhdc: 'hdc', shell: 'dc', vst: 'dc', xst: 'dc' };
function headsByBase(atoms, out = {}) {
  for (const a of atoms) {
    if (a.st === 'group') headsByBase(a.inner, out);
    else if (a.st !== 'sk') {
      let base = a.countsAs || a.base || BASE_OF[a.st] || a.st;
      const tog = /^(sc|hdc|dc|tr|dtr)\dtog$/.exec(base);
      if (tog) base = tog[1];
      const post = /^(?:fp|bp)(sc|hdc|dc|tr)$/.exec(base);
      if (post) base = post[1];
      out[base] = (out[base] || 0) + (a.countsAs ? 1 : a.p);
    }
  }
  return out;
}

function stitchTally(atoms, tally = {}) {
  for (const a of atoms) {
    if (a.st === 'group') stitchTally(a.inner, tally);
    else if (a.st !== 'sk') {
      const key = a.countsAs || a.st;
      tally[key] = (tally[key] || 0) + (a.multi || 1);
    }
  }
  return tally;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse one line.
 * @param {string} raw
 * @param {{prev?: number|null, terms?: 'US'|'UK', roundish?: boolean}} opts
 */
export function parseLine(raw, opts = {}) {
  const prev = opts.prev ?? null;
  const line = { raw, kind: 'blank', label: null, num: null, numTo: null, side: null, declared: null, mods: [], issues: [], consumes: 0, produces: null, atoms: [], summary: [], tally: {}, uncertain: false };
  if (!raw || !raw.trim()) return line;

  const f = frame(raw);
  Object.assign(line, { num: f.num, numTo: f.numTo, side: f.side, declared: f.declared, declaredUnit: f.declaredUnit || null, totals: f.totals || null, totalsText: f.totalsText || null });
  const english = opts.terms === 'UK' ? ukToUs(f.body) : f.body;
  const { text, mods } = normalise(english);
  line.mods = mods;
  const tokens = tokenize(text);
  const items = parseSeq(tokens);

  const hasLabel = f.num !== null;
  const onlyChain = items.filter(isWork).length === 1 && items.find(isWork)?.t === 'ch';
  const heading = !hasLabel && /:\s*$/.test(raw.trim()) && !hasWork(items);

  if (heading) {
    line.kind = 'heading';
    const make = /\b(?:make|x|×)\s*(\d+)\b|\((\d+)\)/i.exec(raw);
    line.pieces = make ? Number(make[1] || make[2]) : 1;
    line.label = raw.trim().replace(/:\s*$/, '').replace(/\s*[([]\s*(?:make|x|×)?\s*\d+\s*[)\]]\s*$|\s*[-–—,]?\s*make\s+\d+\s*$/i, '').trim() || raw.trim();
    return line;
  }
  if (!hasLabel && !items.some(isWork)) {
    line.kind = 'note';
    return line;
  }

  const word = f.word || '';
  const roundWord = /^(round|rnd|rd)/.test(word);
  const rowWord = /^row/.test(word);
  let kind = roundWord ? 'round' : rowWord ? 'row' : opts.roundish ? 'round' : 'row';
  if (!hasLabel && onlyChain && prev === null) kind = 'chain';
  if (hasLabel && onlyChain && (prev === null || /ring|join/.test(text)) && !items.find(isWork).turning) kind = 'chain';
  line.kind = kind;
  line.label = hasLabel ? labelFor(kind, word, f.num, f.numTo) : kind === 'chain' ? 'Foundation' : null;

  const usesRing = containsKind(items, (it) => it.t === 'mr' || it.place === 'ring');
  const usesSpaces = containsKind(items, (it) => it.place === 'sp');
  const avail = usesRing ? 0 : prev;
  const ctx = { inRow: kind !== 'chain', body: text, uncertain: false, foundationOnly: kind === 'chain', ring: usesRing };
  let issues = [];
  let work = items;
  let { c, p } = measure(work, avail === null ? undefined : avail, issues, ctx);
  // When the count disagrees, try the other sensible readings of loose
  // notation before calling it a mistake.
  if (line.declared !== null && p !== line.declared) {
    const alt = tryVariants(items, avail === null ? undefined : avail, ctx, line.declared);
    if (alt) {
      ({ c, p } = alt);
      work = alt.items;
      issues = alt.issues;
      ctx.uncertain = alt.ctx.uncertain;
      line.reading = alt.reading;
    }
  }
  const unknown = work.filter((it) => it.t === 'unknown');
  if (unknown.length) {
    ctx.uncertain = true;
    line.issues.push({ level: 'info', msg: `Couldn't read “${shorten(unknown.map((u) => u.text).join('; '), 40)}”` });
  }
  line.uncertain = ctx.uncertain;
  line.consumes = c;
  line.produces = p;
  line.issues.push(...issues);

  // Declared count vs what the stitches make.
  const heads = headsByBase(expand(work, []));
  line.heads = heads;
  if (line.declared !== null && line.produces !== line.declared) {
    const unit = line.declaredUnit;
    if (unit && (heads[unit] || 0) === line.declared) {
      // "(36 dc)" counts only the dc; the chains around them don't count.
    } else {
      const level = line.uncertain || usesSpaces ? 'warn' : 'error';
      const got = unit ? `${heads[unit] || 0} ${unit}` : line.produces;
      line.issues.push({ level, msg: `Says ${line.declared}${unit ? ` ${unit}` : ''} but the stitches make ${got}` });
    }
  }
  // Stitches used vs stitches available.
  if (prev !== null && !usesRing && kind !== 'chain' && !usesSpaces && !line.uncertain && hasWork(work)) {
    if (line.consumes > prev) {
      line.issues.push({ level: 'error', msg: `Works into ${line.consumes} stitches but the row below has ${prev}` });
    } else if (line.consumes < prev) {
      const left = prev - line.consumes;
      line.issues.push({ level: 'warn', msg: `Leaves ${left} of ${prev} stitch${left === 1 ? '' : 'es'} unworked` });
    }
  }
  if (usesSpaces && line.declared === null) line.approx = true;

  // Itemised totals are checked stitch by stitch: "(24 dc, 4 ch-2 sps)".
  if (line.totals) {
    const tally = heads;
    for (const { n, what } of line.totals) {
      const id = normalise(what).text.replace(/ /g, '');
      let key = id === 'st' ? null : STITCH_WORD.test(id) ? id : id.replace(/s$/, '');
      if (key && BASE_OF[key]) key = BASE_OF[key];
      if (key === null) {
        if (line.produces !== n) line.issues.push({ level: line.uncertain ? 'warn' : 'error', msg: `Says ${n} sts but the stitches make ${line.produces}` });
      } else if (STITCH_WORD.test(key)) {
        const got = tally[key] || 0;
        if (got !== n) line.issues.push({ level: line.uncertain ? 'warn' : 'error', msg: `Says ${n} ${key} but there are ${got}` });
      }
    }
  }

  line.atoms = expand(work, []);
  line.summary = summarise(work);
  line.tally = stitchTally(line.atoms);
  line.items = work;
  line.ring = usesRing || work.some((it) => it.t === 'ch' && it.ring);
  line.repeatCount = (line.numTo ?? line.num ?? 0) - (line.num ?? 0) + 1;
  return line;
}

// Alternative readings, in order of how often they're what the author meant.
function tryVariants(items, avail, ctx, declared) {
  const variants = [];
  if (findAmbiguous(items)) {
    const v = structuredClone(items);
    const a = findAmbiguous(v);
    [a.reps, a.repsAlt] = [a.repsAlt, a.reps];
    variants.push([v, a.reps === a.repsAlt + 1 ? 'rep from * counted as more times' : 'rep from * counted as total times']);
  }
  const whole = wholeLine(items);
  if (whole) variants.push([whole, 'repeat applies to the whole round']);
  for (const [v, reading] of variants) {
    const issues = [];
    const vctx = { ...ctx, uncertain: false };
    const r = measure(v, avail, issues, vctx);
    if (r.p === declared) return { items: v, c: r.c, p: r.p, issues, ctx: vctx, reading };
  }
  return null;
}

// "sc, inc x6 (18)" and "sc in next 4 sts, inc (6 times)" both mean the whole
// round is repeated, even though the multiplier is written on the last stitch.
function wholeLine(items) {
  const v = structuredClone(items);
  let n = null;
  let m;
  const tail = v[v.length - 1];
  if (tail && tail.t === 'note' && (m = /^(?:x )?(\d+)(?: times?)?$/.exec(tail.text))) {
    n = Number(m[1]);
    v.pop();
  } else {
    const lastWork = [...v].reverse().find(isWork);
    if (lastWork && lastWork.t === 'st' && lastWork.timesN && typeof lastWork.reps === 'number') {
      n = lastWork.timesN;
      lastWork.reps = lastWork.reps / n;
    }
  }
  if (!n) return null;
  let start = 0;
  while (start < v.length && (v[start].t === 'note' || v[start].t === 'ch' || v[start].t === 'join')) start++;
  let end = v.length;
  while (end > start && (v[end - 1].t === 'join' || v[end - 1].t === 'note')) end--;
  const body = v.slice(start, end);
  if (body.filter(isWork).length < 2) return null;
  const group = { t: 'group', items: body, reps: n, place: null, text: body.map((b) => b.text).join(', ') };
  return [...v.slice(0, start), group, ...v.slice(end)];
}

function findAmbiguous(items) {
  for (const it of items) {
    if (it.repsAlt !== undefined) return it;
    if (it.t === 'group') {
      const inner = findAmbiguous(it.items);
      if (inner) return inner;
    }
  }
  return null;
}

function labelFor(kind, word, num, numTo) {
  const plural = numTo !== num;
  const base = kind === 'round' ? (plural ? 'Rnds' : 'Rnd') : kind === 'chain' ? (plural ? 'Rows' : 'Row') : plural ? 'Rows' : 'Row';
  return plural ? `${base} ${num}–${numTo}` : `${base} ${num}`;
}

/**
 * Parse a section of pattern text (one row per line).
 * Returns the parsed lines plus section-level checks and totals.
 */
export function parseSection(text, opts = {}) {
  const rawLines = String(text || '').split(/\r?\n/);
  const roundish = /\b(mr|magic ring|magic circle|rnd|round|in ring|join)\b/i.test(text);
  const lines = [];
  let prev = opts.startCount ?? null;
  let expected = null;
  for (const raw of rawLines) {
    const line = parseLine(raw, { prev, terms: opts.terms, roundish });
    // A heading starts a new part, so numbering restarts. The count carries
    // on: a new piece begins with its own ring or chain anyway, and a
    // "Brim:" heading continues the same fabric.
    if (line.kind === 'heading') expected = null;
    if (line.kind === 'row' || line.kind === 'round' || line.kind === 'chain') {
      if (line.num !== null) {
        if (expected !== null && line.num !== expected && !(line.kind === 'chain' && line.num === 0)) {
          line.issues.push({ level: 'warn', msg: line.num < expected ? `Numbering repeats: expected ${labelWord(line)} ${expected}` : `Numbering jumps: expected ${labelWord(line)} ${expected}` });
        }
        expected = line.numTo + 1;
      }
      // One unreadable row shouldn't cascade: trust the declared count.
      const trusted = line.uncertain && line.declared !== null ? line.declared : line.produces;
      prev = line.declared !== null && line.issues.some((i) => i.level === 'error') ? line.declared : trusted;
    }
    lines.push(line);
  }
  return { lines, ...totals(lines) };
}

function labelWord(line) {
  return line.kind === 'round' ? 'Rnd' : 'Row';
}

function totals(lines) {
  let rows = 0;
  let stitches = 0;
  let errors = 0;
  let warnings = 0;
  const tally = {};
  for (const line of lines) {
    for (const i of line.issues) {
      if (i.level === 'error') errors++;
      else if (i.level === 'warn') warnings++;
    }
    if (line.kind === 'row' || line.kind === 'round' || line.kind === 'chain') {
      const n = line.repeatCount || 1;
      rows += line.kind === 'chain' ? 0 : n;
      stitches += (line.produces || 0) * n;
      for (const [k, v] of Object.entries(line.tally)) tally[k] = (tally[k] || 0) + v * n;
    }
  }
  return { rows, stitches, errors, warnings, tally };
}

/**
 * Parse a whole pattern ({ sections: [{ name, text, pieces }] }) and flatten
 * it into the ordered list of rows the tracker walks through.
 */
export function parsePattern(pattern) {
  const terms = pattern.terms || 'US';
  const sections = (pattern.sections || []).map((sec) => {
    const parsed = parseSection(sec.text, { terms });
    return { ...sec, parsed };
  });
  const steps = [];
  for (const [si, sec] of sections.entries()) {
    let part = sec.name || `Part ${si + 1}`;
    let pieces = Math.max(1, Number(sec.pieces) || 1);
    let notes = [];
    const blocks = [];
    let current = { part, pieces, lines: [] };
    for (const line of sec.parsed.lines) {
      if (line.kind === 'heading') {
        if (current.lines.length) blocks.push(current);
        current = { part: line.label, pieces: line.pieces || 1, lines: [] };
        continue;
      }
      current.lines.push(line);
    }
    if (current.lines.length) blocks.push(current);
    for (const block of blocks) {
      for (let piece = 1; piece <= block.pieces; piece++) {
        notes = [];
        for (const line of block.lines) {
          if (line.kind === 'note') {
            notes.push(line.raw.trim());
            continue;
          }
          if (line.kind === 'blank') continue;
          const n = line.repeatCount || 1;
          for (let k = 0; k < n; k++) {
            const num = line.num !== null ? line.num + k : null;
            steps.push({
              section: si,
              part: block.part,
              piece,
              pieces: block.pieces,
              kind: line.kind,
              num,
              label: num !== null ? `${line.kind === 'round' ? 'Rnd' : 'Row'} ${num}` : line.label || 'Row',
              rangeLabel: n > 1 ? line.label : null,
              text: line.raw.trim(),
              count: line.declared ?? line.produces,
              atoms: line.atoms,
              summary: line.summary,
              mods: line.mods,
              side: line.side,
              notes: k === 0 ? notes : [],
              lineIssues: line.issues,
            });
          }
          notes = [];
        }
        if (notes.length && steps.length) steps[steps.length - 1].after = notes;
      }
    }
  }
  const all = sections.map((s) => s.parsed);
  const tally = {};
  for (const step of steps) stitchTally(step.atoms, tally);
  return {
    sections,
    steps,
    rows: steps.filter((s) => s.kind !== 'chain').length,
    stitches: steps.reduce((a, s) => a + (s.count || 0), 0),
    errors: all.reduce((a, s) => a + s.errors, 0),
    warnings: all.reduce((a, s) => a + s.warnings, 0),
    tally,
  };
}

/** Stitch ids a pattern actually uses, for the abbreviations list. */
export function usedStitches(pattern) {
  const parsed = parsePattern(pattern);
  const ids = new Set(Object.keys(parsed.tally));
  for (const sec of parsed.sections) {
    for (const line of sec.parsed.lines) {
      for (const m of line.mods) ids.add(m === 'BLO' ? 'blo' : m === 'FLO' ? 'flo' : 'camel');
      if (line.ring) ids.add('mr');
      if (line.atoms.some((a) => a.st === 'sk')) ids.add('sk');
    }
  }
  return [...ids];
}
