import type { NearbyBranch } from '../data/branches';
import { PRODUCT_BY_ID, productsInGroup, getOffer, priceOf, type Offer } from '../data/prices';

export interface BasketItem {
  productId: string;
  qty: number;
}

export interface Line {
  productId: string;
  qty: number;
  /** The offer used: the same product, or a same-size swap when the store doesn't stock it. */
  offer: Offer | null;
  substitute: boolean;
  total: number;
}

export interface StorePlan {
  branch: NearbyBranch;
  lines: Line[];
  total: number;
  missing: number;
  substitutes: number;
}

export interface SplitPlan {
  a: StorePlan;
  b: StorePlan;
  /** Which store each item comes from. */
  lines: (Line & { branch: NearbyBranch })[];
  total: number;
  missing: number;
  /** Saving against the cheapest single store, before travel. */
  grossSaving: number;
  /** Saving after the extra stop's travel / taxi cost. */
  netSaving: number;
  worthIt: boolean;
}

/** Nearest branch of each chain (chains share prices), plus every independent grocer. */
export function distinctStores(branches: NearbyBranch[]): NearbyBranch[] {
  const seen = new Set<string>();
  const out: NearbyBranch[] = [];
  for (const b of [...branches].sort((x, y) => x.distanceKm - y.distanceKm)) {
    if (seen.has(b.priceScope)) continue;
    seen.add(b.priceScope);
    out.push(b);
  }
  return out;
}

function lineFor(item: BasketItem, branch: NearbyBranch, today: number): Line {
  const p = PRODUCT_BY_ID[item.productId];
  if (!p) return { ...item, offer: null, substitute: false, total: 0 };
  const exact = getOffer(p, branch, today);
  if (exact) return { ...item, offer: exact, substitute: false, total: priceOf(exact) * item.qty };
  // Same group, same unit, within 10% of the pack size: a fair like-for-like swap.
  let best: Offer | null = null;
  for (const alt of productsInGroup(p.group)) {
    if (alt.id === p.id || alt.size.unit !== p.size.unit) continue;
    if (Math.abs(alt.size.qty - p.size.qty) / p.size.qty > 0.1) continue;
    const o = getOffer(alt, branch, today);
    if (o && (!best || priceOf(o) < priceOf(best))) best = o;
  }
  if (best) return { ...item, offer: best, substitute: true, total: priceOf(best) * item.qty };
  return { ...item, offer: null, substitute: false, total: 0 };
}

const round = (x: number) => Math.round(x * 100) / 100;

export function planFor(items: BasketItem[], branch: NearbyBranch, today: number): StorePlan {
  const lines = items.map((i) => lineFor(i, branch, today));
  return {
    branch,
    lines,
    total: round(lines.reduce((s, l) => s + l.total, 0)),
    missing: lines.filter((l) => !l.offer).length,
    substitutes: lines.filter((l) => l.substitute).length,
  };
}

/** Mode A: whole basket at each store. Complete baskets first, cheapest first. */
export function rankSingleStores(items: BasketItem[], branches: NearbyBranch[], today: number): StorePlan[] {
  if (!items.length) return [];
  return distinctStores(branches)
    .map((b) => planFor(items, b, today))
    .filter((p) => p.missing < items.length)
    .sort((x, y) => x.missing - y.missing || x.total - y.total);
}

/**
 * Mode B: best split of the basket across two stores. Each item goes to whichever of the
 * pair sells it cheaper. A split is only "worth it" when the saving beats the extra
 * travel / taxi cost of the second stop.
 */
export function bestSplit(items: BasketItem[], singles: StorePlan[], travelCost: number, maxStores = 14): SplitPlan | null {
  if (items.length < 2 || singles.length < 2) return null;
  const baseline = singles[0];
  const pool = singles.slice(0, maxStores);
  let best: SplitPlan | null = null;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      const lines = items.map((_, k) => {
        const la = a.lines[k];
        const lb = b.lines[k];
        const useB = !!lb.offer && (!la.offer || lb.total < la.total);
        return useB ? { ...lb, branch: b.branch } : { ...la, branch: a.branch };
      });
      const missing = lines.filter((l) => !l.offer).length;
      if (missing > baseline.missing) continue;
      // Both stores must actually be used.
      if (!lines.some((l) => l.branch === a.branch) || !lines.some((l) => l.branch === b.branch)) continue;
      const total = round(lines.reduce((s, l) => s + l.total, 0));
      if (!best || missing < best.missing || (missing === best.missing && total < best.total)) {
        const grossSaving = round(baseline.total - total);
        const netSaving = round(grossSaving - travelCost);
        best = { a, b, lines, total, missing, grossSaving, netSaving, worthIt: netSaving > 0 };
      }
    }
  }
  return best;
}

/** Average total across stores that stock the whole basket, used to log "saved vs area average". */
export function areaAverage(singles: StorePlan[]): number | null {
  const complete = singles.filter((s) => s.missing === 0);
  if (!complete.length) return null;
  return round(complete.reduce((s, p) => s + p.total, 0) / complete.length);
}
