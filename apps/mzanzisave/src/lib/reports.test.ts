import { afterEach, describe, expect, it } from 'vitest';
import { setPriceReports, type PriceReport } from './reports';
import { getOffer, priceOf } from '../data/prices';
import { BRANCHES, nearbyBranches } from '../data/branches';
import { PRODUCT_BY_ID } from '../data/products';
import { rankSingleStores } from './basket';

const NOW = Date.UTC(2026, 10, 14, 10, 0);
const TODAY = Math.floor((NOW + 7_200_000) / 86_400_000);
const DAY = 86_400_000;
const report = (over: Partial<PriceReport>): PriceReport => ({
  id: 'r1', at: NOW, productId: 'sunfoil-2', scope: 'checkers', branchId: BRANCHES.find((b) => b.retailerId === 'checkers')!.id, price: 59.99, source: 'you', ...over,
});

afterEach(() => setPriceReports([]));

describe('real price reports', () => {
  const checkers = BRANCHES.filter((b) => b.retailerId === 'checkers');
  const p = PRODUCT_BY_ID['sunfoil-2'];

  it('replace the sample price at every branch of the chain', () => {
    setPriceReports([report({})], NOW);
    for (const b of checkers.slice(0, 5)) {
      const o = getOffer(p, b, TODAY)!;
      expect(priceOf(o)).toBe(59.99);
      expect(o.reported?.source).toBe('you');
      expect(o.special).toBeUndefined();
    }
  });

  it('with a was-price become a special until the given day', () => {
    setPriceReports([report({ price: 54.99, wasPrice: 74.99, validTo: TODAY + 2 })], NOW);
    const o = getOffer(p, checkers[0], TODAY)!;
    expect(o.special).toBe(54.99);
    expect(o.regular).toBe(74.99);
    expect(o.validTo).toBe(TODAY + 2);
    expect(getOffer(p, checkers[0], TODAY + 3)?.reported).toBeUndefined();
  });

  it('expire after 14 days and newer reports win', () => {
    setPriceReports([report({ at: NOW - 15 * DAY })], NOW);
    expect(getOffer(p, checkers[0], TODAY)?.reported).toBeUndefined();
    setPriceReports([report({ id: 'old', at: NOW - DAY, price: 70 }), report({ id: 'new', at: NOW, price: 61.99 })], NOW);
    expect(priceOf(getOffer(p, checkers[0], TODAY)!)).toBe(61.99);
  });

  it('a store owner beats a shopper report from the same day', () => {
    setPriceReports([report({ id: 'shop', at: NOW, price: 58 }), report({ id: 'own', at: NOW - 3_600_000, price: 62, source: 'store' })], NOW);
    expect(getOffer(p, checkers[0], TODAY)!.reported?.source).toBe('store');
  });

  it('independent grocer reports only affect that shop', () => {
    const locals = BRANCHES.filter((b) => b.retailerId === 'local').slice(0, 2);
    setPriceReports([report({ scope: locals[0].priceScope, branchId: locals[0].id, price: 49.99, source: 'store' })], NOW);
    expect(priceOf(getOffer(p, locals[0], TODAY)!)).toBe(49.99);
    expect(getOffer(p, locals[1], TODAY)?.reported).toBeUndefined();
  });

  it('flow into basket totals', () => {
    const area = { cityId: 'jhb', suburbId: 'soweto', radiusKm: 15, nearTaxi: false, inMall: false, openNow: false };
    const items = [{ productId: 'sunfoil-2', qty: 2 }];
    const before = rankSingleStores(items, nearbyBranches(area, NOW), TODAY).find((s) => s.branch.retailerId === 'checkers')!;
    setPriceReports([report({ price: 10 })], NOW);
    const after = rankSingleStores(items, nearbyBranches(area, NOW), TODAY);
    expect(after[0].branch.retailerId).toBe('checkers');
    expect(after[0].total).toBe(20);
    expect(before.total).toBeGreaterThan(20);
  });
});
