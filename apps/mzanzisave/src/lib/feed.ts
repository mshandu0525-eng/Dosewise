/**
 * Hourly price feed. The server (cloudflare/worker.ts) builds it; the app downloads it once
 * an hour and lays it over the base shelf prices. Today it carries sample "hourly deals";
 * a real price source plugs in here without changing the app.
 */
import { PRODUCTS } from '../data/products';
import { RETAILERS } from '../data/retailers';
import { between, hash } from './random';

export interface HourlyDeal {
  retailerId: string;
  productId: string;
  /** Discount off the regular shelf price, 0–1. */
  pct: number;
}

export interface PriceFeed {
  /** Changes whenever prices change; the app recomputes when it does. */
  version: string;
  generatedAt: string;
  nextUpdateAt: string;
  source: 'sample';
  deals: HourlyDeal[];
}

const HOUR = 3_600_000;

export function buildFeed(now: number = Date.now()): PriceFeed {
  const hour = Math.floor(now / HOUR);
  const retailers = RETAILERS.filter((r) => r.tier !== 'independent');
  const deals: HourlyDeal[] = [];
  const seen = new Set<string>();
  for (let i = 0; deals.length < 20 && i < 200; i++) {
    const p = PRODUCTS[Math.floor(hash(`hp|${hour}|${i}`) * PRODUCTS.length)];
    const r = retailers[Math.floor(hash(`hr|${hour}|${i}`) * retailers.length)];
    if (p.onlyAt && !p.onlyAt.includes(r.id)) continue;
    if (!p.onlyAt && !r.range[p.category]) continue;
    const key = `${r.id}|${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deals.push({ retailerId: r.id, productId: p.id, pct: Math.round(between(`hd|${hour}|${i}`, 0.12, 0.3) * 100) / 100 });
  }
  return {
    version: `h${hour}`,
    generatedAt: new Date(hour * HOUR).toISOString(),
    nextUpdateAt: new Date((hour + 1) * HOUR).toISOString(),
    source: 'sample',
    deals,
  };
}

export function isFeed(x: unknown): x is PriceFeed {
  const f = x as PriceFeed;
  return !!f && typeof f.version === 'string' && Array.isArray(f.deals) && typeof f.nextUpdateAt === 'string';
}

/* ---------- The feed the price engine currently uses ---------- */

let active: PriceFeed | null = null;
let index = new Map<string, HourlyDeal>();

export function setActiveFeed(feed: PriceFeed | null): void {
  active = feed;
  index = new Map((feed?.deals ?? []).map((d) => [`${d.retailerId}|${d.productId}`, d]));
}

export function activeFeedVersion(): string {
  return active?.version ?? 'none';
}

export function hourlyDeal(retailerId: string, productId: string): HourlyDeal | undefined {
  return index.get(`${retailerId}|${productId}`);
}
