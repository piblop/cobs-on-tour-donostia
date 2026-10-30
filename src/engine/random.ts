/**
 * Seeded randomness. Decorative variation uses its own streams so it can never
 * influence progression or saved outcomes.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared stream for purely cosmetic choices (tree sizes, bobbing phases). */
export const decorRandom = mulberry32(0xc0b5);
