/**
 * The real final price of a basket: shelf price, minus specials, minus loyalty-card prices
 * (only for cards the shopper has saved), minus clipped coupons that apply, plus the trip.
 */
import type { NearbyBranch } from '../data/branches';
import { distanceKm } from '../data/locations';
import { RETAILER_BY_ID } from '../data/retailers';
import { PRODUCT_BY_ID } from '../data/products';
import { COUPONS, couponEnd, type Coupon } from '../data/coupons';
import type { Offer } from '../data/prices';
import type { BasketItem, Line, StorePlan } from './basket';
import { distinctStores, rankSingleStores } from './basket';

export type TravelMode = 'car' | 'taxi' | 'walk';

export interface TravelSettings {
  mode: TravelMode;
  /** Car running cost per km (fuel and wear). */
  perKm: number;
  /** Taxi fare per one-way trip. */
  taxiFare: number;
}

/** Loyalty programme id (as saved in the card wallet) → retailers that honour it. */
export const PROGRAMME_RETAILERS: Record<string, string[]> = {
  xtra: ['shoprite', 'checkers', 'usave'],
  smart: ['pnp'],
  wrewards: ['woolworths'],
  spar: ['spar'],
  mcard: ['makro'],
};

export const PROGRAMME_NAMES: Record<string, string> = {
  xtra: 'Xtra Savings', smart: 'Smart Shopper', wrewards: 'WRewards', spar: 'SPAR Rewards', mcard: 'Makro mCard',
};

export function programmeFor(retailerId: string): string | undefined {
  return Object.keys(PROGRAMME_RETAILERS).find((k) => PROGRAMME_RETAILERS[k].includes(retailerId));
}

export interface PriceContext {
  today: number;
  /** Loyalty programmes the shopper has a card for. */
  cards: Set<string>;
  /** Clipped, unused coupon ids. */
  coupons: Set<string>;
  travel: TravelSettings;
  /** Where the shopper starts (suburb centre). */
  home: { lat: number; lng: number };
}

export interface AppliedCoupon {
  coupon: Coupon;
  amount: number;
}

export interface FinalPrice {
  /** Everything at the normal shelf price. */
  shelf: number;
  /** Specials anyone gets. */
  specials: number;
  /** Card-only prices the shopper's saved cards unlock. */
  loyalty: number;
  /** Card-only savings missed because the card isn't in the wallet, per programme. */
  loyaltyMissed: { programme: string; amount: number }[];
  coupons: AppliedCoupon[];
  couponTotal: number;
  /** Round-trip travel cost. */
  trip: number;
  tripKm: number;
  /** What the shopper actually pays at the till(s), before travel. */
  till: number;
  /** Till total plus travel: the number stores are ranked by. */
  final: number;
  missing: number;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** Price paid for one unit, honouring card-only specials only if the shopper has the card. */
export function unitPaid(o: Offer, ctx: PriceContext): number {
  if (o.special === undefined) return o.regular;
  if (!o.loyalty) return o.special;
  const prog = programmeFor(o.branch.retailerId);
  return prog && ctx.cards.has(prog) ? o.special : o.regular;
}

/** Cost of getting there and back. Walking is free; taxis are free under 1.5 km (you'd walk). */
export function tripCost(stops: { lat: number; lng: number }[], ctx: PriceContext): { cost: number; km: number } {
  const path = [ctx.home, ...stops, ctx.home];
  let km = 0;
  let legs = 0;
  for (let i = 1; i < path.length; i++) {
    const d = distanceKm(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng);
    km += d;
    if (d > 1.5) legs++;
  }
  // Roads wind: add 30% to straight-line distance.
  const roadKm = km * 1.3;
  const cost = ctx.travel.mode === 'car' ? roadKm * ctx.travel.perKm : ctx.travel.mode === 'taxi' ? legs * ctx.travel.taxiFare : 0;
  return { cost: round(cost), km: round(roadKm) };
}

type PlacedLine = Line & { branch: NearbyBranch };

function couponsFor(lines: PlacedLine[], ctx: PriceContext): AppliedCoupon[] {
  const out: AppliedCoupon[] = [];
  for (const c of COUPONS) {
    if (!ctx.coupons.has(c.id) || c.kind === 'combo' || couponEnd(c, ctx.today) < ctx.today) continue;
    if (c.kind === 'manufacturer' && c.productIds) {
      const qty = lines.filter((l) => l.offer && !l.substitute && c.productIds!.includes(l.productId)).reduce((s, l) => s + l.qty, 0);
      if (qty >= (c.minQty ?? 1)) out.push({ coupon: c, amount: c.value });
      continue;
    }
    if (c.kind === 'store') {
      // Store vouchers apply once, at the first store in the plan where the rules are met.
      for (const b of distinctStores(lines.map((l) => l.branch))) {
        if (!c.retailerIds.includes(b.retailerId)) continue;
        const here = lines.filter((l) => l.offer && l.branch === b);
        const spent = (cat?: string) => here.filter((l) => !cat || PRODUCT_BY_ID[l.productId]?.category === cat).reduce((s, l) => s + unitPaid(l.offer!, ctx) * l.qty, 0);
        let amount = 0;
        if (c.pctOf) amount = Math.min(c.value, spent(c.pctOf.category) * c.pctOf.pct);
        else if (c.needs) {
          const ok = c.needs.every((n) => here.filter((l) => PRODUCT_BY_ID[l.productId]?.group === n.group).reduce((s, l) => s + l.qty, 0) >= n.qty);
          amount = ok ? c.value : 0;
        } else if (spent(c.spendCategory) >= (c.minSpend ?? 0)) amount = c.value;
        if (amount > 0) {
          out.push({ coupon: c, amount: round(amount) });
          break;
        }
      }
    }
  }
  return out;
}

/** Final price for lines that may come from one or more stores. */
export function finalFor(lines: PlacedLine[], stops: NearbyBranch[], ctx: PriceContext): FinalPrice {
  let shelf = 0;
  let specials = 0;
  let loyalty = 0;
  const missed = new Map<string, number>();
  for (const l of lines) {
    if (!l.offer) continue;
    const o = l.offer;
    shelf += o.regular * l.qty;
    if (o.special === undefined) continue;
    const saving = (o.regular - o.special) * l.qty;
    if (!o.loyalty) specials += saving;
    else {
      const prog = programmeFor(o.branch.retailerId);
      if (prog && ctx.cards.has(prog)) loyalty += saving;
      else if (prog) missed.set(prog, (missed.get(prog) ?? 0) + saving);
    }
  }
  const coupons = couponsFor(lines, ctx);
  const couponTotal = round(coupons.reduce((s, c) => s + c.amount, 0));
  const t = tripCost(stops, ctx);
  const till = round(shelf - specials - loyalty - couponTotal);
  return {
    shelf: round(shelf),
    specials: round(specials),
    loyalty: round(loyalty),
    loyaltyMissed: [...missed].map(([programme, amount]) => ({ programme, amount: round(amount) })),
    coupons,
    couponTotal,
    trip: t.cost,
    tripKm: t.km,
    till,
    final: round(till + t.cost),
    missing: lines.filter((l) => !l.offer).length,
  };
}

export interface RankedStore {
  plan: StorePlan;
  price: FinalPrice;
}

/** One-stop shop at each store, complete baskets first, then by final price (incl. trip). */
export function rankByFinal(items: BasketItem[], branches: NearbyBranch[], ctx: PriceContext): RankedStore[] {
  return rankSingleStores(items, branches, ctx.today)
    .map((plan) => ({ plan, price: finalFor(plan.lines.map((l) => ({ ...l, branch: plan.branch })), [plan.branch], ctx) }))
    .sort((a, b) => a.price.missing - b.price.missing || a.price.final - b.price.final);
}

export interface SplitResult {
  a: NearbyBranch;
  b: NearbyBranch;
  lines: PlacedLine[];
  price: FinalPrice;
  /** Saving against the best single store, after all discounts and travel. */
  netSaving: number;
  /** Only recommend a second stop when it clearly pays: over R10 and over 1% of the basket. */
  worthIt: boolean;
}

/** Best two-store split by final price, including the longer trip. */
export function bestSplitFinal(items: BasketItem[], ranked: RankedStore[], ctx: PriceContext, maxStores = 12): SplitResult | null {
  if (items.length < 2 || ranked.length < 2) return null;
  const base = ranked[0];
  const pool = ranked.slice(0, maxStores);
  let best: SplitResult | null = null;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i].plan;
      const B = pool[j].plan;
      const lines: PlacedLine[] = items.map((_, k) => {
        const la = A.lines[k];
        const lb = B.lines[k];
        const pa = la.offer ? unitPaid(la.offer, ctx) * la.qty : Infinity;
        const pb = lb.offer ? unitPaid(lb.offer, ctx) * lb.qty : Infinity;
        return pb < pa ? { ...lb, branch: B.branch } : { ...la, branch: A.branch };
      });
      if (!lines.some((l) => l.branch === A.branch) || !lines.some((l) => l.branch === B.branch)) continue;
      const missing = lines.filter((l) => !l.offer).length;
      if (missing > base.price.missing) continue;
      // Visit the nearer store first.
      const stops = A.branch.distanceKm <= B.branch.distanceKm ? [A.branch, B.branch] : [B.branch, A.branch];
      const price = finalFor(lines, stops, ctx);
      if (!best || price.missing < best.price.missing || (price.missing === best.price.missing && price.final < best.price.final)) {
        const netSaving = round(base.price.final - price.final);
        best = { a: A.branch, b: B.branch, lines, price, netSaving, worthIt: price.missing <= base.price.missing && netSaving > Math.max(10, base.price.till * 0.01) };
      }
    }
  }
  return best;
}

export function travelLabel(t: TravelSettings): string {
  if (t.mode === 'car') return `car at R${t.perKm.toFixed(2)}/km`;
  if (t.mode === 'taxi') return `taxi at R${t.taxiFare} a trip`;
  return 'walking';
}

export { RETAILER_BY_ID };
