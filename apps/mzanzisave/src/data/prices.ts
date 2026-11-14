import { RETAILER_BY_ID } from './retailers';
import { PRODUCTS, PRODUCT_BY_ID, type Product } from './products';
import type { Branch } from './branches';
import { between, hash } from '../lib/random';
import { unitPrice } from '../lib/format';

export interface Offer {
  product: Product;
  branch: Branch;
  regular: number;
  /** Special price, when on promotion today. */
  special?: number;
  /** SA day numbers, inclusive. Only set on specials. */
  validFrom?: number;
  validTo?: number;
  /** Loyalty card needed for the special, e.g. "Xtra Savings". */
  loyalty?: string;
}

export const priceOf = (o: Offer) => o.special ?? o.regular;
export const unitOf = (o: Offer) => unitPrice(priceOf(o), o.product.size);

/** Shelf prices end in .99 (or .49 under R20), like South African shelf tags. */
export function shelfPrice(x: number): number {
  if (x < 20) return Math.max(0.99, Math.ceil(x * 2) / 2 - 0.01);
  return Math.ceil(x) - 0.01;
}

export function carries(branch: Branch, p: Product): boolean {
  const r = RETAILER_BY_ID[branch.retailerId];
  if (p.onlyAt) return p.onlyAt.includes(r.id);
  const coverage = r.range[p.category];
  if (!coverage) return false;
  // Bulk packs sit mostly in wholesalers; tiny corner shops rarely stock them.
  const bulky = p.size.unit !== 'each' && p.size.qty >= 10;
  const adj = r.tier === 'independent' && bulky ? coverage * 0.5 : coverage;
  return hash(`carry|${branch.priceScope}|${p.id}`) < adj;
}

const cache = new Map<string, Offer | null>();

/**
 * Today's price for a product at a branch. Specials run in promo cycles of 7 or 14 days,
 * so a deal keeps the same dates every time it is looked at, and new deals roll in daily.
 */
export function getOffer(p: Product, branch: Branch, today: number): Offer | null {
  const key = `${branch.priceScope}|${branch.id}|${p.id}|${today}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let offer: Offer | null = null;
  if (carries(branch, p)) {
    const r = RETAILER_BY_ID[branch.retailerId];
    const scope = branch.priceScope;
    const level = r.priceLevel * (r.categoryLevel?.[p.category] ?? 1);
    const regular = shelfPrice(p.base * level * between(`reg|${scope}|${p.id}`, 0.95, 1.06));
    offer = { product: p, branch, regular };

    const len = hash(`len|${scope}|${p.id}`) < 0.6 ? 7 : 14;
    const phase = Math.floor(hash(`ph|${scope}|${p.id}`) * len);
    const cycle = Math.floor((today + phase) / len);
    const start = cycle * len - phase;
    const end = start + len - 1 - Math.floor(hash(`cut|${scope}|${p.id}|${cycle}`) * 3);
    const onSpecial = hash(`sp|${scope}|${p.id}|${cycle}`) < r.specialRate && today <= end;
    if (onSpecial) {
      const discount = between(`d|${scope}|${p.id}|${cycle}`, 0.08, 0.3);
      const special = shelfPrice(regular * (1 - discount));
      if (special < regular - 0.5) {
        offer.special = special;
        offer.validFrom = start;
        offer.validTo = end;
        if (r.loyalty && hash(`loy|${scope}|${p.id}|${cycle}`) < 0.35) offer.loyalty = r.loyalty;
      }
    }
  }
  if (cache.size > 20000) cache.clear();
  cache.set(key, offer);
  return offer;
}

/** Every offer for a product across a set of branches, cheapest per unit first. */
export function offersFor(p: Product, branches: Branch[], today: number): Offer[] {
  return branches
    .map((b) => getOffer(p, b, today))
    .filter((o): o is Offer => !!o)
    .sort((a, b) => priceOf(a) - priceOf(b));
}

/** Every special across a set of branches. */
export function specialsIn(branches: Branch[], today: number): Offer[] {
  const out: Offer[] = [];
  for (const b of branches) {
    for (const p of PRODUCTS) {
      const o = getOffer(p, b, today);
      if (o?.special !== undefined) out.push(o);
    }
  }
  return out;
}

/** Cheapest offer per unit (kg / L / item) for each product group in a list. */
export function bestValueIds(offers: Offer[]): Set<Offer> {
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const k = `${o.product.group}|${o.product.size.unit}`;
    const cur = best.get(k);
    if (!cur || unitOf(o) < unitOf(cur)) best.set(k, o);
  }
  return new Set(best.values());
}

export function productsInGroup(group: string): Product[] {
  return PRODUCTS.filter((p) => p.group === group);
}

export { PRODUCT_BY_ID };
