/**
 * Reading medicine labels: pull strengths ("500 mg", "2,5 mg", "250 mg/5 ml")
 * and the medicine name out of OCR text, tolerating common OCR mistakes.
 * Pure functions; the OCR itself runs on the phone (Apple Vision / ML Kit).
 */

/** Canonical strength, e.g. "500mg", "0.5mg", "250mg/5ml", "100iu", "1%". Strengths in mcg and g become mg. */
export type Strength = string;

const UNIT: Record<string, { to: string; factor: number }> = {
  mg: { to: "mg", factor: 1 },
  milligram: { to: "mg", factor: 1 },
  milligrams: { to: "mg", factor: 1 },
  g: { to: "mg", factor: 1000 },
  gram: { to: "mg", factor: 1000 },
  grams: { to: "mg", factor: 1000 },
  mcg: { to: "mg", factor: 0.001 },
  µg: { to: "mg", factor: 0.001 },
  μg: { to: "mg", factor: 0.001 },
  ug: { to: "mg", factor: 0.001 },
  microgram: { to: "mg", factor: 0.001 },
  micrograms: { to: "mg", factor: 0.001 },
  iu: { to: "iu", factor: 1 },
  units: { to: "iu", factor: 1 },
  ml: { to: "ml", factor: 1 },
  "%": { to: "%", factor: 1 },
};

const UNIT_RE = "mg|milligrams?|mcg|µg|μg|ug|micrograms?|grams?|g|iu|units|ml|%";

/** Fixes OCR confusions inside numbers: "5OO mg" → "500 mg", "l0 mg" → "10 mg", SA decimal comma "2,5" → "2.5". */
export function normaliseOcr(text: string): string {
  // O/o, l/I/| touching digits are almost always 0 and 1 on labels ("5OO" → "500").
  let t = text.replace(/ /g, " ");
  for (let prev = ""; prev !== t; ) {
    prev = t;
    t = t
      .replace(/(\d)[Oo]/g, "$10")
      .replace(/[Oo](\d)/g, "0$1")
      .replace(/(\d)[lI|]/g, "$11")
      .replace(/[lI|](\d)/g, "1$1");
  }
  // a lone l/I/| right before a unit is a 1: "Warfarin l mg" → "Warfarin 1 mg"
  t = t.replace(/(^|\s)[lI|](\s*(?:mg|mcg|µg|g)\b)/g, "$11$2");
  return (
    t
      // decimal comma between digits (not a thousands separator like "1,000")
      .replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2")
      // thousands separators and spaces: "1,000 mg" / "1 000 mg"
      .replace(/(\d)[, ](\d{3})(?!\d)/g, "$1$2")
  );
}

function fmt(n: number) {
  return String(Number(n.toPrecision(6)));
}

function canonical(value: number, unitRaw: string): string | null {
  const u = UNIT[unitRaw.toLowerCase()];
  if (!u || !Number.isFinite(value) || value <= 0) return null;
  return `${fmt(value * u.factor)}${u.to}`;
}

/**
 * All strengths found in text. Handles concentrations ("250 mg/5 ml") and
 * combinations ("50 mg/12.5 mg", "50/12.5 mg" → both parts).
 */
export function parseStrengths(text: string): Strength[] {
  const t = normaliseOcr(text);
  const found = new Set<Strength>();
  const num = "(\\d+(?:\\.\\d+)?)";
  // concentration: 250 mg / 5 ml  (also "250mg per 5ml")
  const conc = new RegExp(`${num}\\s*(${UNIT_RE})\\s*(?:/|per)\\s*${num}?\\s*(ml)\\b`, "gi");
  let consumed = t.replace(conc, (_m, a: string, ua: string, b: string | undefined) => {
    const top = canonical(Number(a), ua);
    if (top) found.add(`${top}/${fmt(Number(b ?? 1))}ml`);
    return " ";
  });
  // shorthand combination: 50/12.5 mg  → 50mg + 12.5mg
  const combo = new RegExp(`${num}\\s*/\\s*${num}\\s*(${UNIT_RE})(?![a-z])`, "gi");
  consumed = consumed.replace(combo, (_m, a: string, b: string, u: string) => {
    for (const v of [a, b]) {
      const c = canonical(Number(v), u);
      if (c) found.add(c);
    }
    return " ";
  });
  const single = new RegExp(`${num}\\s*(${UNIT_RE})(?![a-z])`, "gi");
  for (const m of consumed.matchAll(single)) {
    const c = canonical(Number(m[1]), m[2]!);
    if (c && !c.endsWith("ml")) found.add(c); // a bare volume ("100 ml bottle") is a pack size, not a strength
  }
  return [...found];
}

const STOP = new Set([
  "tablet", "tablets", "capsule", "capsules", "each", "contains", "film", "coated", "oral", "solution", "suspension",
  "keep", "out", "reach", "children", "store", "below", "use", "only", "prescription", "medicine", "hydrochloride",
  "sodium", "potassium", "and", "the", "for", "with", "mg", "mcg", "pack", "batch", "exp", "reg", "no", "s4", "s3", "s2",
  // dosage forms: people type them into the name ("Paracetamol syrup") but labels word them differently
  "syrup", "drops", "cream", "ointment", "gel", "injection", "inhaler", "spray", "patch", "liquid", "suppository", "suppositories",
]);

function words(text: string) {
  return normaliseOcr(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** True if every significant word of the medicine name appears in the text (allowing small OCR errors). */
export function nameFound(name: string, text: string): boolean {
  const target = words(name).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w));
  if (!target.length) return false;
  const seen = words(text);
  return target.every((w) => seen.some((s) => s === w || (w.length >= 6 && Math.abs(s.length - w.length) <= 2 && editDistance(s, w) <= Math.floor(w.length / 6))));
}

/** Best guess of name and strength from a label, used to pre-fill the Add form. The person confirms both. */
export function guessFromLabel(lines: string[]): { name?: string; strength?: string } {
  for (const line of lines) {
    const strengths = parseStrengths(line);
    if (!strengths.length) continue;
    const before = normaliseOcr(line).split(/\d/)[0]!.trim().replace(/[^A-Za-z\- ]/g, "").trim();
    const nameWords = before.split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
    if (nameWords.length) return { name: nameWords.slice(0, 3).join(" "), strength: displayStrength(strengths[0]!) };
  }
  const strengths = parseStrengths(lines.join("\n"));
  const nameLine = lines.find((l) => /^[A-Za-z][A-Za-z\- ]{3,30}$/.test(l.trim()) && !STOP.has(l.trim().toLowerCase()));
  return { name: nameLine?.trim(), strength: strengths[0] && displayStrength(strengths[0]) };
}

/** "500mg" → "500 mg", "250mg/5ml" → "250 mg/5 ml". */
export function displayStrength(s: Strength) {
  return s.replace(/(\d)([a-z%])/g, "$1 $2");
}

/**
 * Product number (GTIN-14) from any pack barcode, so the same product matches across boxes.
 * Linear EAN-13 / UPC-A / EAN-8 are padded to 14 digits. GS1 DataMatrix codes also carry a
 * serial, batch and expiry that change per box; only the GTIN (application identifier 01) is kept.
 */
export function normaliseBarcode(raw: string): string | undefined {
  const data = raw.replace(/^\]d2|^\]C1|^\]Q3/, "").replace(/[\x1d\x1e\x04]/g, "|");
  const gs1 = /(?:^|\|)\(?01\)?(\d{14})/.exec(data);
  if (gs1) return gs1[1];
  const digits = data.replace(/\s/g, "");
  if (/^\d{8}$|^\d{12,14}$/.test(digits)) return digits.padStart(14, "0");
  return undefined;
}
