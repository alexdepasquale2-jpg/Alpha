// Color math for yarn: conversions, perceptual distance (CIEDE2000),
// harmonies, palette extraction and quantisation.

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl) => rgbToHex(hslToRgb(hsl));

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  x = f(x);
  y = f(y);
  z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (108 / 841) * (t - 4 / 29));
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  const lin = [
    x * 3.2406 + y * -1.5372 + z * -0.4986,
    x * -0.9689 + y * 1.8758 + z * 0.0415,
    x * 0.0557 + y * -0.204 + z * 1.057,
  ];
  return lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, v * 255));
  });
}

export const hexToLab = (hex) => rgbToLab(hexToRgb(hex));

/** CIEDE2000 colour difference. ~2.3 is a just-noticeable difference. */
export function deltaE([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h = (a, b) => {
    if (a === 0 && b === 0) return 0;
    const v = Math.atan2(b, a) / rad;
    return v < 0 ? v + 360 : v;
  };
  const h1p = h(a1p, b1);
  const h2p = h(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
    hbp /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export const hexDelta = (a, b) => deltaE(hexToLab(a), hexToLab(b));

/** Relative luminance (WCAG) and a readable text color for a swatch. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const inkFor = (hex) => (luminance(hex) > 0.36 ? '#1f1a17' : '#fffaf4');

/** Grey with the same perceived lightness: for checking value contrast. */
export function valueGrey(hex) {
  const L = hexToLab(hex)[0];
  const v = labToRgb([L, 0, 0]);
  return rgbToHex(v);
}

// ---------------------------------------------------------------------------
// Harmonies
// ---------------------------------------------------------------------------

export const HARMONIES = [
  ['analogous', 'Analogous'],
  ['complementary', 'Complementary'],
  ['split', 'Split complementary'],
  ['triadic', 'Triadic'],
  ['tetradic', 'Tetradic'],
  ['monochrome', 'Monochrome'],
  ['neutral', 'Neutral + pop'],
];

/** `count` colors built around `base` using a harmony rule. */
export function harmony(base, rule, count = 5, jitter = null) {
  const [h, s, l] = hexToHsl(base);
  const j = jitter || (() => 0.5);
  const shift = (dh, ds = 0, dl = 0) => hslToHex([h + dh, clamp01(s + ds), clamp01(l + dl)]);
  const out = [base];
  const hues = {
    analogous: [-30, 30, -15, 15, -45, 45],
    complementary: [180, 0, 180, 0, 180, 0],
    split: [150, 210, 0, 150, 210, 0],
    triadic: [120, 240, 0, 120, 240, 0],
    tetradic: [90, 180, 270, 0, 90, 180],
    monochrome: [0, 0, 0, 0, 0, 0],
    neutral: [0, 0, 180, 0, 0, 0],
  }[rule] || [30, 60, 90, 120, 150, 180];
  for (let i = 1; i < count; i++) {
    const dh = hues[(i - 1) % hues.length] + (j() - 0.5) * 12;
    let ds = 0;
    let dl = 0;
    if (rule === 'monochrome') {
      dl = ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.16);
      ds = -0.05 * i;
    } else if (rule === 'neutral') {
      if (i === 2) {
        ds = 0.25;
        dl = 0;
      } else {
        ds = -s + 0.06 + j() * 0.08;
        dl = (i % 2 ? 0.28 : -0.22) + (j() - 0.5) * 0.1;
      }
    } else {
      dl = (i % 2 ? 0.14 : -0.14) * (i > 2 ? 1.4 : 1) + (j() - 0.5) * 0.08;
      ds = (j() - 0.5) * 0.15;
    }
    out.push(shift(dh, ds, dl));
  }
  return out;
}

function clamp01(v) {
  return Math.max(0.03, Math.min(0.97, v));
}

// ---------------------------------------------------------------------------
// Palette extraction and quantisation
// ---------------------------------------------------------------------------

/**
 * k-means in Lab space over an array of [r,g,b]. Deterministic (k-means++
 * seeding with a fixed sequence) so the same photo gives the same palette.
 */
export function kmeans(pixels, k, iterations = 12) {
  const pts = pixels.map(rgbToLab);
  if (!pts.length) return [];
  k = Math.min(k, pts.length);
  const centers = [pts[Math.floor(pts.length / 2)]];
  while (centers.length < k) {
    // Farthest-point seeding: robust and deterministic.
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 4000))) {
      let d = Infinity;
      for (const c of centers) d = Math.min(d, dist2(pts[i], c));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    centers.push(pts[best]);
  }
  const assign = new Int32Array(pts.length);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(pts[i], centers[c]);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      assign[i] = bi;
      const s = sums[bi];
      s[0] += pts[i][0];
      s[1] += pts[i][1];
      s[2] += pts[i][2];
      s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3]) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }
  const counts = centers.map(() => 0);
  for (let i = 0; i < pts.length; i++) counts[assign[i]]++;
  return centers
    .map((c, i) => ({ hex: rgbToHex(labToRgb(c)), lab: c, share: counts[i] / pts.length }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

function dist2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Map every pixel to its nearest palette color (optionally with Floyd-
 * Steinberg dithering). Returns palette indices, row-major.
 */
export function quantise(pixels, width, height, paletteHex, { dither = false } = {}) {
  const pal = paletteHex.map((h) => hexToRgb(h));
  const palLab = pal.map(rgbToLab);
  const buf = pixels.map((p) => p.slice());
  const out = new Uint8Array(width * height);
  const nearest = (rgb) => {
    const lab = rgbToLab(rgb);
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < palLab.length; i++) {
      const d = dist2(lab, palLab[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = nearest(buf[i]);
      out[i] = idx;
      if (dither) {
        const err = [0, 1, 2].map((c) => buf[i][c] - pal[idx][c]);
        const spread = (dx, dy, f) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny >= height) return;
          const j = ny * width + nx;
          for (let c = 0; c < 3; c++) buf[j][c] += err[c] * f;
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
  }
  return out;
}

/** Nearest item (with a `.hex`) to a color, by CIEDE2000. */
export function nearestTo(hex, items) {
  const lab = hexToLab(hex);
  let best = null;
  let bd = Infinity;
  for (const it of items) {
    if (!it.hex) continue;
    const d = deltaE(lab, hexToLab(it.hex));
    if (d < bd) {
      bd = d;
      best = it;
    }
  }
  return best ? { item: best, delta: bd } : null;
}

// Yarn-shelf color names, for readable palettes.
const NAMES = [
  ['#f4efe6', 'Oatmeal'], ['#fffaf0', 'Cream'], ['#ffffff', 'White'], ['#1b1b1b', 'Black'], ['#3b3b3b', 'Charcoal'],
  ['#8a8a8a', 'Grey'], ['#c9c9c9', 'Silver'], ['#8b5a2b', 'Chestnut'], ['#5b3a1e', 'Chocolate'], ['#c19a6b', 'Camel'],
  ['#d2b48c', 'Tan'], ['#e8d9b5', 'Linen'], ['#b7410e', 'Rust'], ['#cc5500', 'Burnt orange'], ['#e2725b', 'Terracotta'],
  ['#ff7f50', 'Coral'], ['#f4a261', 'Apricot'], ['#ffb347', 'Tangerine'], ['#e1ad01', 'Mustard'], ['#f6d55c', 'Butter'],
  ['#fff176', 'Lemon'], ['#9c8a3b', 'Olive'], ['#8a9a5b', 'Moss'], ['#9caf88', 'Sage'], ['#2e7d32', 'Forest'],
  ['#4caf50', 'Clover'], ['#a8e6a3', 'Mint'], ['#1f6f6f', 'Teal'], ['#40b5ad', 'Lagoon'], ['#9fd8e0', 'Seafoam'],
  ['#1e3a5f', 'Navy'], ['#2f6690', 'Denim'], ['#5b9bd5', 'Cornflower'], ['#a7c7e7', 'Baby blue'], ['#4b3f72', 'Indigo'],
  ['#6a4c93', 'Plum'], ['#9b72cf', 'Lavender'], ['#c8a2c8', 'Lilac'], ['#7b1e3a', 'Wine'], ['#a3294a', 'Berry'],
  ['#c21e56', 'Raspberry'], ['#e75480', 'Rose'], ['#f4a6b8', 'Blush'], ['#ffd1dc', 'Petal'], ['#b22222', 'Cherry'],
  ['#d62828', 'Poppy'], ['#800000', 'Maroon'], ['#6b4226', 'Walnut'], ['#bfa6a0', 'Mauve'], ['#d8c3a5', 'Sand'],
];
const NAME_LABS = NAMES.map(([hex, name]) => ({ lab: hexToLab(hex), name }));

export function colorName(hex) {
  const lab = hexToLab(hex);
  let best = NAME_LABS[0];
  let bd = Infinity;
  for (const n of NAME_LABS) {
    const d = deltaE(lab, n.lab);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best.name;
}

/** Color family for filtering the stash. */
export function colorFamily(hex) {
  const [h, s, l] = hexToHsl(hex);
  if (l > 0.9) return 'white';
  if (l < 0.13) return 'black';
  if (s < 0.14) return 'grey';
  if (s < 0.45 && l < 0.55 && h >= 15 && h < 50) return 'brown';
  if (h < 15 || h >= 340) return 'red';
  if (h < 40) return 'orange';
  if (h < 68) return 'yellow';
  if (h < 165) return 'green';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

export const FAMILIES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'grey', 'black', 'white'];
