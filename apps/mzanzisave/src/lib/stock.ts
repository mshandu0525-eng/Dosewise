/**
 * "Out of stock" reports. A product reported out of stock at a store is treated as
 * unavailable there for 3 days, so baskets swap it or pick another store.
 */
export interface StockFlag {
  id: string;
  at: number;
  productId: string;
  /** Branch price scope: retailer id for chains, branch id for independents. */
  scope: string;
  branchId: string;
}

export const STOCK_FLAG_DAYS = 3;
const DAY = 86_400_000;

let index = new Map<string, StockFlag>();
let version = 's0';

export function setStockFlags(flags: StockFlag[], now: number = Date.now()): void {
  const next = new Map<string, StockFlag>();
  for (const f of flags) if (now - f.at <= STOCK_FLAG_DAYS * DAY) next.set(`${f.scope}|${f.productId}`, f);
  index = next;
  version = `s${next.size}-${[...next.values()].reduce((h, f) => (h * 31 + f.at) % 1_000_000_007, 7)}`;
}

export function stockFlag(scope: string, productId: string): StockFlag | undefined {
  return index.get(`${scope}|${productId}`);
}

export function stockVersion(): string {
  return version;
}
