// Seeded PRNG. The battle simulation must be reproducible from a seed alone,
// so nothing in sim code may reach for Math.random.

/** Hash an arbitrary string into a 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough for a game, trivially reproducible. */
export class Rng {
  constructor(seed = 1) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.state = this.seed;
  }

  /** Float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined;
  }

  /** Fisher-Yates, in place, returns the same array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Pick n distinct entries, without disturbing the source array. */
  sample(arr, n) {
    return this.shuffle(arr.slice()).slice(0, n);
  }

  /** Weighted pick. `weightOf` defaults to reading `.weight`. */
  weighted(arr, weightOf = (x) => x.weight ?? 1) {
    let total = 0;
    for (const item of arr) total += Math.max(0, weightOf(item));
    if (total <= 0) return this.pick(arr);
    let roll = this.next() * total;
    for (const item of arr) {
      roll -= Math.max(0, weightOf(item));
      if (roll <= 0) return item;
    }
    return arr[arr.length - 1];
  }

  /** Snapshot/restore so a save can resume a run's RNG exactly. */
  save() { return this.state >>> 0; }
  restore(state) { this.state = state >>> 0; return this; }

  /** A child stream, so consuming numbers in one system can't shift another. */
  fork(tag = '') {
    return new Rng((this.state ^ hashSeed(tag) ^ Math.imul(this.int(0, 0xffff), 2654435761)) >>> 0);
  }
}

/** Convenience for one-off non-simulation randomness (cosmetic FX, etc). */
export const cosmetic = new Rng(Date.now() >>> 0);
