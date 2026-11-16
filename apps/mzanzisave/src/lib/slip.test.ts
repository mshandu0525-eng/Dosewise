import { describe, expect, it } from 'vitest';
import { checkSlip, sampleSlip, slipDay, slipTotal } from './slip';

const NOW = Date.UTC(2026, 10, 16, 8, 0);
const basket = ['whitestar-10', 'sunfoil-2', 'tastic-2', 'pampers-4'];

describe('till slip check', () => {
  it('accepts a clear slip and finds the total, store, date and items', () => {
    const r = checkSlip(sampleSlip(NOW), basket, ['c-sunfoil', 'c-pampers'], NOW);
    expect(r.ok).toBe(true);
    expect(r.retailerId).toBe('boxer');
    expect(r.total).toBe(570.9);
    expect(r.day).toBe(Math.floor((NOW + 7_200_000) / 86_400_000));
    expect(r.found).toEqual(['whitestar-10', 'sunfoil-2', 'tastic-2']);
    expect(r.couponsFound).toEqual(['c-sunfoil']);
    expect(r.couponsMissing).toEqual(['c-pampers']);
  });

  it('says exactly what is wrong', () => {
    expect(checkSlip('blur', basket, [], NOW).issues[0].text).toMatch(/Too blurry/);
    const noTotal = checkSlip('SHOPRITE\nSOWETO\n16/11/2026\nBREAD 21.99\nMILK 38.99', basket, [], NOW);
    expect(noTotal.ok).toBe(false);
    expect(noTotal.issues.map((i) => i.text).join(' ')).toMatch(/No total found/);
    const old = checkSlip('SHOPRITE\nSOWETO\n01/11/2026\nBREAD 21.99\nTOTAL 21.99', basket, [], NOW);
    expect(old.issues.some((i) => /more than 3 days ago/.test(i.text))).toBe(true);
    const noStore = checkSlip('WELCOME\nSOWETO BRANCH\n16/11/2026\nBREAD 21.99\nTOTAL 21.99', basket, [], NOW);
    expect(noStore.issues.some((i) => /No store name/.test(i.text))).toBe(true);
  });

  it('prefers TOTAL over SUBTOTAL and reads common date formats', () => {
    expect(slipTotal('SUBTOTAL 100.00\nDISCOUNT -10.00\nTOTAL DUE R90,00')).toBe(90);
    expect(slipDay('2026-11-16 10:42')).toBe(slipDay('16/11/2026'));
    expect(slipDay('16.11.26')).toBe(slipDay('16/11/2026'));
  });
});
