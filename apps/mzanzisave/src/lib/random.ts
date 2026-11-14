/** Deterministic pseudo-random numbers so sample data is stable across reloads and devices. */
export function hash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Final avalanche (murmur3 fmix32)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Random number in [min, max) seeded by the key. */
export function between(key: string, min: number, max: number): number {
  return min + hash(key) * (max - min);
}

export function pick<T>(key: string, items: readonly T[]): T {
  return items[Math.floor(hash(key) * items.length)];
}
