/** Small seeded RNG so a profile's scatterSeed rebuilds the same puzzle. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pickSeed(preferred: number | undefined): number {
  if (preferred && preferred !== 0) return preferred >>> 0;
  return ((Math.random() * 0xffffffff) >>> 0) || 1;
}
