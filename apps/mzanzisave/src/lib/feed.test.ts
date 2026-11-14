import { afterEach, describe, expect, it } from 'vitest';
import { buildFeed, setActiveFeed, isFeed } from './feed';
import { getOffer, specialsIn } from '../data/prices';
import { nearbyBranches } from '../data/branches';
import { distinctStores } from './basket';
import { PRODUCT_BY_ID } from '../data/products';
import { BRANCHES } from '../data/branches';

const HOUR = 3_600_000;
const T = Date.UTC(2026, 10, 14, 10, 20);
const TODAY = Math.floor((T + 2 * HOUR) / 86_400_000);

afterEach(() => setActiveFeed(null));

describe('hourly price feed', () => {
  it('is stable within an hour and changes the next hour', () => {
    const a = buildFeed(T);
    expect(isFeed(a)).toBe(true);
    expect(buildFeed(T + 30 * 60_000)).toEqual(a);
    expect(buildFeed(T + HOUR).version).not.toBe(a.version);
    expect(a.deals.length).toBe(20);
    expect(Date.parse(a.nextUpdateAt) - Date.parse(a.generatedAt)).toBe(HOUR);
  });

  it('only lists products the retailer stocks', () => {
    for (const d of buildFeed(T).deals) {
      const p = PRODUCT_BY_ID[d.productId];
      expect(p.onlyAt ? p.onlyAt.includes(d.retailerId) : true).toBe(true);
      expect(d.pct).toBeGreaterThanOrEqual(0.12);
      expect(d.pct).toBeLessThanOrEqual(0.3);
    }
  });

  it('applying a feed lowers prices and marks hourly deals that end today', () => {
    const feed = buildFeed(T);
    const d = feed.deals.find((x) => BRANCHES.some((b) => b.retailerId === x.retailerId && b.priceScope === x.retailerId && getOffer(PRODUCT_BY_ID[x.productId], b, TODAY)))!;
    const branch = BRANCHES.find((b) => b.retailerId === d.retailerId && getOffer(PRODUCT_BY_ID[d.productId], b, TODAY))!;
    const before = getOffer(PRODUCT_BY_ID[d.productId], branch, TODAY)!;
    setActiveFeed(feed);
    const after = getOffer(PRODUCT_BY_ID[d.productId], branch, TODAY)!;
    expect(after.special!).toBeLessThanOrEqual(before.special ?? before.regular);
    if (after.hourly) expect(after.validTo).toBe(TODAY);
  });
});

describe('preferred stores', () => {
  it('limits stores to the chosen retailers', () => {
    const area = { cityId: 'jhb', suburbId: 'soweto', radiusKm: 15, nearTaxi: false, inMall: false, openNow: false };
    const only = nearbyBranches(area, T, ['shoprite', 'boxer']);
    expect(only.length).toBeGreaterThan(0);
    expect(new Set(only.map((b) => b.retailerId))).toEqual(new Set(['shoprite', 'boxer']));
    expect(specialsIn(distinctStores(only), TODAY).every((o) => ['shoprite', 'boxer'].includes(o.branch.retailerId))).toBe(true);
    expect(nearbyBranches(area, T, []).length).toBe(nearbyBranches(area, T).length);
  });
});
