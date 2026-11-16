import { afterEach, describe, expect, it } from 'vitest';
import { finalFor, rankByFinal, bestSplitFinal, tripCost, unitPaid, type PriceContext } from './final';
import { nearbyBranches, BRANCHES } from '../data/branches';
import { findSuburb } from '../data/locations';
import { getOffer } from '../data/prices';
import { PRODUCT_BY_ID } from '../data/products';
import { setPriceReports } from './reports';
import { setStockFlags } from './stock';
import { planFor } from './basket';

const NOW = Date.UTC(2026, 10, 16, 8, 0);
const TODAY = Math.floor((NOW + 7_200_000) / 86_400_000);
const soweto = findSuburb('jhb', 'soweto');
const area = { cityId: 'jhb', suburbId: 'soweto', radiusKm: 15, nearTaxi: false, inMall: false, openNow: false };
const ctx = (over: Partial<PriceContext> = {}): PriceContext => ({
  today: TODAY, cards: new Set(), coupons: new Set(), travel: { mode: 'walk', perKm: 4.25, taxiFare: 20 }, home: { lat: soweto.lat, lng: soweto.lng }, ...over,
});
const items = ['whitestar-10', 'sunfoil-2', 'selati-2.5', 'tastic-2', 'rainbow-iqf-2', 'clover-fc-2', 'albany-white', 'potatoes-7'].map((productId) => ({ productId, qty: 1 }));

afterEach(() => {
  setPriceReports([]);
  setStockFlags([]);
});

describe('real final price', () => {
  it('adds up: shelf − specials − loyalty − coupons + trip', () => {
    const r = rankByFinal(items, nearbyBranches(area, NOW), ctx({ travel: { mode: 'car', perKm: 4.25, taxiFare: 20 } }));
    for (const { price } of r) {
      expect(price.till).toBeCloseTo(price.shelf - price.specials - price.loyalty - price.couponTotal, 2);
      expect(price.final).toBeCloseTo(price.till + price.trip, 2);
    }
    const complete = r.filter((x) => x.price.missing === 0);
    for (let i = 1; i < complete.length; i++) expect(complete[i].price.final).toBeGreaterThanOrEqual(complete[i - 1].price.final);
  });

  it('only gives card-only prices to shoppers with that card', () => {
    const shoprite = BRANCHES.find((b) => b.retailerId === 'checkers')!;
    setPriceReports([{ id: 'x', at: NOW, productId: 'sunfoil-2', scope: 'checkers', branchId: shoprite.id, price: 60, source: 'you' }], NOW);
    const o = getOffer(PRODUCT_BY_ID['sunfoil-2'], shoprite, TODAY)!;
    const fake = { ...o, special: 50, regular: 70, loyalty: 'Xtra Savings' };
    expect(unitPaid(fake, ctx())).toBe(70);
    expect(unitPaid(fake, ctx({ cards: new Set(['xtra']) }))).toBe(50);
    const without = finalFor([{ productId: 'sunfoil-2', qty: 1, offer: fake, substitute: false, total: 50, branch: { ...shoprite, distanceKm: 1 } }], [], ctx());
    expect(without.loyalty).toBe(0);
    expect(without.loyaltyMissed).toEqual([{ programme: 'xtra', amount: 20 }]);
  });

  it('applies clipped coupons only when their rules are met', () => {
    const b = nearbyBranches(area, NOW).find((x) => getOffer(PRODUCT_BY_ID['luckystar-400'], x, TODAY))!;
    const one = planFor([{ productId: 'luckystar-400', qty: 1 }], b, TODAY);
    const two = planFor([{ productId: 'luckystar-400', qty: 2 }], b, TODAY);
    const c = ctx({ coupons: new Set(['c-luckystar']) });
    expect(finalFor(one.lines.map((l) => ({ ...l, branch: b })), [b], c).couponTotal).toBe(0);
    expect(finalFor(two.lines.map((l) => ({ ...l, branch: b })), [b], c).couponTotal).toBe(8);
  });

  it('charges trips by mode: walking free, taxis free under 1.5 km, cars per km', () => {
    const home = { lat: soweto.lat, lng: soweto.lng };
    const far = { lat: soweto.lat + 0.05, lng: soweto.lng };
    expect(tripCost([far], ctx()).cost).toBe(0);
    expect(tripCost([far], ctx({ travel: { mode: 'taxi', perKm: 4, taxiFare: 20 } })).cost).toBe(40);
    expect(tripCost([home], ctx({ travel: { mode: 'taxi', perKm: 4, taxiFare: 20 } })).cost).toBe(0);
    const car = tripCost([far], ctx({ travel: { mode: 'car', perKm: 4, taxiFare: 20 } }));
    expect(car.cost).toBeCloseTo(car.km * 4, 1);
  });

  it('recommends a second stop only when it clearly pays after travel', () => {
    const branches = nearbyBranches(area, NOW);
    const free = bestSplitFinal(items, rankByFinal(items, branches, ctx()), ctx());
    const pricey = ctx({ travel: { mode: 'taxi', perKm: 4, taxiFare: 500 } });
    const costly = bestSplitFinal(items, rankByFinal(items, branches, pricey), pricey);
    expect(costly?.worthIt).toBe(false);
    if (free?.worthIt) expect(free.netSaving).toBeGreaterThan(10);
  });

  it('treats items reported out of stock as unavailable', () => {
    const b = nearbyBranches(area, NOW).find((x) => x.retailerId === 'boxer')!;
    const before = planFor([{ productId: 'whitestar-10', qty: 1 }], b, TODAY);
    expect(before.lines[0].offer?.product.id).toBe('whitestar-10');
    setStockFlags([{ id: 'f', at: NOW, productId: 'whitestar-10', scope: b.priceScope, branchId: b.id }], NOW);
    const after = planFor([{ productId: 'whitestar-10', qty: 1 }], b, TODAY);
    expect(after.lines[0].offer?.product.id).not.toBe('whitestar-10');
    setStockFlags([{ id: 'f', at: NOW - 4 * 86_400_000, productId: 'whitestar-10', scope: b.priceScope, branchId: b.id }], NOW);
    expect(planFor([{ productId: 'whitestar-10', qty: 1 }], b, TODAY).lines[0].offer?.product.id).toBe('whitestar-10');
  });
});
