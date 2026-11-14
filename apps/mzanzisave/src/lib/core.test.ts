import { describe, expect, it } from 'vitest';
import { parseTag, parsePrices, parseSize } from './ocr';
import { formatUnitPrice, zar, packLabel } from './format';
import { nearbyBranches, openStatus, BRANCHES } from '../data/branches';
import { rankSingleStores, bestSplit, distinctStores } from './basket';
import { getOffer, shelfPrice, specialsIn } from '../data/prices';
import { PRODUCT_BY_ID } from '../data/products';
import { CITIES } from '../data/locations';
import { RETAILERS } from '../data/retailers';
import { splitAmong, comboRegular } from '../screens/Coupons';
import { COUPONS } from '../data/coupons';

const TODAY = 20_406; // a fixed SA day number (Nov 2025) so tests are stable

describe('format', () => {
  it('formats rand and unit prices', () => {
    expect(zar(1234.5)).toBe('R 1 234.50');
    expect(formatUnitPrice(29, { qty: 2, unit: 'kg' })).toBe('R14.50 / kg');
    expect(formatUnitPrice(36, { qty: 2, unit: 'L' })).toBe('R18.00 / L');
    expect(packLabel({ qty: 0.75, unit: 'L' })).toBe('750ml');
    expect(packLabel({ qty: 58, unit: 'each', countLabel: 'nappy' })).toBe('58 nappies');
    expect(shelfPrice(74.3)).toBe(74.99);
  });
});

describe('shelf tag parsing', () => {
  it('reads a Checkers tag with a was-price', () => {
    const t = parseTag('CHECKERS\nXTRA SAVINGS\nSUNFOIL\nSUNFLOWER OIL 2L\nWAS R74.99\nR64.99');
    expect(t.retailerId).toBe('checkers');
    expect(t.price).toBe(64.99);
    expect(t.wasPrice).toBe(74.99);
    expect(t.size).toEqual({ qty: 2, unit: 'L' });
    expect(t.match?.id).toBe('sunfoil-2');
  });
  it('reads prices with small cents and OCR slips', () => {
    expect(parsePrices('NOW ONLY R129 99')).toEqual([129.99]);
    expect(parsePrices('R5O.99')).toEqual([50.99]);
    expect(parsePrices('special 59,99')).toEqual([59.99]);
  });
  it('reads sizes', () => {
    expect(parseSize('500g')).toEqual({ qty: 0.5, unit: 'kg' });
    expect(parseSize('6 x 1L')).toEqual({ qty: 6, unit: 'L' });
    expect(parseSize('750 ml')).toEqual({ qty: 0.75, unit: 'L' });
  });
  it('matches maize meal from a spaza flyer', () => {
    const t = parseTag("MAMA THANDI'S GROCER\nWhite Star Super Maize Meal\n10kg\nNOW ONLY R129 99");
    expect(t.match?.id).toBe('whitestar-10');
    expect(t.price).toBe(129.99);
  });
});

describe('stores', () => {
  it('every city has stores within 5km of every suburb', () => {
    for (const c of CITIES) for (const s of c.suburbs) {
      const near = nearbyBranches({ cityId: c.id, suburbId: s.id, radiusKm: 5, nearTaxi: false, inMall: false, openNow: false });
      expect(near.length, `${c.name}/${s.name}`).toBeGreaterThanOrEqual(4);
    }
  });
  it('every retailer has branches somewhere', () => {
    for (const r of RETAILERS) expect(BRANCHES.some((b) => b.retailerId === r.id), r.id).toBe(true);
  });
  it('shows open and closing times in SAST', () => {
    const hours = { weekday: [480, 1200] as [number, number], sat: null, sun: null };
    // Wednesday 2026-11-11 10:00 SAST = 08:00 UTC
    expect(openStatus(hours, Date.UTC(2026, 10, 11, 8, 0))).toMatchObject({ open: true, label: 'Open · closes 20:00' });
    expect(openStatus(hours, Date.UTC(2026, 10, 11, 17, 30))).toMatchObject({ open: true, closingSoon: true });
    expect(openStatus(hours, Date.UTC(2026, 10, 11, 4, 0)).label).toBe('Closed · opens 08:00');
  });
});

describe('prices and specials', () => {
  const area = { cityId: 'jhb', suburbId: 'soweto', radiusKm: 5, nearTaxi: false, inMall: false, openNow: false };
  const stores = distinctStores(nearbyBranches(area));
  it('specials are cheaper than regular and dated', () => {
    const sp = specialsIn(stores, TODAY);
    expect(sp.length).toBeGreaterThan(50);
    for (const o of sp) {
      expect(o.special!).toBeLessThan(o.regular);
      expect(o.validFrom!).toBeLessThanOrEqual(TODAY);
      expect(o.validTo!).toBeGreaterThanOrEqual(TODAY);
    }
    expect(sp.some((o) => o.validTo! - TODAY <= 1)).toBe(true);
  });
  it('a special keeps the same dates on following days', () => {
    const sp = specialsIn(stores, TODAY).find((o) => o.validTo! > TODAY)!;
    const next = getOffer(sp.product, sp.branch, TODAY + 1)!;
    expect(next.special).toBe(sp.special);
    expect(next.validTo).toBe(sp.validTo);
  });
});

describe('basket optimiser', () => {
  const area = { cityId: 'jhb', suburbId: 'soweto', radiusKm: 15, nearTaxi: false, inMall: false, openNow: false };
  const items = ['whitestar-10', 'sunfoil-2', 'selati-2.5', 'tastic-2', 'rainbow-iqf-2', 'clover-fc-2', 'albany-white', 'potatoes-7'].map((productId) => ({ productId, qty: 1 }));
  it('ranks complete stores cheapest first', () => {
    const singles = rankSingleStores(items, nearbyBranches(area), TODAY);
    expect(singles.length).toBeGreaterThan(5);
    const complete = singles.filter((s) => s.missing === 0);
    for (let i = 1; i < complete.length; i++) expect(complete[i].total).toBeGreaterThanOrEqual(complete[i - 1].total);
  });
  it('only recommends a split when it beats travel cost', () => {
    const singles = rankSingleStores(items, nearbyBranches(area), TODAY);
    const cheap = bestSplit(items, singles, 0)!;
    expect(cheap.total).toBeLessThanOrEqual(singles[0].total);
    const pricey = bestSplit(items, singles, 10_000)!;
    expect(pricey.worthIt).toBe(false);
    expect(cheap.netSaving).toBeCloseTo(cheap.grossSaving, 2);
  });
});

describe('stokvel', () => {
  it('splits the combo price fairly', () => {
    expect(splitAmong(1849, 4)).toEqual({ each: 462.25, extra: 0 });
    const r = splitAmong(1849, 3);
    expect(r.each).toBe(616.34);
    expect(r.extra).toBeCloseTo(0.02, 2);
  });
  it('every combo is cheaper than buying the items separately', () => {
    for (const c of COUPONS.filter((x) => x.combo)) expect(c.combo!.price, c.id).toBeLessThan(comboRegular(c));
  });
  it('catalogue references are valid', () => {
    for (const c of COUPONS) for (const id of [...(c.productIds ?? []), ...(c.combo?.items.map((i) => i.productId) ?? [])]) expect(PRODUCT_BY_ID[id], id).toBeTruthy();
  });
});
