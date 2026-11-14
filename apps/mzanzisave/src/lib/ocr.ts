import { PRODUCTS, GROUP_LABELS, searchText, type Product } from '../data/products';
import { RETAILERS, type Retailer } from '../data/retailers';
import type { PackSize } from './format';

export interface ParsedTag {
  name: string;
  size: PackSize | null;
  /** Lowest price found (the special), and a higher "was" price if one is printed. */
  price: number | null;
  wasPrice: number | null;
  retailerId: string | null;
  match: Product | null;
  /** 0–1: how sure the product match is. */
  confidence: number;
}

const STORE_ALIASES: [RegExp, string][] = [
  [/\bshop\s*rite\b/i, 'shoprite'],
  [/\bcheckers\b|\bxtra\s*savings\b/i, 'checkers'],
  [/\bpick\s*n\s*pay\b|\bpnp\b|\bsmart\s*shopper\b/i, 'pnp'],
  [/\bwool\s*worths\b|\bwoolies\b/i, 'woolworths'],
  [/\bspar\b/i, 'spar'],
  [/\bmakro\b/i, 'makro'],
  [/\bboxer\b/i, 'boxer'],
  [/\bfood\s*lover'?s?\b/i, 'flm'],
  [/\bcambridge\b/i, 'cambridge'],
  [/\bok\s*(foods|minimark|grocer)\b/i, 'okfoods'],
  [/\busave\b|\bu-save\b/i, 'usave'],
  [/\brhino\b/i, 'rhino'],
  [/\bkit\s*kat\b/i, 'kitkat'],
  [/\bchoppies\b/i, 'choppies'],
  [/\broots\b/i, 'roots'],
];

/** Common OCR slips on shelf tags: O for 0, l/I for 1, S for 5 inside numbers. */
function cleanNumbers(text: string): string {
  return text
    .replace(/(?<=\d)[oO](?=\d|\b)/g, '0')
    .replace(/(?<=\d)[lI|](?=\d)/g, '1')
    .replace(/(?<=\d)S(?=\d)/g, '5');
}

export function parsePrices(text: string): number[] {
  const t = cleanNumbers(text);
  const found: number[] = [];
  // R59.99, R 59,99, R59 99 (cents printed small), R59
  const re = /R\s?(\d{1,5})(?:[.,\s](\d{2}))?(?!\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const v = Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0);
    if (v > 0) found.push(v);
  }
  if (!found.length) {
    // Bare prices like "59.99" or "59,99"
    const bare = /(?<![\d.,])(\d{1,4})[.,](\d{2})(?![\d])/g;
    while ((m = bare.exec(t))) found.push(Number(m[1]) + Number(m[2]) / 100);
  }
  return found;
}

export function parseSize(text: string): PackSize | null {
  const t = cleanNumbers(text).toLowerCase().replace(/,/g, '.');
  const multi = /(\d+)\s?[x×]\s?(\d+(?:\.\d+)?)\s?(kg|g|l|lt|ltr|litres?|ml)\b/.exec(t);
  if (multi) {
    const one = toSize(Number(multi[2]), multi[3]);
    if (one) return { ...one, qty: +(one.qty * Number(multi[1])).toFixed(3) };
  }
  const single = /(\d+(?:\.\d+)?)\s?(kg|g|l|lt|ltr|litres?|ml)\b/.exec(t);
  if (single) return toSize(Number(single[1]), single[2]);
  const count = /(\d+)\s?(s|pack|pk|bags|rolls|eggs)\b/.exec(t);
  if (count) return { qty: Number(count[1]), unit: 'each', countLabel: 'item' };
  return null;
}

function toSize(qty: number, unit: string): PackSize | null {
  if (unit === 'kg') return { qty, unit: 'kg' };
  if (unit === 'g') return { qty: qty / 1000, unit: 'kg' };
  if (unit === 'ml') return { qty: qty / 1000, unit: 'L' };
  if (unit.startsWith('l')) return { qty, unit: 'L' };
  return null;
}

export function parseStore(text: string): Retailer | null {
  for (const [re, id] of STORE_ALIASES) if (re.test(text)) return RETAILERS.find((r) => r.id === id) ?? null;
  return null;
}

const STOP = new Set(['special', 'specials', 'was', 'now', 'save', 'only', 'each', 'valid', 'until', 'price', 'xtra', 'savings', 'smart', 'shopper', 'deal', 'per', 'off', 'the', 'and', 'with', 'card', 'from', 'promo', 'rand']);

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-zÀ-ſ' ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

/** Best catalogue match by shared words, preferring the same pack size. */
export function matchProduct(text: string, size: PackSize | null): { product: Product | null; confidence: number } {
  const ws = words(text);
  if (!ws.length) return { product: null, confidence: 0 };
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of PRODUCTS) {
    const hay = searchText(p);
    let score = 0;
    for (const w of ws) {
      if (hay.includes(w)) score += w === p.brand.toLowerCase() ? 2 : 1;
      else if (w.length > 4 && hay.includes(w.slice(0, 5))) score += 0.5;
    }
    if (score === 0) continue;
    if (size && p.size.unit === size.unit) score += Math.abs(p.size.qty - size.qty) < 0.01 ? 1.5 : 0.3;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return { product: best, confidence: Math.min(1, bestScore / 5) };
}

/** The product line: the line with the most letters that isn't a store name or price. */
function productLine(text: string): string {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const scored = lines
    .filter((l) => !/^(was|now|save|valid|until|special|promo)/i.test(l))
    .filter((l) => !STORE_ALIASES.some(([re]) => re.test(l) && l.split(/\s+/).length <= 2))
    .map((l) => ({ l, s: (l.match(/[a-z]/gi) ?? []).length }))
    .sort((a, b) => b.s - a.s);
  // Brand and product often sit on two lines: join the two strongest.
  return scored.slice(0, 2).map((x) => x.l).join(' ').replace(/\s+/g, ' ').trim();
}

export function parseTag(text: string): ParsedTag {
  const prices = parsePrices(text);
  const size = parseSize(text);
  const store = parseStore(text);
  const { product, confidence } = matchProduct(text, size);
  const sorted = [...prices].sort((a, b) => a - b);
  const name = product && confidence >= 0.4 ? `${product.brand} ${product.name}` : titleCase(productLine(text)) || 'Unknown product';
  return {
    name,
    size: size ?? product?.size ?? null,
    price: sorted[0] ?? null,
    wasPrice: sorted.length > 1 && sorted[sorted.length - 1] > sorted[0] ? sorted[sorted.length - 1] : null,
    retailerId: store?.id ?? null,
    match: product,
    confidence,
  };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export const SAMPLE_TAGS: { label: string; text: string }[] = [
  { label: 'Checkers shelf tag: Sunfoil 2L', text: 'CHECKERS\nXTRA SAVINGS\nSUNFOIL\nSUNFLOWER OIL 2L\nWAS R74.99\nR64.99\nVALID UNTIL 16/11' },
  { label: 'Spaza flyer: White Star 10kg', text: "MAMA THANDI'S GROCER\nMONTH-END SPECIAL\nWhite Star Super Maize Meal\n10kg\nNOW ONLY R129 99" },
  { label: 'Boxer pamphlet: Rainbow chicken', text: 'BOXER\nRainbow IQF Chicken\nMixed Portions 2kg\nR94.99\nSave R15' },
];

export { GROUP_LABELS };

/* ---------- On-device OCR (Tesseract, loaded only when someone scans) ---------- */

type OcrWorker = { recognize: (img: Blob | string) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };
let workerPromise: Promise<OcrWorker> | null = null;
let progressSink: (p: number, status: string) => void = () => {};

/*
 * The OCR engine looks for its language model in IndexedDB (idb-keyval's "keyval-store")
 * before downloading it. We put it there ourselves from a base64 text file, because some
 * hosts won't serve or will re-encode binary .traineddata files. Downloaded once, then kept.
 */
const MODEL_KEY = './eng.traineddata';

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('keyval-store');
    open.onupgradeneeded = () => open.result.createObjectStore('keyval');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keyval', mode);
      const req = run(tx.objectStore('keyval'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    };
  });
}

async function ensureModelCached(base: string): Promise<void> {
  const have = await idb('readonly', (st) => st.count(MODEL_KEY));
  if (have) return;
  progressSink(0, 'downloading the reader');
  const res = await fetch(base + 'eng-model.b64.txt');
  if (!res.ok) throw new Error(`OCR model ${res.status}`);
  const bin = atob((await res.text()).trim());
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  await idb('readwrite', (st) => st.put(data, MODEL_KEY));
}

/** Base URL of the OCR engine files published next to the app. */
function ocrBase(): string {
  return new URL('./ocr/', document.baseURI).href;
}

export async function recognise(image: Blob, onProgress: (p: number, status: string) => void): Promise<string> {
  progressSink = onProgress;
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = ocrBase();
      await ensureModelCached(base);
      const worker = await createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => progressSink(m.progress, m.status),
      });
      return worker as unknown as OcrWorker;
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  const worker = await workerPromise;
  onProgress(0, 'preparing photo');
  const prepared = await prepareImage(image);
  const { data } = await worker.recognize(prepared);
  return data.text;
}

/**
 * OCR needs letters roughly 20–40 px tall. Phone photos are huge and screenshots tiny,
 * so scale the longest side to about 2000 px, then convert to high-contrast greyscale.
 */
async function prepareImage(image: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(image);
    const target = 2000;
    const scale = Math.min(4, target / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return image;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h);
    const d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const c = Math.max(0, Math.min(255, (g - 128) * 1.4 + 128));
      d[i] = d[i + 1] = d[i + 2] = c;
    }
    ctx.putImageData(px, 0, 0);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? image), 'image/png'));
  } catch {
    return image;
  }
}
