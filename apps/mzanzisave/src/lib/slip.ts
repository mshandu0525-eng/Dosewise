/**
 * Till-slip check: read a photographed slip and say straight away whether it's usable,
 * with a clear reason when it isn't, so the shopper can re-snap while still at the till.
 */
import { parseStore } from './ocr';
import { PRODUCT_BY_ID, type Product } from '../data/products';
import { COUPONS } from '../data/coupons';
import { todaySA, formatDay } from './date';

export interface SlipIssue {
  level: 'error' | 'warning';
  text: string;
}

export interface SlipResult {
  ok: boolean;
  retailerId: string | null;
  total: number | null;
  /** SA day number of the slip date, when found. */
  day: number | null;
  issues: SlipIssue[];
  /** Basket products found on the slip. */
  found: string[];
  /** Clipped coupon ids whose product is on the slip. */
  couponsFound: string[];
  couponsMissing: string[];
}

const TOTAL_RE = /\b(?:total(?:\s*due)?|amount\s*due|balance\s*due|to\s*pay|tot(?:aal)?)\b[^\d\n]{0,15}R?\s?(\d{1,5}[.,]\d{2})/i;
const SUBTOTAL_RE = /\bsub\s*-?\s*total\b/i;

export function slipTotal(text: string): number | null {
  const lines = text.split(/\n+/);
  const hits: number[] = [];
  for (const line of lines) {
    if (SUBTOTAL_RE.test(line)) continue;
    const m = TOTAL_RE.exec(line);
    if (m) hits.push(Number(m[1].replace(',', '.')));
  }
  if (hits.length) return Math.max(...hits);
  const sub = lines.find((l) => SUBTOTAL_RE.test(l))?.match(/(\d{1,5}[.,]\d{2})/);
  return sub ? Number(sub[1].replace(',', '.')) : null;
}

/** dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, dd.mm.yyyy → SA day number. */
export function slipDay(text: string): number | null {
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  const dmy = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(text);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3].length === 2 ? '20' + dmy[3] : dmy[3])];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Does a slip line mention this product? Slips abbreviate, so match the brand plus a size or type word. */
export function onSlip(text: string, p: Product): boolean {
  const t = text.toLowerCase();
  const brand = p.brand.toLowerCase().replace(/[^a-z]/g, '');
  const words = p.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (brand.length > 2 && !['fresh', 'butchery'].includes(brand)) {
    const flat = t.replace(/[^a-z\n]/g, '');
    return flat.includes(brand.slice(0, Math.min(6, brand.length))) || t.includes(brand.slice(0, 5));
  }
  return words.some((w) => t.includes(w.slice(0, 5)));
}

export function checkSlip(text: string, basketIds: string[], clippedIds: string[], now: number = Date.now()): SlipResult {
  const clean = text.trim();
  const issues: SlipIssue[] = [];
  const letters = (clean.match(/[a-z]/gi) ?? []).length;
  if (clean.split(/\n+/).filter((l) => l.trim().length > 2).length < 3 || letters < 15) {
    issues.push({ level: 'error', text: 'Too blurry or dark to read. Hold the slip flat, fill the screen with it and use good light.' });
    return { ok: false, retailerId: null, total: null, day: null, issues, found: [], couponsFound: [], couponsMissing: clippedIds };
  }
  const store = parseStore(clean);
  if (!store) issues.push({ level: 'error', text: 'No store name found. Include the top of the slip with the store logo or name.' });
  const total = slipTotal(clean);
  if (total === null) issues.push({ level: 'error', text: 'No total found. Include the bottom of the slip where it says TOTAL.' });
  const day = slipDay(clean);
  const today = todaySA(now);
  if (day === null) issues.push({ level: 'warning', text: 'No date found. Include the date line if you can.' });
  else if (day > today) issues.push({ level: 'error', text: `The date reads as ${formatDay(day)}, which is in the future. Re-snap so the date is sharp.` });
  else if (today - day > 3) issues.push({ level: 'error', text: `This slip is from ${formatDay(day)}, more than 3 days ago. Use today's slip.` });

  const found = basketIds.filter((id) => PRODUCT_BY_ID[id] && onSlip(clean, PRODUCT_BY_ID[id]));
  const couponsFound: string[] = [];
  const couponsMissing: string[] = [];
  for (const id of clippedIds) {
    const c = COUPONS.find((x) => x.id === id);
    if (!c?.productIds) continue;
    const hit = c.productIds.some((pid) => PRODUCT_BY_ID[pid] && onSlip(clean, PRODUCT_BY_ID[pid]));
    (hit ? couponsFound : couponsMissing).push(id);
  }
  if (couponsMissing.length) issues.push({ level: 'warning', text: `${couponsMissing.length} clipped coupon item${couponsMissing.length > 1 ? 's are' : ' is'} not on this slip.` });
  return { ok: !issues.some((i) => i.level === 'error'), retailerId: store?.id ?? null, total, day, issues, found, couponsFound, couponsMissing };
}

export function sampleSlip(now: number = Date.now()): string {
  const d = new Date(now + 2 * 3_600_000);
  const date = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  return `BOXER SUPERSTORES\nSOWETO\nTAX INVOICE\n${date} 10:42\nWHITE STAR SUPER 10KG   134.99\nSUNFOIL OIL 2L          64.99\nSELATI WHITE SUGAR 2.5  49.99\nTASTIC RICE 2KG         49.99\nRAINBOW IQF 2KG         94.99\nCLOVER F/C MILK 2L x2   73.98\nALBANY SUP WHITE x2     41.98\nPOTATOES 7KG            59.99\nSUBTOTAL               570.90\nTOTAL                  570.90\nCARD                   570.90\nTHANK YOU`;
}
