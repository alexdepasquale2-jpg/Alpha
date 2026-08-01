/* ============================================================================
 * art.js — 100% procedural art. No image files anywhere in this project.
 *
 *  • a 5x7 bitmap font used for the pixel-art logo & canvas headings
 *  • item icons (weapons / vehicles / agents) drawn on a 24x24 pixel grid
 *  • flat-top hexagonal outpost buildings with glowing edges
 *  • the rainy neon skyline backdrop (cached, regenerated on resize)
 *  • neon vertical signs with glitched katakana-ish lettering
 *
 * Every generator returns (and caches) an offscreen <canvas>, so scenes can
 * blit them cheaply or turn them into data-URLs for DOM <img> elements.
 * ========================================================================== */
CM.art = (function () {
  'use strict';
  const U = CM.util;

  /* ==========================================================  5x7 FONT  */
  /* Each glyph is 7 rows of 5 bits, written as one 35-char string.        */
  const F = {
    A:'01110100011000111111100011000110001', B:'11110100011000111110100011000111110',
    C:'01110100011000010000100001000101110', D:'11110100011000110001100011000111110',
    E:'11111100001000011110100001000011111', F:'11111100001000011110100001000010000',
    G:'01110100011000010111100011000101111', H:'10001100011000111111100011000110001',
    I:'11111001000010000100001000010011111', J:'00111000100001000010000101001001100',
    K:'10001100101010011000101001001010001', L:'10000100001000010000100001000011111',
    M:'10001110111010110101100011000110001', N:'10001110011010110011100011000110001',
    O:'01110100011000110001100011000101110', P:'11110100011000111110100001000010000',
    Q:'01110100011000110001101011001001101', R:'11110100011000111110101001001010001',
    S:'01111100001000001110000010000111110', T:'11111001000010000100001000010000100',
    U:'10001100011000110001100011000101110', V:'10001100011000110001100010101000100',
    W:'10001100011000110101101011101110001', X:'10001100010101000100010101000110001',
    Y:'10001100010101000100001000010000100', Z:'11111000010001000100010001000011111',
    0:'01110100011001110101110011000101110', 1:'00100011000010000100001000010001110',
    2:'01110100010000100010001000100011111', 3:'11111000100010000010000011000101110',
    4:'00010001100101010010111110001000010', 5:'11111100001111000001000011000101110',
    6:'00110010001000011110100011000101110', 7:'11111000010001000100010000100001000',
    8:'01110100011000101110100011000101110', 9:'01110100011000101111000010001001100',
    ' ':'00000000000000000000000000000000000', '-':'00000000000000011111000000000000000',
    '.':'00000000000000000000000000110001100', ':':'00000001100011000000001100011000000',
    '!':'00100001000010000100001000000000100', '/':'00001000100001000100010000100010000',
    '+':'00000001000010011111001000010000000', '?':'01110100010000100110001000000000100',
    '%':'11001110100001000100010000101110011', '<':'00010001000100010000010000010000010',
    '>':'01000001000001000001000100010001000', '#':'01010111110101011111010100000000000',
    '*':'00000101000100111110010001010000000', "'":'00100001000010000000000000000000000',
    ',':'00000000000000000000000001100010000', '(':'00010001000100010000100000100000010',
    /* currency + resource pips, so canvas labels can use the same icons as the HUD */
    '\u00a2':'00100011101010010100101000111000100',  /* ¢ credits  */
    '\u25c8':'00100010101000110001100010101000100',  /* ◈ intel    */
    '\u2726':'00100001001010101110010101001000100',  /* ✦ chips    */
    '\u26a1':'00011001100110011111001100110011000',  /* ⚡ energy   */
    ')':'01000001000001000001000001000001000', '=':'00000000001111100000111110000000000'
  };

  /** Width in px of `text` at `scale` (1px cell = `scale` device px). */
  function textWidth(text, scale, tracking) {
    tracking = tracking === undefined ? 1 : tracking;
    return text.length * (5 + tracking) * scale - tracking * scale;
  }

  /**
   * Draw pixel text. opts:
   *   align 'left'|'center'|'right', color, glow (px), glowColor,
   *   shadow (bool: hard 1px drop shadow), tracking (cell gap)
   */
  function text(ctx, str, x, y, scale, opts) {
    opts = opts || {};
    str = String(str).toUpperCase();
    const track = opts.tracking === undefined ? 1 : opts.tracking;
    const w = textWidth(str, scale, track);
    let px = x;
    if (opts.align === 'center') px = x - w / 2;
    else if (opts.align === 'right') px = x - w;

    const paint = (col, dx, dy, blur) => {
      ctx.save();
      ctx.fillStyle = col;
      if (blur) { ctx.shadowColor = opts.glowColor || col; ctx.shadowBlur = blur; }
      let cx = px + dx;
      for (let i = 0; i < str.length; i++) {
        const g = F[str[i]] || F['?'];
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
          if (g[r * 5 + c] === '1') ctx.fillRect(cx + c * scale, y + dy + r * scale, scale, scale);
        }
        cx += (5 + track) * scale;
      }
      ctx.restore();
    };

    if (opts.shadow) paint('rgba(0,0,0,.85)', scale, scale, 0);
    if (opts.glow) { paint(opts.glowColor || opts.color || '#fff', 0, 0, opts.glow); paint(opts.glowColor || opts.color || '#fff', 0, 0, opts.glow * .6); }
    paint(opts.color || '#fff', 0, 0, 0);
    return w;
  }

  /* ======================================================  PIXEL HELPER  */
  /** Returns a painter that maps a 24x24 (or NxN) pixel grid onto a canvas. */
  function pixelPainter(ctx, cell) {
    return {
      px(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x * cell, y * cell, w * cell, h * cell); },
      dot(x, y, col) { ctx.fillStyle = col; ctx.fillRect(x * cell, y * cell, cell, cell); },
      line(x, y, w, col) { ctx.fillStyle = col; ctx.fillRect(x * cell, y * cell, w * cell, cell); }
    };
  }

  /* =========================================================  PALETTES  */
  /* Tier drives colour so the merge chain reads visually at a glance.     */
  const TIER_COL = [
    { a:'#8b96b5', b:'#5a6584', n:'#c9d6ff' },  // T1 grey steel
    { a:'#3fa9ff', b:'#1e5fbf', n:'#9fdcff' },  // T2 blue
    { a:'#24e2ff', b:'#0f8ea8', n:'#c7fbff' },  // T3 cyan
    { a:'#49ff9b', b:'#17a35d', n:'#d5ffe8' },  // T4 green
    { a:'#ffb020', b:'#b06b06', n:'#ffe6b0' },  // T5 gold
    { a:'#ff7a2f', b:'#c03c05', n:'#ffd8bd' },  // T6 orange
    { a:'#ff3fa4', b:'#a80d5e', n:'#ffc7e6' },  // T7 magenta
    { a:'#9a6bff', b:'#4a1fb0', n:'#e0d2ff' },  // T8 violet
    { a:'#ffffff', b:'#9fb6ff', n:'#ffffff' }   // T9+ chrome
  ];
  const tcol = (t) => TIER_COL[U.clamp(t - 1, 0, TIER_COL.length - 1)];

  /* =====================================================  ITEM  ICONS  */
  const iconCache = new Map();

  /**
   * itemIcon(kind, tier, size) -> HTMLCanvasElement
   *  kind: 'weapon' | 'vehicle' | 'agent'
   *  tier: 1..9   size: output px (icon is drawn on a 24x24 grid then scaled)
   */
  function itemIcon(kind, tier, size) {
    size = size || 96;
    const key = kind + tier + '@' + size;
    if (iconCache.has(key)) return iconCache.get(key);

    const G = 24, cell = size / G;
    const cv = U.makeCanvas(size, size);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const p = pixelPainter(ctx, cell);
    const c = tcol(tier);
    const dark = '#0a0d18';

    // soft neon backlight so icons pop on dark panels
    const g = ctx.createRadialGradient(size/2, size/2, 2, size/2, size/2, size/2);
    g.addColorStop(0, U.rgba(c.a, .30)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.shadowColor = c.a; ctx.shadowBlur = size * 0.10;

    if (kind === 'weapon')      drawWeapon(p, tier, c, dark);
    else if (kind === 'vehicle') drawVehicle(p, tier, c, dark);
    else                         drawAgent(p, tier, c, dark);

    ctx.restore();
    iconCache.set(key, cv);
    return cv;
  }

  /* ---- gun: stock + receiver + barrel + magazine, gains scope/energy   */
  function drawWeapon(p, t, c, dark) {
    p.px(2, 12, 7, 5, dark);              // stock shadow
    p.px(2, 12, 6, 4, c.b);
    p.px(5, 10, 13, 5, dark);             // receiver shadow
    p.px(5, 10, 12, 4, c.a);
    p.px(16, 11, 7, 3, dark);             // barrel
    p.px(16, 11, 6, 2, c.n);
    p.px(9, 14, 4, 6, dark);              // magazine
    p.px(9, 14, 3, 5, c.b);
    p.px(13, 14, 3, 3, c.b);              // grip
    if (t >= 3) { p.px(10, 6, 7, 4, dark); p.px(10, 6, 6, 3, c.n); p.dot(13, 7, '#fff'); } // scope
    if (t >= 5) { p.px(18, 9, 4, 2, c.n); p.dot(21, 9, '#ffffff'); }                       // muzzle brake
    if (t >= 6) { p.px(6, 8, 8, 1, c.n); }                                                 // rail
    if (t >= 7) { p.px(19, 12, 4, 1, '#ffffff'); p.px(20, 10, 3, 1, c.n); }                // energy vents
    if (t >= 8) { p.px(3, 9, 3, 3, c.n); p.dot(4, 10, '#fff'); }                           // power core
    p.px(5, 10, 12, 1, c.n);              // top highlight
  }

  /* ---- car: body, cabin, windows, wheels; gets sleeker + armoured      */
  function drawVehicle(p, t, c, dark) {
    const roofY = t >= 6 ? 5 : 6;
    p.px(2, 10, 20, 8, dark);                       // chassis shadow
    p.px(3, 11, 18, 6, c.a);                        // body
    p.px(6, roofY, 12, 6, dark);                    // cabin shadow
    p.px(7, roofY + 1, 10, 5, c.b);                 // cabin
    p.px(8, roofY + 2, 3, 3, '#0e2740');            // windshield
    p.px(12, roofY + 2, 4, 3, '#123049');
    p.px(8, roofY + 2, 3, 1, c.n);                  // glass glint
    p.px(3, 11, 18, 1, c.n);                        // hood highlight
    // wheels
    p.px(4, 17, 5, 4, '#05070d'); p.px(5, 18, 3, 2, '#2a3350');
    p.px(15, 17, 5, 4, '#05070d'); p.px(16, 18, 3, 2, '#2a3350');
    p.px(2, 13, 2, 2, '#ffe9a8');                   // headlight
    p.px(20, 13, 2, 2, '#ff5a5a');                  // taillight
    if (t >= 4) { p.px(3, 9, 6, 2, c.b); p.px(15, 9, 6, 2, c.b); }        // spoilers / plating
    if (t >= 5) { p.px(9, 3, 6, 2, dark); p.px(10, 3, 4, 1, c.n); }       // roof rack / turret base
    if (t >= 7) { p.px(1, 15, 22, 1, c.n); }                              // underglow
    if (t >= 8) { p.px(10, 1, 4, 2, c.n); p.dot(11, 1, '#fff'); }         // hover thruster
  }

  /* ---- crew agent: helmet, visor, suit, boots; colour marks the role   */
  function drawAgent(p, t, c, dark) {
    const suit = c.a, suitD = c.b, skin = '#f2c39a';
    p.px(8, 2, 8, 7, dark);            // helmet shell
    p.px(9, 3, 6, 5, suitD);
    p.px(9, 5, 6, 3, '#0d1a2c');       // visor
    p.px(10, 6, 4, 1, c.n);            // visor glow
    p.px(7, 9, 10, 9, dark);           // torso shadow
    p.px(8, 10, 8, 7, suit);
    p.px(8, 10, 8, 1, c.n);            // shoulder light
    p.px(11, 12, 2, 3, c.n);           // chest lamp
    p.px(5, 10, 3, 7, suitD);          // arms
    p.px(16, 10, 3, 7, suitD);
    p.px(5, 16, 3, 2, skin); p.px(16, 16, 3, 2, skin);
    p.px(8, 17, 3, 5, suitD);          // legs
    p.px(13, 17, 3, 5, suitD);
    p.px(8, 21, 3, 2, '#12172a'); p.px(13, 21, 3, 2, '#12172a'); // boots
    if (t >= 3) { p.px(16, 8, 3, 3, c.n); }                       // shoulder pauldron
    if (t >= 4) { p.px(6, 6, 2, 3, c.n); }                        // antenna
    if (t >= 5) { p.px(8, 14, 8, 1, c.n); }                       // utility belt
    if (t >= 6) { p.px(4, 12, 1, 6, c.n); p.px(19, 12, 1, 6, c.n); } // arm lights
    if (t >= 7) { p.px(7, 1, 10, 1, c.n); }                       // halo crest
    if (t >= 8) { p.px(2, 9, 3, 10, U.rgba(c.a, .55)); p.px(19, 9, 3, 10, U.rgba(c.a, .55)); } // cape/wings
  }

  /** DOM-friendly cached data-URL of an item icon. */
  const urlCache = new Map();
  function itemIconURL(kind, tier, size) {
    const key = kind + tier + '@' + (size || 96);
    if (!urlCache.has(key)) urlCache.set(key, itemIcon(kind, tier, size).toDataURL());
    return urlCache.get(key);
  }

  /* ====================================================  BUILDING ART  */
  /**
   * Flat-top hexagonal outpost sitting on a glowing pad.
   * w = footprint width in px; colour from the building def.
   */
  function drawBuilding(ctx, x, y, w, col, level, t) {
    const r = w / 2, h = w * 0.62;                 // hex radius / prism height
    const top = y - h;
    const light = U.shade(col, .45), dark = U.shade(col, -.55), mid = U.shade(col, -.25);

    ctx.save();
    // ------- glowing ground pad (the square plate in the reference art)
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, w * .045);
    ctx.shadowColor = col; ctx.shadowBlur = w * .5;
    ctx.globalAlpha = .85;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.15, y + r * .30);
    ctx.lineTo(x,            y + r * .62);
    ctx.lineTo(x + r * 1.15, y + r * .30);
    ctx.lineTo(x,            y - r * .02);
    ctx.closePath();
    ctx.fillStyle = U.rgba(col, .18); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;

    // ------- prism side walls
    ctx.shadowBlur = 0;
    const hp = (cy, rr) => { U.hexPath(ctx, x, cy, rr); };
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x - r, top);
    ctx.lineTo(x - r / 2, top + r * .31); ctx.lineTo(x + r / 2, top + r * .31);
    ctx.lineTo(x + r, top); ctx.lineTo(x + r, y);
    ctx.lineTo(x + r / 2, y + r * .31); ctx.lineTo(x - r / 2, y + r * .31);
    ctx.closePath();
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, dark); g.addColorStop(.5, mid); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = U.rgba(col, .9); ctx.lineWidth = Math.max(1, w * .03);
    ctx.shadowColor = col; ctx.shadowBlur = w * .35; ctx.stroke();

    // ------- roof
    hp(top, r);
    ctx.fillStyle = U.shade(col, -.15); ctx.fill();
    ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, w * .028); ctx.stroke();
    ctx.shadowBlur = 0;

    // ------- roof detail hatch + level pips
    ctx.fillStyle = U.rgba('#000000', .35);
    ctx.fillRect(x - r * .34, top - r * .10, r * .68, r * .22);
    ctx.fillStyle = light;
    for (let i = 0; i < Math.min(level, 5); i++) {
      ctx.fillRect(x - r * .30 + i * r * .14, top - r * .05, r * .07, r * .10);
    }

    // ------- door + windows (window glow pulses)
    const pulse = .55 + .45 * Math.sin((t || 0) * 2.2 + x * .05);
    ctx.fillStyle = U.rgba('#04060c', .85);
    ctx.fillRect(x - r * .20, y - h * .42, r * .40, h * .42);
    ctx.fillStyle = U.rgba(light, .35 + .4 * pulse);
    ctx.fillRect(x - r * .16, y - h * .36, r * .32, h * .30);
    ctx.fillStyle = U.rgba(light, .5 + .4 * pulse);
    for (let i = -1; i <= 1; i += 2) ctx.fillRect(x + i * r * .52 - r * .08, y - h * .70, r * .16, h * .16);

    ctx.restore();
  }

  /* ================================================  SKYLINE BACKDROP  */
  const SIGN_WORDS = ['RNUTOS','DOFACT','ZARAOTE','CYBER','ZEALY','GUNS','NEON','KABU','MERGER','SHINJU','GRID','7-11','DATA','VICE','ONI','NOIR','SYNTH','HEX'];
  let bgCache = null;

  /**
   * Cached rainy night skyline. Regenerated only when the viewport size
   * changes, then blitted every frame by the scenes.
   */
  function skyline(w, h, seed) {
    if (bgCache && bgCache.w === w && bgCache.h === h && bgCache.seed === seed) return bgCache.cv;
    const rnd = U.seeded(seed || 1337);
    const cv = U.makeCanvas(w, h);
    const ctx = cv.getContext('2d');

    // ---- sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0,   '#05070f');
    sky.addColorStop(.35, '#0a1024');
    sky.addColorStop(.62, '#141c3a');
    sky.addColorStop(1,   '#070a16');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // ---- distant glow haze
    const haze = ctx.createRadialGradient(w * .5, h * .62, 10, w * .5, h * .62, w * .75);
    haze.addColorStop(0, 'rgba(60,120,220,.16)'); haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);

    // ---- three parallax layers of towers, far -> near
    const layers = [
      { n: 26, hMin: .16, hMax: .34, col: '#0b1024', win: .12, alpha: .9 },
      { n: 18, hMin: .24, hMax: .48, col: '#080c1c', win: .20, alpha: .95 },
      { n: 12, hMin: .34, hMax: .62, col: '#05070f', win: .28, alpha: 1 }
    ];
    const horizon = h * .74;
    layers.forEach((L, li) => {
      ctx.globalAlpha = L.alpha;
      for (let i = 0; i < L.n; i++) {
        const bw = w * (0.05 + rnd() * 0.08);
        const bx = -bw + rnd() * (w + bw * 2);
        const bh = h * (L.hMin + rnd() * (L.hMax - L.hMin));
        const by = horizon - bh;
        ctx.fillStyle = L.col; ctx.fillRect(bx, by, bw, bh + h);
        // roof antenna
        if (rnd() < .35) { ctx.fillRect(bx + bw * .45, by - h * .05, Math.max(1, bw * .04), h * .05); }
        // lit windows
        const cols = Math.max(2, Math.floor(bw / (w * .012)));
        const rows = Math.max(3, Math.floor(bh / (h * .022)));
        for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
          if (rnd() > L.win) continue;
          const wc = rnd();
          ctx.fillStyle = wc < .55 ? 'rgba(150,200,255,.55)' : wc < .8 ? 'rgba(255,120,190,.5)' : 'rgba(255,190,90,.5)';
          ctx.fillRect(bx + 3 + cx * (bw - 6) / cols, by + 4 + cy * (bh - 8) / rows,
                       Math.max(1, (bw - 6) / cols * .55), Math.max(1, (bh - 8) / rows * .45));
        }
        // rooftop neon strip
        if (li > 0 && rnd() < .5) {
          const nc = U.choice(['#ff3fa4', '#24e2ff', '#ffb020']);
          ctx.save(); ctx.shadowColor = nc; ctx.shadowBlur = 14; ctx.fillStyle = nc;
          ctx.fillRect(bx + bw * .15, by - 2, bw * .7, 2); ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    });

    // ---- vertical neon signs down both edges (the reference's signature)
    const signCount = Math.max(4, Math.round(w / 320) * 3);
    for (let i = 0; i < signCount; i++) {
      const left = i % 2 === 0;
      const sw = Math.max(22, w * .028);
      const word = SIGN_WORDS[Math.floor(rnd() * SIGN_WORDS.length)];
      const sh = sw * (word.length * 1.15 + 1);
      const sx = left ? rnd() * w * .18 : w - rnd() * w * .18 - sw;
      const sy = h * (.06 + rnd() * .30);
      neonSign(ctx, sx, sy, sw, sh, word, U.choice(['#ff3fa4', '#24e2ff', '#ffb020', '#ff4b57']));
    }

    // ---- street haze at the bottom
    const fog = ctx.createLinearGradient(0, horizon - h * .06, 0, h);
    fog.addColorStop(0, 'rgba(20,30,60,0)'); fog.addColorStop(1, 'rgba(30,45,90,.35)');
    ctx.fillStyle = fog; ctx.fillRect(0, horizon - h * .06, w, h);

    bgCache = { cv, w, h, seed };
    return cv;
  }

  /** A glowing vertical shop sign with stacked pixel letters. */
  function neonSign(ctx, x, y, w, h, word, col) {
    ctx.save();
    ctx.globalAlpha = .92;
    ctx.fillStyle = 'rgba(6,8,16,.9)';
    U.roundRect(ctx, x, y, w, h, 3); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.stroke();

    const scale = Math.max(1, Math.floor(w / 9));
    const step = 7 * scale + 3;
    let cy = y + (h - word.length * step) / 2;
    for (let i = 0; i < word.length; i++) {
      text(ctx, word[i], x + w / 2, cy, scale, { align: 'center', color: '#ffffff', glow: 10, glowColor: col });
      cy += step;
    }
    ctx.restore();
  }

  /* ==================================================  MISC GENERATORS  */
  /** Small crew portrait used in the HUD (fedora silhouette, noir style). */
  let portraitCache = null;
  function portrait(size) {
    if (portraitCache && portraitCache.width === size) return portraitCache;
    const cv = U.makeCanvas(size, size), ctx = cv.getContext('2d');
    const cell = size / 16, p = pixelPainter(ctx, cell);
    p.px(0, 0, 16, 16, '#0a0f1e');
    p.px(2, 2, 12, 3, '#2a2036');            // hat brim
    p.px(4, 0, 8, 3, '#3a2c48');             // crown
    p.px(4, 5, 8, 7, '#e8b48a');             // face
    p.px(5, 7, 2, 1, '#0b0f1c'); p.px(9, 7, 2, 1, '#0b0f1c'); // eyes
    p.px(6, 10, 4, 1, '#7a4a35');            // mouth
    p.px(3, 12, 10, 4, '#1a2338');           // coat
    p.px(7, 12, 2, 4, '#c8352f');            // tie
    p.px(5, 7, 1, 1, '#24e2ff'); p.px(10, 7, 1, 1, '#ff3fa4'); // cyber eyes
    portraitCache = cv; return cv;
  }

  /** Building/ability rail icons (abstract neon glyphs). */
  const glyphCache = new Map();
  function glyph(kind, col, size) {
    size = size || 64;
    const key = kind + col + size;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const cv = U.makeCanvas(size, size), ctx = cv.getContext('2d');
    const s = size, c = col;
    ctx.save();
    ctx.strokeStyle = c; ctx.fillStyle = U.rgba(c, .22);
    ctx.lineWidth = Math.max(2, s * .05);
    ctx.shadowColor = c; ctx.shadowBlur = s * .18;
    const cx = s / 2, cy = s / 2, r = s * .30;
    switch (kind) {
      case 'node':                                    // hexagon
        U.hexPath(ctx, cx, cy, r * 1.15); ctx.fill(); ctx.stroke(); break;
      case 'den':                                     // diamond
        ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'vault':                                   // ring + core
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * .42, 0, 7); ctx.fill(); ctx.stroke(); break;
      case 'relay':                                   // triangle
        ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * .8);
        ctx.lineTo(cx - r, cy + r * .8); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'bolt':                                    // lightning
        ctx.beginPath(); ctx.moveTo(cx + r * .3, cy - r); ctx.lineTo(cx - r * .35, cy + r * .1);
        ctx.lineTo(cx + r * .05, cy + r * .1); ctx.lineTo(cx - r * .3, cy + r);
        ctx.lineTo(cx + r * .4, cy - r * .15); ctx.lineTo(cx, cy - r * .15); ctx.closePath();
        ctx.fill(); ctx.stroke(); break;
      case 'target':
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - r * 1.3, cy); ctx.lineTo(cx + r * 1.3, cy);
        ctx.moveTo(cx, cy - r * 1.3); ctx.lineTo(cx, cy + r * 1.3); ctx.stroke(); break;
      case 'chip':
        U.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, 3); ctx.fill(); ctx.stroke();
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(cx + i * r * .6, cy - r * 1.4); ctx.lineTo(cx + i * r * .6, cy - r);
          ctx.moveTo(cx + i * r * .6, cy + r); ctx.lineTo(cx + i * r * .6, cy + r * 1.4); ctx.stroke();
        } break;
      case 'wrench':
        ctx.beginPath(); ctx.arc(cx - r * .4, cy - r * .4, r * .5, .7, 5.6); ctx.stroke();
        ctx.lineWidth = s * .09; ctx.beginPath();
        ctx.moveTo(cx - r * .1, cy - r * .1); ctx.lineTo(cx + r * .8, cy + r * .8); ctx.stroke(); break;
      default:                                        // square core
        U.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, 4); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    glyphCache.set(key, cv);
    return cv;
  }
  function glyphURL(kind, col, size) {
    const key = 'u' + kind + col + size;
    if (!urlCache.has(key)) urlCache.set(key, glyph(kind, col, size).toDataURL());
    return urlCache.get(key);
  }

  /**
   * Targeting reticle drawn over an arbitrary quad (the base grid's tiles are
   * perspective trapezoids, so this takes four points rather than a rect).
   * Renders a tinted fill, an animated dashed border and four corner brackets.
   *   opts: { fill, dash, brackets, crosshair, t (seconds, for animation) }
   */
  function targetQuad(ctx, q, color, opts) {
    opts = opts || {};
    const t = opts.t || 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);

    ctx.save();
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(q[0].x, q[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
      ctx.closePath();
    };

    if (opts.fill !== false) {
      trace();
      ctx.fillStyle = U.rgba(color, (opts.fill || 0.12) + 0.05 * pulse);
      ctx.fill();
    }

    if (opts.dash !== false) {
      trace();
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -t * 26;                 // slow crawl around the tile
      ctx.strokeStyle = U.rgba(color, 0.5);
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (opts.brackets !== false) {
      // Each corner grows two short legs toward its neighbours — the classic
      // "locked on" bracket, but following the tile's perspective edges.
      const len = 0.26 + 0.05 * pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, (opts.weight || 2.6));
      ctx.lineCap = 'square';
      ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const c = q[i], prev = q[(i + 3) % 4], next = q[(i + 1) % 4];
        ctx.moveTo(c.x + (next.x - c.x) * len, c.y + (next.y - c.y) * len);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(c.x + (prev.x - c.x) * len, c.y + (prev.y - c.y) * len);
      }
      ctx.stroke();
    }

    if (opts.crosshair) {
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
      const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      const r = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) * 0.16;
      ctx.strokeStyle = U.rgba(color, 0.85);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * .35, cy);
      ctx.moveTo(cx + r * .35, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r * .7); ctx.lineTo(cx, cy - r * .24);
      ctx.moveTo(cx, cy + r * .24); ctx.lineTo(cx, cy + r * .7);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * .18, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  /** Ambient ground clutter (weeds / rubble) for the base grid. */
  function clutter(ctx, x, y, s, seed) {
    const r = U.seeded(seed);
    ctx.save();
    if (r() < .5) {                       // weed tuft
      ctx.strokeStyle = 'rgba(40,60,50,.9)'; ctx.lineWidth = Math.max(1, s * .06);
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (r() - .5) * 1.5;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * s * .6, y + Math.sin(a) * s * .8); ctx.stroke();
      }
    } else {                              // rubble
      ctx.fillStyle = 'rgba(28,32,44,.95)';
      ctx.beginPath(); ctx.ellipse(x, y, s * .38, s * .22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(52,58,76,.9)';
      ctx.beginPath(); ctx.ellipse(x - s * .08, y - s * .06, s * .18, s * .10, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /** Reset caches that depend on viewport size. */
  function invalidate() { bgCache = null; }

  return {
    text, textWidth, itemIcon, itemIconURL, drawBuilding, skyline, neonSign,
    portrait, glyph, glyphURL, clutter, targetQuad, pixelPainter, tcol, invalidate, SIGN_WORDS
  };
})();
