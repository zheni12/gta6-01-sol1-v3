// rng.js — a tiny deterministic random source. The whole city is generated
// from one seed so every player, and every screenshot, sees the same
// Solmar Bay; the seed comes from the ?seed= query parameter.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  float() { return this.next(); }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  chance(p) { return this.next() < p; }
  // A shuffled copy, for dealing out spawn points without repeats.
  shuffled(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

// Parse the query string once: seed and shot staging ride on it.
export function queryParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    seed: Number(q.get('seed') || 20261117) >>> 0,
    shot: q.get('shot') || '',
  };
}
