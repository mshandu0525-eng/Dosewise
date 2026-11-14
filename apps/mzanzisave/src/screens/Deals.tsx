import { useMemo, useState } from 'react';
import { Search, Flame, BellRing, Users, X } from 'lucide-react';
import { useArea } from '../lib/useArea';
import { useApp } from '../lib/state';
import { CATEGORIES, GROUP_LABELS, STAPLE_PILLS, productTitle, searchText, type Category } from '../data/products';
import { PRODUCTS } from '../data/products';
import { getOffer, priceOf, specialsIn, unitOf, type Offer } from '../data/prices';
import { distinctStores } from '../lib/basket';
import { RETAILER_BY_ID } from '../data/retailers';
import { LastChanceCard, OfferCard } from '../components/OfferCard';
import { Empty, Pill, Sheet, StorePill } from '../components/ui';
import type { NearbyBranch } from '../data/branches';
import { formatUnitPrice, packLabel, zar } from '../lib/format';
import { formatShortDay } from '../lib/date';
import type { FiredAlert } from '../lib/alerts';

type Filter = { kind: 'all' } | { kind: 'group'; id: string } | { kind: 'category'; id: Category };
type Sort = 'saving' | 'unit' | 'near';
type Tier = 'all' | 'chains' | 'local';

/** Lowest price per unit for each product group across the stores in range. */
export function groupBestUnits(stores: NearbyBranch[], today: number): Map<string, number> {
  const best = new Map<string, number>();
  for (const p of PRODUCTS) {
    for (const b of stores) {
      const o = getOffer(p, b, today);
      if (!o) continue;
      const k = `${p.group}|${p.size.unit}`;
      const u = unitOf(o);
      if (u < (best.get(k) ?? Infinity)) best.set(k, u);
    }
  }
  return best;
}

export function isBestValue(o: Offer, best: Map<string, number>): boolean {
  const b = best.get(`${o.product.group}|${o.product.size.unit}`);
  return b !== undefined && unitOf(o) <= b + 0.005;
}

export function Deals({ onAlert, fired, onDismissFired }: { onAlert: (id: string) => void; fired: FiredAlert[]; onDismissFired: () => void }) {
  const { state } = useApp();
  const { branches, today, now, label, city } = useArea();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sort, setSort] = useState<Sort>('saving');
  const [tier, setTier] = useState<Tier>('all');
  const [limit, setLimit] = useState(30);
  const [focus, setFocus] = useState<Offer | null>(null);

  const stores = useMemo(() => distinctStores(branches), [branches]);
  const specials = useMemo(() => specialsIn(stores, today), [stores, today]);
  const best = useMemo(() => groupBestUnits(stores, today), [stores, today]);

  const lastChance = useMemo(
    () =>
      specials
        .filter((o) => o.validTo !== undefined && o.validTo - today <= 1)
        .sort((a, b) => (a.validTo! - b.validTo!) || (b.regular - priceOf(b)) - (a.regular - priceOf(a)))
        .slice(0, 12),
    [specials, today],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = specials.filter((o) => {
      const r = RETAILER_BY_ID[o.branch.retailerId];
      if (tier === 'chains' && r.tier !== 'national') return false;
      if (tier === 'local' && r.tier === 'national') return false;
      if (filter.kind === 'group' && o.product.group !== filter.id) return false;
      if (filter.kind === 'category' && o.product.category !== filter.id) return false;
      if (q && !searchText(o.product).includes(q) && !o.branch.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'saving') list = list.sort((a, b) => (b.regular - priceOf(b)) - (a.regular - priceOf(a)));
    if (sort === 'unit') list = list.sort((a, b) => a.product.group.localeCompare(b.product.group) || unitOf(a) - unitOf(b));
    if (sort === 'near') list = list.sort((a, b) => (a.branch as NearbyBranch).distanceKm - (b.branch as NearbyBranch).distanceKm);
    return list;
  }, [specials, query, filter, sort, tier]);

  const community = state.community.filter((d) => d.cityId === state.area.cityId);
  const browsing = filter.kind === 'all' && !query;

  return (
    <div className="flex flex-col gap-4">
      {fired.length > 0 && (
        <section className="rounded-2xl border-2 border-save bg-save-soft p-3" aria-live="polite">
          <div className="flex items-start gap-2">
            <BellRing className="mt-0.5 shrink-0 text-save" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-save">Price drop{fired.length > 1 ? 's' : ''} hit your target</p>
              <ul className="mt-1 space-y-1 text-sm">
                {fired.map((f) => (
                  <li key={f.alert.productId}>
                    <span className="font-semibold">{productTitle(f.offer.product)} {packLabel(f.offer.product.size)}</span> is{' '}
                    <span className="num font-extrabold">{zar(priceOf(f.offer))}</span> at {f.offer.branch.name}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={onDismissFired} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </section>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" size={20} />
        <input
          id="deals-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(30);
          }}
          placeholder="Search specials: pap, oil, Pampers…"
          className="w-full rounded-2xl border border-line bg-card py-3.5 pr-3 pl-11 text-base outline-none focus:border-ink"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" style={{ scrollPaddingInline: 16 }}>
        <Pill active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>All</Pill>
        {STAPLE_PILLS.map((s) => (
          <Pill key={s.group} active={filter.kind === 'group' && filter.id === s.group} onClick={() => setFilter({ kind: 'group', id: s.group })}>
            {s.label}
          </Pill>
        ))}
        {CATEGORIES.filter((c) => c.id !== 'staples').map((c) => (
          <Pill key={c.id} active={filter.kind === 'category' && filter.id === c.id} onClick={() => setFilter({ kind: 'category', id: c.id })}>
            {c.label}
          </Pill>
        ))}
      </div>

      {browsing && lastChance.length > 0 && (
        <section>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="display flex items-center gap-1.5 text-lg font-extrabold">
              <Flame className="text-hot" size={20} /> Ends Tomorrow
            </h2>
            <span className="text-xs font-semibold text-warn">Last chance · {lastChance.length} deals</span>
          </div>
          <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar" style={{ scrollPaddingInline: 16 }}>
            {lastChance.map((o) => (
              <LastChanceCard key={`${o.branch.id}-${o.product.id}`} offer={o} today={today} onOpen={() => setFocus(o)} />
            ))}
          </div>
        </section>
      )}

      {browsing && community.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="display flex items-center gap-1.5 text-base font-extrabold">
            <Users size={18} className="text-save" /> Spotted by you in {city.name}
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {community.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{d.name}{d.size ? ` ${packLabel(d.size)}` : ''}</span>
                  <span className="block truncate text-xs text-muted">{d.storeName} · {formatShortDay(Math.floor(d.at / 86_400_000))}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block font-extrabold">{zar(d.price)}</span>
                  {d.size && <span className="num block text-[11px] text-muted">{formatUnitPrice(d.price, d.size)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-end justify-between gap-2">
          <h2 className="display text-lg font-extrabold">
            {filter.kind === 'group' ? `${GROUP_LABELS[filter.id]} specials` : filter.kind === 'category' ? `${CATEGORIES.find((c) => c.id === filter.id)?.label} specials` : 'Specials near you'}
          </h2>
          <span className="shrink-0 text-xs text-muted">{shown.length} in {stores.length} stores</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <select id="deals-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-xl border border-line bg-card px-3 py-2 font-semibold" aria-label="Sort deals">
            <option value="saving">Biggest saving</option>
            <option value="unit">Cheapest per kg / L</option>
            <option value="near">Nearest store</option>
          </select>
          <select id="deals-tier" value={tier} onChange={(e) => setTier(e.target.value as Tier)} className="rounded-xl border border-line bg-card px-3 py-2 font-semibold" aria-label="Store type">
            <option value="all">All stores</option>
            <option value="chains">Big chains</option>
            <option value="local">Regional & local</option>
          </select>
        </div>
        {stores.length === 0 ? (
          <Empty icon={<Search size={28} />} title="No stores in range">
            Try a bigger radius or switch off the quick filters for {label}.
          </Empty>
        ) : shown.length === 0 ? (
          <Empty icon={<Search size={28} />} title="No specials match">
            Try another word, or check Compare for everyday prices.
          </Empty>
        ) : (
          <div className="flex flex-col gap-2.5">
            {shown.slice(0, limit).map((o) => (
              <OfferCard key={`${o.branch.id}-${o.product.id}`} offer={o} today={today} now={now} best={isBestValue(o, best)} onAlert={onAlert} />
            ))}
            {shown.length > limit && (
              <button onClick={() => setLimit((l) => l + 30)} className="rounded-2xl border border-line bg-card py-3.5 font-semibold">
                Show {Math.min(30, shown.length - limit)} more specials
              </button>
            )}
          </div>
        )}
      </section>

      <Sheet open={!!focus} onClose={() => setFocus(null)} title="Last chance deal">
        {focus && (
          <>
            <div className="mb-2 flex items-center gap-2">
              <StorePill retailerId={focus.branch.retailerId} />
              <span className="text-sm text-muted">{focus.branch.name}</span>
            </div>
            <OfferCard offer={focus} today={today} now={now} best={isBestValue(focus, best)} onAlert={onAlert} />
          </>
        )}
      </Sheet>
    </div>
  );
}
