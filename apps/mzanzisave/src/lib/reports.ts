/**
 * Real prices reported by shoppers ("you") or by store owners/staff ("store").
 * A report replaces the sample price for that product at that store everywhere in the app.
 * Chains share one price per chain; independent grocers are priced per branch.
 */
export type ReportSource = 'you' | 'store';

export interface PriceReport {
  id: string;
  /** When it was reported (ms). */
  at: number;
  productId: string;
  /** Branch price scope: the retailer id for chains, the branch id for independents. */
  scope: string;
  /** Branch where it was seen (for display). */
  branchId: string;
  price: number;
  /** Regular price when the reported price is a special. */
  wasPrice?: number;
  /** Last SA day the price is valid (inclusive), if the tag says. */
  validTo?: number;
  source: ReportSource;
}

/** Reports older than this stop counting, so stale prices fall away. */
export const REPORT_MAX_AGE_DAYS = 14;
const DAY = 86_400_000;

const rank = (r: PriceReport) => r.at + (r.source === 'store' ? DAY : 0);

let index = new Map<string, PriceReport>();
let version = 'r0';

export function setPriceReports(reports: PriceReport[], now: number = Date.now()): void {
  const next = new Map<string, PriceReport>();
  for (const r of reports) {
    if (now - r.at > REPORT_MAX_AGE_DAYS * DAY) continue;
    const key = `${r.scope}|${r.productId}`;
    const cur = next.get(key);
    // Newest wins, but a store's own report counts as a day newer than a shopper's.
    if (!cur || rank(r) > rank(cur)) next.set(key, r);
  }
  index = next;
  version = `r${reports.length}-${reports.reduce((h, r) => (h * 31 + r.at + Math.round(r.price * 100)) % 1_000_000_007, 7)}`;
}

export function reportFor(scope: string, productId: string): PriceReport | undefined {
  return index.get(`${scope}|${productId}`);
}

export function reportsVersion(): string {
  return version;
}

/** "just now", "2 h ago", "yesterday", "3 days ago" */
export function ageLabel(at: number, now: number = Date.now()): string {
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 5) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
