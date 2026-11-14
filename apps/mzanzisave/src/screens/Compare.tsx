import { useMemo, useState } from 'react';
import { Scale, Plus, Check, Bell, BellRing, Calculator, Users } from 'lucide-react';
import { useArea } from '../lib/useArea';
import { useApp } from '../lib/state';
import { CATEGORIES, GROUP_LABELS, PRODUCTS, productTitle, searchText } from '../data/products';
import { offersFor, priceOf, unitOf } from '../data/prices';
import { distinctStores } from '../lib/basket';
import { formatUnitPrice, packLabel, percentOff, zar, unitLabel, type PackSize } from '../lib/format';
import { BestValueBadge, ExpiryChip } from '../components/OfferCard';
import { Empty, Pill, StorePill, useToast } from '../components/ui';
import type { NearbyBranch } from '../data/branches';

function PackCalculator() {
  const [a, setA] = useState({ price: '74.99', size: '2', unit: 'L' });
  const [b, setB] = useState({ price: '36.99', size: '750', unit: 'ml' });
  const toBase = (x: typeof a): PackSize | null => {
    const n = Number(x.size.replace(',', '.'));
    if (!(n > 0)) return null;
    if (x.unit === 'g') return { qty: n / 1000, unit: 'kg' };
    if (x.unit === 'ml') return { qty: n / 1000, unit: 'L' };
    return { qty: n, unit: x.unit as 'kg' | 'L' };
  };
  const sa = toBase(a);
  const sb = toBase(b);
  const pa = Number(a.price.replace(',', '.'));
  const pb = Number(b.price.replace(',', '.'));
  const ok = sa && sb && pa > 0 && pb > 0 && sa.unit === sb.unit;
  const ua = ok ? pa / sa.qty : 0;
  const ub = ok ? pb / sb.qty : 0;
  const row = (label: string, x: typeof a, set: (v: typeof a) => void, id: string, unitPrice: number, winner: boolean) => (
    <div className={`rounded-2xl border p-2.5 ${winner ? 'border-save bg-save-soft' : 'border-line bg-card'}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{label}</span>
        {winner && <BestValueBadge unit={sa?.unit ?? 'kg'} />}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <label className="flex flex-1 items-center rounded-xl border border-line bg-card px-2">
          <span className="num font-bold">R</span>
          <input id={`${id}-price`} inputMode="decimal" value={x.price} onChange={(e) => set({ ...x, price: e.target.value })} className="num w-full min-w-0 bg-transparent py-2 pl-1 font-bold outline-none" aria-label={`${label} price`} />
        </label>
        <input id={`${id}-size`} inputMode="decimal" value={x.size} onChange={(e) => set({ ...x, size: e.target.value })} className="num w-16 rounded-xl border border-line bg-card px-2 py-2 font-bold outline-none" aria-label={`${label} pack size`} />
        <select id={`${id}-unit`} value={x.unit} onChange={(e) => set({ ...x, unit: e.target.value })} className="rounded-xl border border-line bg-card px-1.5 font-semibold" aria-label={`${label} unit`}>
          <option>kg</option><option>g</option><option>L</option><option>ml</option>
        </select>
      </div>
      {ok && <p className="num mt-1.5 text-lg font-extrabold">{`R${unitPrice.toFixed(2)} / ${sa!.unit}`}</p>}
    </div>
  );
  return (
    <details className="rounded-2xl border border-line bg-card p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
        <Calculator size={18} className="text-save" /> Shrinkflation check: compare any two packs
      </summary>
      <p className="mt-1 text-xs text-muted">Type the shelf price and pack size of two items. We work out the true price per kg or litre.</p>
      <div className="mt-2 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        {row('Pack A', a, setA, 'calc-a', ua, !!ok && ua < ub)}
        {row('Pack B', b, setB, 'calc-b', ub, !!ok && ub < ua)}
      </div>
      {ok && ua !== ub && (
        <p className="mt-2 text-sm font-semibold text-save">
          {ua < ub ? 'Pack A' : 'Pack B'} is {Math.round((1 - Math.min(ua, ub) / Math.max(ua, ub)) * 100)}% cheaper per {sa!.unit}.
        </p>
      )}
      {sa && sb && sa.unit !== sb.unit && <p className="mt-2 text-sm text-warn">Pick the same kind of unit for both (weight or volume).</p>}
    </details>
  );
}

export function Compare({ onAlert }: { onAlert: (id: string) => void }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const { branches, today, city } = useArea();
  const [group, setGroup] = useState('oil');
  const [query, setQuery] = useState('');
  const stores = useMemo(() => distinctStores(branches), [branches]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = [...new Set(PRODUCTS.filter((p) => !q || searchText(p).includes(q)).map((p) => p.group))];
    return ids;
  }, [query]);
  const activeGroup = groups.includes(group) ? group : groups[0];
  const activeCategory = PRODUCTS.find((p) => p.group === (activeGroup ?? group))?.category;

  const rows = useMemo(() => {
    if (!activeGroup) return [];
    return PRODUCTS.filter((p) => p.group === activeGroup)
      .flatMap((p) => offersFor(p, stores, today))
      .sort((a, b) => a.product.size.unit.localeCompare(b.product.size.unit) || unitOf(a) - unitOf(b));
  }, [activeGroup, stores, today]);

  const community = state.community.filter((d) => d.cityId === state.area.cityId && d.group === activeGroup && d.size);
  const units = [...new Set(rows.map((r) => r.product.size.unit))];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="display text-2xl font-black">True unit price</h1>
        <p className="text-sm text-muted">Every pack size, every store in range, ranked by what you really pay per kg or litre.</p>
      </div>

      <PackCalculator />

      <input
        id="compare-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a product: rice, nappies, Joko…"
        className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 text-base outline-none focus:border-ink"
      />

      <div className="flex flex-col gap-2">
        {!query.trim() && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setGroup(PRODUCTS.find((p) => p.category === c.id)!.group)}
                aria-pressed={activeCategory === c.id}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold tracking-wide uppercase ${activeCategory === c.id ? 'bg-save-soft text-save' : 'text-muted'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {groups
            .filter((g) => query.trim() || PRODUCTS.find((p) => p.group === g)?.category === activeCategory)
            .map((g) => (
              <Pill key={g} active={g === activeGroup} onClick={() => setGroup(g)}>
                {GROUP_LABELS[g]}
              </Pill>
            ))}
        </div>
      </div>

      {!activeGroup ? (
        <Empty icon={<Scale size={28} />} title="Nothing found">Try a different word.</Empty>
      ) : rows.length === 0 ? (
        <Empty icon={<Scale size={28} />} title={`No ${GROUP_LABELS[activeGroup]} in range`}>Widen your radius from the location button at the top.</Empty>
      ) : (
        units.map((u) => {
          const list = rows.filter((r) => r.product.size.unit === u);
          const max = Math.max(...list.map(unitOf));
          return (
            <section key={u}>
              <h2 className="display mb-2 text-lg font-extrabold">
                {GROUP_LABELS[activeGroup]} · ranked by price per {unitLabel(list[0].product.size)}
              </h2>
              <ol className="flex flex-col gap-2">
                {list.slice(0, 25).map((o, i) => {
                  const p = o.product;
                  const inBasket = state.basket.some((x) => x.productId === p.id);
                  const alert = state.alerts[p.id];
                  const price = priceOf(o);
                  return (
                    <li key={`${o.branch.id}-${p.id}`} className={`rounded-2xl border bg-card p-3 ${i === 0 ? 'border-save' : 'border-line'}`}>
                      <div className="flex items-start gap-3">
                        <span className={`num grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${i === 0 ? 'bg-save text-white' : 'bg-paper text-muted'}`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StorePill retailerId={o.branch.retailerId} label={o.branch.retailerId === 'local' ? o.branch.name : undefined} size="xs" />
                            <span className="text-[11px] text-muted">{(o.branch as NearbyBranch).distanceKm.toFixed(1)} km</span>
                          </div>
                          <p className="mt-1 text-[14px] leading-snug font-semibold">
                            {productTitle(p)} <span className="font-normal text-muted">· {packLabel(p.size)}</span>
                          </p>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                            <span className="num text-[13px]">
                              <span className={`font-extrabold ${o.special ? 'text-hot' : ''}`}>{zar(price)}</span>
                              {o.special && <span className="ml-1.5 text-muted line-through">{zar(o.regular)}</span>}
                              {o.special && <span className="ml-1.5 rounded bg-tag px-1 text-[11px] font-extrabold">-{percentOff(o.regular, price)}%</span>}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                              <div className={`h-full rounded-full ${i === 0 ? 'bg-save' : 'bg-muted/50'}`} style={{ width: `${Math.max(8, (unitOf(o) / max) * 100)}%` }} />
                            </div>
                            <span className="num shrink-0 text-[15px] font-extrabold">{formatUnitPrice(price, p.size)}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {i === 0 && <BestValueBadge unit={unitLabel(p.size)} />}
                            <ExpiryChip validTo={o.validTo} today={today} />
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <button onClick={() => onAlert(p.id)} className={`grid h-10 w-10 place-items-center rounded-full ${alert ? 'bg-save-soft text-save' : 'bg-paper text-muted'}`} aria-label="Price drop alert">
                            {alert ? <BellRing size={18} /> : <Bell size={18} />}
                          </button>
                          <button
                            onClick={() => {
                              dispatch({ type: 'basketAdd', productId: p.id });
                              toast(`Added ${productTitle(p)} to My Basket`);
                            }}
                            className={`grid h-10 w-10 place-items-center rounded-full ${inBasket ? 'bg-ink text-white' : 'bg-paper'}`}
                            aria-label="Add to basket"
                          >
                            {inBasket ? <Check size={18} /> : <Plus size={18} />}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })
      )}

      {community.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="display flex items-center gap-1.5 font-extrabold">
            <Users size={18} className="text-save" /> Prices you spotted in {city.name}
          </h2>
          <ul className="mt-1 divide-y divide-line text-sm">
            {community.map((d) => (
              <li key={d.id} className="flex justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{d.name} · {d.storeName}</span>
                <span className="num shrink-0 font-bold">{formatUnitPrice(d.price, d.size!)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
