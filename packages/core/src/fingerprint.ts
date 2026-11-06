/**
 * Pill fingerprint: a small description of a pill's colour and shape, built
 * from a low-resolution photo of one pill on a plain background, and kept on
 * the phone. Comparing two fingerprints answers "does this look like your
 * usual pill?". It is a supporting check: the label and barcode are what
 * confirm the strength.
 *
 * Works on raw RGBA pixels so it runs anywhere (phone, tests, evaluation).
 * Thresholds are starting values to be calibrated on the phase 2 photo set.
 */

export interface PillFingerprint {
  v: 1;
  /** Mean colour of the pill in CIE Lab. */
  lab: [number, number, number];
  /** Hue histogram (12 bins, weighted by saturation), sums to 1. Empty for white/grey pills. */
  hue: number[];
  /** Share of the pill that is near-white/grey (low saturation), 0–1. */
  neutral: number;
  /** Long axis ÷ short axis from second moments: 1 = round, about 2+ = capsule or oblong. */
  elongation: number;
  /** Share of the frame covered by the pill: too small means the photo is unusable. */
  coverage: number;
}

export type PillMatch = "same" | "different" | "unsure";

function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function hueSat(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: h * 60, s };
}

const dist = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * @param rgba width*height*4 bytes
 * Returns null when no pill can be separated from the background.
 */
export function pillFingerprint(rgba: ArrayLike<number>, width: number, height: number): PillFingerprint | null {
  const px = (i: number): [number, number, number] => [rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!];

  // Background = median Lab colour of the border pixels.
  const border: [number, number, number][] = [];
  for (let x = 0; x < width; x++) border.push(srgbToLab(...px(x)), srgbToLab(...px((height - 1) * width + x)));
  for (let y = 0; y < height; y++) border.push(srgbToLab(...px(y * width)), srgbToLab(...px(y * width + width - 1)));
  const med = (k: 0 | 1 | 2) => border.map((c) => c[k]).sort((a, b) => a - b)[Math.floor(border.length / 2)]!;
  const bg: [number, number, number] = [med(0), med(1), med(2)];

  // Threshold adapts to how noisy the background is (paper texture, sensor noise).
  const borderDist = border.map((c) => dist(c, bg)).sort((a, b) => a - b);
  const threshold = Math.max(12, borderDist[Math.floor(borderDist.length * 0.95)]! + 6);

  const total = width * height;
  const labs: [number, number, number][] = new Array(total);
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    labs[i] = srgbToLab(...px(i));
    if (dist(labs[i]!, bg) >= threshold) mask[i] = 1;
  }
  const pill = largestBlob(mask, width, height);

  const hue = new Array<number>(12).fill(0);
  const sum: [number, number, number] = [0, 0, 0];
  let n = 0;
  let neutral = 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const i of pill) {
    const x = i % width, y = (i - x) / width;
    const lab = labs[i]!;
    const [r, g, b] = px(i);
    n++;
    sum[0] += lab[0];
    sum[1] += lab[1];
    sum[2] += lab[2];
    const { h, s } = hueSat(r, g, b);
    if (s < 0.15) neutral++;
    else hue[Math.floor(h / 30) % 12]! += s;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const coverage = n / (width * height);
  if (coverage < 0.03) return null;

  const mx = sx / n, my = sy / n;
  const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);

  const hueTotal = hue.reduce((a, b) => a + b, 0);
  return {
    v: 1,
    lab: [sum[0] / n, sum[1] / n, sum[2] / n],
    hue: hueTotal ? hue.map((h) => h / hueTotal) : [],
    neutral: neutral / n,
    elongation: Math.sqrt(l1 / l2),
    coverage,
  };
}

/** Pixel indexes of the largest 4-connected region of the mask: the pill, without stray specks. */
function largestBlob(mask: Uint8Array, width: number, height: number): number[] {
  const seen = new Uint8Array(mask.length);
  let best: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const blob: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      blob.push(i);
      const x = i % width;
      const next = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of next) {
        if (j >= 0 && j < width * height && mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (blob.length > best.length) best = blob;
  }
  return best;
}

/** 0–1 similarity between two fingerprints. */
export function pillSimilarity(a: PillFingerprint, b: PillFingerprint): number {
  const colour = Math.max(0, 1 - dist(a.lab, b.lab) / 40); // ΔE 40 or more = unrelated colours
  let hueOverlap = 1;
  if (a.hue.length && b.hue.length) hueOverlap = a.hue.reduce((s, h, i) => s + Math.min(h, b.hue[i] ?? 0), 0);
  else if (a.hue.length || b.hue.length) hueOverlap = 1 - Math.max(a.neutral, b.neutral) > 0.5 ? 0.3 : 0.8;
  const neutral = 1 - Math.abs(a.neutral - b.neutral);
  const shape = Math.max(0, 1 - Math.abs(Math.log(a.elongation / b.elongation)) / Math.log(1.8));
  return 0.4 * colour + 0.2 * hueOverlap + 0.1 * neutral + 0.3 * shape;
}

export const PILL_SAME = 0.8;
export const PILL_DIFFERENT = 0.55;

export function comparePills(reference: PillFingerprint, seen: PillFingerprint): { result: PillMatch; score: number } {
  const score = pillSimilarity(reference, seen);
  return { result: score >= PILL_SAME ? "same" : score <= PILL_DIFFERENT ? "different" : "unsure", score };
}
