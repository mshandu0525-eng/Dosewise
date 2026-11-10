import { describe, expect, it } from "vitest";
import { comparePills, pillFingerprint } from "./fingerprint";

type RGB = [number, number, number];

/** Draws an ellipse "pill" on a plain background, optionally rotated and with noise. */
function photo(opts: { pill: RGB; bg?: RGB; rx: number; ry: number; angle?: number; noise?: number; size?: number; seed?: number }) {
  const size = opts.size ?? 64;
  const bg = opts.bg ?? [235, 232, 225];
  const data = new Uint8Array(size * size * 4);
  let seed = opts.seed ?? 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const a = opts.angle ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2, dy = y - size / 2;
      const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
      const inside = (u / opts.rx) ** 2 + (v / opts.ry) ** 2 <= 1;
      const c = inside ? opts.pill : bg;
      for (let k = 0; k < 3; k++) data[(y * size + x) * 4 + k] = Math.max(0, Math.min(255, c[k]! + rand() * (opts.noise ?? 0)));
      data[(y * size + x) * 4 + 3] = 255;
    }
  }
  return pillFingerprint(data, size, size);
}

const WHITE_ROUND = { pill: [250, 250, 248] as RGB, bg: [60, 70, 90] as RGB, rx: 14, ry: 14 };
const PINK_OBLONG = { pill: [230, 150, 170] as RGB, rx: 22, ry: 9 };
const YELLOW_OBLONG = { pill: [235, 205, 60] as RGB, rx: 22, ry: 9 };

describe("pill fingerprint", () => {
  it("measures shape: round vs oblong", () => {
    expect(photo(WHITE_ROUND)!.elongation).toBeCloseTo(1, 1);
    expect(photo(PINK_OBLONG)!.elongation).toBeGreaterThan(2);
  });

  it("returns null when there is no pill in frame", () => {
    expect(photo({ pill: [235, 232, 225], rx: 10, ry: 10 })).toBeNull();
  });

  it("matches the same pill rotated, with noise and lighting change", () => {
    const ref = photo(PINK_OBLONG)!;
    const again = photo({ ...PINK_OBLONG, pill: [222, 142, 162], angle: 1.1, noise: 12, seed: 7 })!;
    expect(comparePills(ref, again).result).toBe("same");
  });

  it("flags a different colour of the same shape", () => {
    expect(comparePills(photo(PINK_OBLONG)!, photo(YELLOW_OBLONG)!).result).toBe("different");
  });

  it("flags a different shape of the same colour", () => {
    const round = photo({ ...PINK_OBLONG, rx: 13, ry: 13 })!;
    expect(comparePills(photo(PINK_OBLONG)!, round).result).not.toBe("same");
  });

  it("works for white pills on a dark background", () => {
    const ref = photo(WHITE_ROUND)!;
    expect(comparePills(ref, photo({ ...WHITE_ROUND, noise: 10, seed: 3 })!).result).toBe("same");
    expect(comparePills(ref, photo(YELLOW_OBLONG)!).result).toBe("different");
  });
});
