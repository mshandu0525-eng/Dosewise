import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2, Share2, Store, Split, Bus, ChevronDown, Check, AlertTriangle, Search, PartyPopper } from 'lucide-react';
import { useArea } from '../lib/useArea';
import { useApp } from '../lib/state';
import { PRODUCT_BY_ID, PRODUCTS, productTitle, searchText } from '../data/products';
import { areaAverage, bestSplit, rankSingleStores, type StorePlan } from '../lib/basket';
import { packLabel, zar } from '../lib/format';
import { basketText, whatsappUrl } from '../lib/share';
import { openStatus } from '../data/branches';
import { Empty, Segmented, StorePill, Thumb, useToast } from '../components/ui';
import { todaySA } from '../lib/date';

function PlanLines({ plan }: { plan: StorePlan }) {
  return (
    <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
      {plan.lines.map((l) => {
        const p = PRODUCT_BY_ID[l.productId];
        return (
          <li key={l.productId} className="flex items-start justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate">{l.qty > 1 ? `${l.qty} × ` : ''}{productTitle(p)} {packLabel(p.size)}</span>
              {l.substitute && l.offer && <span className="block text-xs text-warn">Swap: {productTitle(l.offer.product)} {packLabel(l.offer.product.size)}</span>}
              {!l.offer && <span className="block text-xs text-hot">Not stocked here</span>}
              {l.offer?.special && <span className="block text-xs text-save">On special</span>}
            </span>
            <span className="num shrink-0 font-semibold">{l.offer ? zar(l.total) : '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Basket() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const { branches, today, now, label } = useArea();
  const [mode, setMode] = useState<'single' | 'split'>('single');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const items = state.basket;

  const singles = useMemo(() => rankSingleStores(items, branches, today), [items, branches, today]);
  const split = useMemo(() => bestSplit(items, singles, state.travelCost), [items, singles, state.travelCost]);
  const avg = areaAverage(singles);
  const best = singles[0];
  const loggedToday = state.savings.some((e) => e.kind === 'basket' && todaySA(e.at) === today);

  const matches = useMemo(() => {
    const q = adding.trim().toLowerCase();
    if (q.length < 2) return [];
    return PRODUCTS.filter((p) => searchText(p).includes(q)).slice(0, 8);
  }, [adding]);

  const logShop = () => {
    const chosen = mode === 'split' && split?.worthIt ? split.total + state.travelCost : best?.total;
    if (!chosen || !avg) return;
    const saved = Math.max(0, Math.round((avg - chosen) * 100) / 100);
    const where = mode === 'split' && split?.worthIt ? `${split.a.branch.name} + ${split.b.branch.name}` : best!.branch.name;
    dispatch({ type: 'saving', entry: { amount: saved, label: `Basket at ${where} vs area average`, kind: 'basket' } });
    toast(saved > 0 ? `Nice! ${zar(saved)} added to your monthly savings` : 'Logged. No saving against the area average this time.', saved > 0 ? 'ok' : 'info');
  };

  if (!items.length) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="display text-2xl font-black">My Basket</h1>
        <AddBox value={adding} onChange={setAdding} matches={matches} onAdd={(id) => { dispatch({ type: 'basketAdd', productId: id }); setAdding(''); }} />
        <Empty icon={<Store size={28} />} title="Your basket is empty">Add items here, or tap + on any deal. We'll find the cheapest store, or the best two-store split.</Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="display text-2xl font-black">My Basket</h1>
          <p className="text-sm text-muted">{items.reduce((s, i) => s + i.qty, 0)} items · comparing {singles.length} stores near {label}</p>
        </div>
        <a
          href={whatsappUrl(basketText(items, label, best, split, state.travelCost))}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-[#128C7E] px-3.5 py-2.5 text-sm font-bold text-white"
        >
          <Share2 size={16} /> WhatsApp
        </a>
      </div>

      <section className="rounded-2xl border border-line bg-card">
        <ul className="divide-y divide-line">
          {items.map((i) => {
            const p = PRODUCT_BY_ID[i.productId];
            if (!p) return null;
            return (
              <li key={i.productId} className="flex items-center gap-3 px-3 py-2.5">
                <Thumb product={p} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{productTitle(p)}</p>
                  <p className="text-xs text-muted">{packLabel(p.size)}</p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-paper p-1">
                  <button onClick={() => dispatch({ type: 'basketQty', productId: p.id, qty: i.qty - 1 })} className="grid h-9 w-9 place-items-center rounded-full bg-card" aria-label={i.qty === 1 ? 'Remove' : 'One less'}>
                    {i.qty === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                  </button>
                  <span className="num w-6 text-center font-bold">{i.qty}</span>
                  <button onClick={() => dispatch({ type: 'basketQty', productId: p.id, qty: i.qty + 1 })} className="grid h-9 w-9 place-items-center rounded-full bg-card" aria-label="One more">
                    <Plus size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-3">
          <AddBox value={adding} onChange={setAdding} matches={matches} onAdd={(id) => { dispatch({ type: 'basketAdd', productId: id }); setAdding(''); toast('Added to basket'); }} />
          {!confirmClear ? (
            <button onClick={() => setConfirmClear(true)} className="mt-2 text-sm font-semibold text-muted underline">Clear basket</button>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="flex-1">Remove all {items.length} items?</span>
              <button onClick={() => setConfirmClear(false)} className="rounded-xl border border-line px-3 py-2 font-semibold">Keep</button>
              <button onClick={() => { dispatch({ type: 'basketClear' }); setConfirmClear(false); }} className="rounded-xl bg-hot px-3 py-2 font-semibold text-white">Clear</button>
            </div>
          )}
        </div>
      </section>

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'single', label: <span className="inline-flex items-center gap-1.5"><Store size={16} /> One-Stop Shop</span> },
          { value: 'split', label: <span className="inline-flex items-center gap-1.5"><Split size={16} /> Split & Save</span> },
        ]}
      />

      <div className="rounded-2xl border border-line bg-card p-3">
        <label htmlFor="travel" className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-1.5"><Bus size={16} className="text-muted" /> Extra stop cost (taxi / fuel)</span>
          <span className="num text-lg font-extrabold">{zar(state.travelCost)}</span>
        </label>
        <input id="travel" type="range" min={0} max={100} step={5} value={state.travelCost} onChange={(e) => dispatch({ type: 'travel', cost: Number(e.target.value) })} className="mt-2 w-full accent-[#047857]" />
        <p className="text-xs text-muted">We only suggest a second store when the saving beats this cost.</p>
      </div>

      {mode === 'single' ? (
        <section className="flex flex-col gap-2">
          {singles.length === 0 && <Empty icon={<Store size={28} />} title="No stores in range">Widen your radius at the top.</Empty>}
          {singles.map((s, idx) => {
            const st = openStatus(s.branch.hours, now);
            const diff = s.total - (best?.total ?? 0);
            const isOpen = open === s.branch.id;
            return (
              <article key={s.branch.id} className={`rounded-2xl border bg-card p-3 ${idx === 0 ? 'border-2 border-save' : 'border-line'}`}>
                <button onClick={() => setOpen(isOpen ? null : s.branch.id)} className="flex w-full items-center gap-3 text-left" aria-expanded={isOpen}>
                  <span className={`num grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${idx === 0 ? 'bg-save text-white' : 'bg-paper text-muted'}`}>{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StorePill retailerId={s.branch.retailerId} size="xs" label={s.branch.retailerId === 'local' ? 'Local' : undefined} />
                      <span className="text-[11px] text-muted">{s.branch.distanceKm.toFixed(1)} km</span>
                      <span className={`text-[11px] font-semibold ${st.open ? (st.closingSoon ? 'text-warn' : 'text-save') : 'text-hot'}`}>{st.label}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold">{s.branch.name}</p>
                    {(s.missing > 0 || s.substitutes > 0) && (
                      <p className="flex items-center gap-1 text-xs text-warn">
                        <AlertTriangle size={12} />
                        {s.missing > 0 && `${s.missing} not stocked`}
                        {s.missing > 0 && s.substitutes > 0 && ' · '}
                        {s.substitutes > 0 && `${s.substitutes} brand swap${s.substitutes > 1 ? 's' : ''}`}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-xl font-extrabold">{zar(s.total)}</p>
                    {idx === 0 ? <p className="text-[11px] font-bold text-save uppercase">Cheapest</p> : s.missing > (best?.missing ?? 0) ? <p className="text-[11px] font-semibold text-muted">Incomplete</p> : <p className="num text-xs font-semibold text-hot">+{zar(diff)}</p>}
                  </div>
                  <ChevronDown size={18} className={`shrink-0 text-muted transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && <PlanLines plan={s} />}
              </article>
            );
          })}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {!split ? (
            <Empty icon={<Split size={28} />} title="Need 2+ items and 2+ stores">Add another item or widen your radius to compare splits.</Empty>
          ) : (
            <>
              <div className={`rounded-2xl p-4 ${split.worthIt ? 'bg-save text-white' : 'border border-line bg-card'}`}>
                {split.worthIt ? (
                  <>
                    <p className="text-sm font-semibold opacity-90">Split & Save: worth it</p>
                    <p className="num mt-0.5 text-3xl font-extrabold">Save {zar(split.netSaving)}</p>
                    <p className="mt-1 text-sm opacity-95">
                      After your {zar(state.travelCost)} extra stop. Two stores: {zar(split.total)} vs {zar(best!.total)} at {best!.branch.name}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold">Stick to one store</p>
                    <p className="mt-1 text-sm text-muted">
                      Splitting saves only {zar(Math.max(0, split.grossSaving))}, which is less than your {zar(state.travelCost)} travel. Shop everything at{' '}
                      <span className="font-semibold text-ink">{best!.branch.name}</span> for {zar(best!.total)}.
                    </p>
                  </>
                )}
              </div>
              {[split.a, split.b].map((s, k) => {
                const lines = split.lines.filter((l) => l.branch === s.branch);
                const sub = lines.reduce((t, l) => t + l.total, 0);
                return (
                  <article key={s.branch.id} className="rounded-2xl border border-line bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="num grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-extrabold text-white">{k === 0 ? 'A' : 'B'}</span>
                      <StorePill retailerId={s.branch.retailerId} size="xs" label={s.branch.retailerId === 'local' ? 'Local' : undefined} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.branch.name}</span>
                      <span className="num shrink-0 font-extrabold">{zar(sub)}</span>
                    </div>
                    <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
                      {lines.map((l) => {
                        const p = PRODUCT_BY_ID[l.productId];
                        const other = (k === 0 ? split.b : split.a).lines.find((x) => x.productId === l.productId);
                        return (
                          <li key={l.productId} className="flex justify-between gap-2 py-1.5">
                            <span className="min-w-0 truncate">{l.qty > 1 ? `${l.qty} × ` : ''}{productTitle(p)} {packLabel(p.size)}</span>
                            <span className="shrink-0 text-right">
                              <span className="num block font-semibold">{zar(l.total)}</span>
                              {other?.offer && other.total > l.total && <span className="num block text-[11px] text-save">saves {zar(other.total - l.total)}</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
            </>
          )}
        </section>
      )}

      {avg && best && (
        <div className="rounded-2xl border border-line bg-card p-3">
          <p className="text-sm text-muted">
            Area average for this basket: <span className="num font-bold text-ink">{zar(avg)}</span>
          </p>
          <button
            onClick={logShop}
            disabled={loggedToday}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 font-bold text-white disabled:bg-line disabled:text-muted"
          >
            {loggedToday ? <><Check size={18} /> Today's shop is logged</> : <><PartyPopper size={18} /> I shopped this: add my saving</>}
          </button>
        </div>
      )}
    </div>
  );
}

function AddBox({ value, onChange, matches, onAdd }: { value: string; onChange: (v: string) => void; matches: typeof PRODUCTS; onAdd: (id: string) => void }) {
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={18} />
        <input
          id="basket-add"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add an item: eggs, Huggies, samp…"
          className="w-full rounded-xl border border-line bg-paper py-3 pr-3 pl-10 text-base outline-none focus:border-ink"
        />
      </div>
      {matches.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-xl border border-line bg-card">
          {matches.map((p) => (
            <li key={p.id}>
              <button onClick={() => onAdd(p.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm">
                <span className="min-w-0 truncate">{productTitle(p)} <span className="text-muted">{packLabel(p.size)}</span></span>
                <Plus size={16} className="shrink-0 text-save" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
