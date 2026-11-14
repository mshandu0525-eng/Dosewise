import { hash } from '../lib/random';
import { dayToDate } from '../lib/date';

export type CouponKind = 'manufacturer' | 'store' | 'combo';

export interface ComboItem {
  productId: string;
  qty: number;
}

export interface Coupon {
  id: string;
  kind: CouponKind;
  title: string;
  detail: string;
  /** Rand value of the saving (for combos: regular total minus combo price). */
  value: number;
  /** Retailers where it can be used; empty = any participating store. */
  retailerIds: string[];
  productIds?: string[];
  minSpend?: number;
  combo?: { items: ComboItem[]; price: number; regular: number };
  /** Bulk combos that suit stokvels and group buys. */
  stokvel?: boolean;
  /** Valid until: days from today, or "month-end". */
  ends: number | 'month-end';
  terms: string;
}

export const COUPONS: Coupon[] = [
  // Manufacturer coupons
  { id: 'c-whitestar', kind: 'manufacturer', title: 'R15 off White Star Super 5kg', detail: 'White Star Super Maize Meal 5kg', value: 15, retailerIds: [], productIds: ['whitestar-5'], ends: 'month-end', terms: 'One per transaction. Any participating store.' },
  { id: 'c-sunfoil', kind: 'manufacturer', title: 'R12 off Sunfoil 2L', detail: 'Sunfoil Sunflower Oil 2L', value: 12, retailerIds: [], productIds: ['sunfoil-2'], ends: 9, terms: 'One per transaction.' },
  { id: 'c-pampers', kind: 'manufacturer', title: 'R30 off Pampers Baby-Dry', detail: 'Any Pampers Baby-Dry jumbo pack', value: 30, retailerIds: [], productIds: ['pampers-4'], ends: 'month-end', terms: 'Jumbo packs only. One per transaction.' },
  { id: 'c-joko', kind: 'manufacturer', title: 'R10 off Joko 100s', detail: 'Joko Tagless Tea Bags 100s', value: 10, retailerIds: [], productIds: ['joko-100'], ends: 5, terms: 'One per transaction.' },
  { id: 'c-omo', kind: 'manufacturer', title: 'R25 off OMO Auto 2kg', detail: 'OMO Auto Washing Powder 2kg', value: 25, retailerIds: [], productIds: ['omo-2'], ends: 1, terms: 'One per transaction.' },
  { id: 'c-luckystar', kind: 'manufacturer', title: 'R8 off 2 x Lucky Star 400g', detail: 'Buy any 2 Lucky Star 400g cans', value: 8, retailerIds: [], productIds: ['luckystar-400'], ends: 12, terms: 'Buy 2. One per transaction.' },
  { id: 'c-tastic', kind: 'manufacturer', title: 'R15 off Tastic 5kg', detail: 'Tastic Long Grain Parboiled Rice 5kg', value: 15, retailerIds: [], productIds: ['tastic-5'], ends: 0, terms: 'One per transaction.' },
  // Store vouchers
  { id: 's-shoprite', kind: 'store', title: 'R30 off a R400 shop', detail: 'Shoprite, with your Xtra Savings card', value: 30, retailerIds: ['shoprite'], minSpend: 400, ends: 6, terms: 'Swipe Xtra Savings first. Excludes airtime and tobacco.' },
  { id: 's-checkers', kind: 'store', title: 'R50 off a R600 shop', detail: 'Checkers & Checkers Hyper', value: 50, retailerIds: ['checkers'], minSpend: 600, ends: 'month-end', terms: 'Once per customer. Xtra Savings members.' },
  { id: 's-pnp', kind: 'store', title: '10% off fresh produce (max R40)', detail: 'Pick n Pay, with Smart Shopper', value: 40, retailerIds: ['pnp'], ends: 3, terms: 'Swipe Smart Shopper. Max discount R40.' },
  { id: 's-boxer', kind: 'store', title: 'R25 off a R350 shop', detail: 'Boxer, all stores', value: 25, retailerIds: ['boxer'], minSpend: 350, ends: 1, terms: 'One per till slip.' },
  { id: 's-usave', kind: 'store', title: 'R15 off a R200 shop', detail: 'Usave', value: 15, retailerIds: ['usave'], minSpend: 200, ends: 8, terms: 'One per till slip.' },
  { id: 's-spar', kind: 'store', title: 'R20 off a R300 shop', detail: 'SPAR & SUPERSPAR, SPAR Rewards members', value: 20, retailerIds: ['spar'], minSpend: 300, ends: 4, terms: 'Swipe SPAR Rewards.' },
  { id: 's-kitkat', kind: 'store', title: 'R100 off a R2 000 bulk shop', detail: 'Kit Kat Cash & Carry', value: 100, retailerIds: ['kitkat'], minSpend: 2000, ends: 'month-end', terms: 'Bulk lines only.' },
  { id: 's-cambridge', kind: 'store', title: 'R20 off bread & milk combo', detail: 'Cambridge Food: 2 loaves + 2L milk', value: 20, retailerIds: ['cambridge'], ends: 2, terms: 'Any 2 loaves and any 2L fresh milk.' },
  { id: 's-roots', kind: 'store', title: 'R40 off R500 of meat', detail: 'Roots Butchery', value: 40, retailerIds: ['roots'], minSpend: 500, ends: 0, terms: 'Butchery counter only.' },
  // Combo & stokvel bulk deals
  {
    id: 'k-stokvel-staples', kind: 'combo', stokvel: true, title: 'Stokvel Staples Hamper', detail: '4 x 10kg rice, 4 x 5L oil, 4 x 10kg maize meal', value: 0, retailerIds: ['makro'], ends: 'month-end', terms: 'Collect in store. Bulk counter.',
    combo: { items: [{ productId: 'spekko-10', qty: 4 }, { productId: 'sunfoil-5', qty: 4 }, { productId: 'whitestar-10', qty: 4 }], price: 1849.0, regular: 0 },
  },
  {
    id: 'k-month-end', kind: 'combo', stokvel: true, title: 'Month-End Family Combo', detail: '10kg maize, 10kg sugar, 5L oil, 10kg flour', value: 0, retailerIds: ['boxer'], ends: 3, terms: 'While stocks last.',
    combo: { items: [{ productId: 'iwisa-10', qty: 1 }, { productId: 'huletts-10', qty: 1 }, { productId: 'sunfoil-5', qty: 1 }, { productId: 'goldencloud-10', qty: 1 }], price: 579.99, regular: 0 },
  },
  {
    id: 'k-meat', kind: 'combo', stokvel: true, title: 'Festive Stokvel Meat Hamper', detail: '5kg chicken, 3kg wors, 3kg stewing, 2kg mince', value: 0, retailerIds: ['roots'], ends: 10, terms: 'Order 48 hours ahead for groups of 6+.',
    combo: { items: [{ productId: 'chicken-5', qty: 1 }, { productId: 'wors-1', qty: 3 }, { productId: 'stew-1', qty: 3 }, { productId: 'mince-1', qty: 2 }], price: 879.0, regular: 0 },
  },
  {
    id: 'k-rice-oil', kind: 'combo', stokvel: true, title: 'Rice & Oil Bulk Bundle', detail: '4 x 10kg Spekko rice, 4 x 5L Sunfoil', value: 0, retailerIds: ['kitkat', 'rhino'], ends: 6, terms: 'Cash & carry members.',
    combo: { items: [{ productId: 'spekko-10', qty: 4 }, { productId: 'sunfoil-5', qty: 4 }], price: 1249.0, regular: 0 },
  },
  {
    id: 'k-school', kind: 'combo', title: 'Lunchbox Week Combo', detail: '2 loaves, 2L milk, 400g pilchards, 18 eggs', value: 0, retailerIds: ['shoprite', 'usave'], ends: 2, terms: 'Xtra Savings members.',
    combo: { items: [{ productId: 'albany-white', qty: 2 }, { productId: 'clover-fc-2', qty: 1 }, { productId: 'luckystar-400', qty: 1 }, { productId: 'eggs-18', qty: 1 }], price: 149.99, regular: 0 },
  },
];

export function couponEnd(c: Coupon, today: number): number {
  if (c.ends !== 'month-end') return today + c.ends;
  const d = dayToDate(today);
  const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  return Math.floor(last / 86_400_000);
}

/** Per-device codes, stable for a coupon. Sample codes: tills will not accept them. */
export function couponCodes(couponId: string, deviceId: string) {
  const digits = (salt: string, len: number) =>
    Array.from({ length: len }, (_, i) => Math.floor(hash(`${couponId}|${deviceId}|${salt}|${i}`) * 10)).join('');
  return { barcode: `MZS${digits('bc', 10)}`, promo: digits('promo', 6) };
}
