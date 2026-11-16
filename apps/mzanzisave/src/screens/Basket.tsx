import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2, Share2, Store, Split, ChevronDown, Check, AlertTriangle, Search, PartyPopper, Car, Bus, Footprints, CreditCard, Receipt, Trophy } from 'lucide-react';
import { useArea } from '../lib/useArea';
import { useApp } from '../lib/state';
import { PRODUCT_BY_ID, PRODUCTS, productTitle, searchText } from '../data/products';
import { packLabel, zar } from '../lib/format';
import { basketText, whatsappUrl } from '../lib/share';
import { openStatus, type NearbyBranch } from '../data/branches';
import { Empty, Segmented, StorePill, Thumb, useToast } from '../components/ui';
import { todaySA } from '../lib/date';
import { MyStoresBar, PreferredStar } from '../components/MyStores';
import { SlipSheet } from '../components/SlipSheet';
import { bestSplitFinal, rankByFinal, travelLabel, unitPaid, PROGRAMME_NAMES, type FinalPrice, type PriceContext, type TravelMode } from '../lib/final';
import type { Line } from '../lib/basket';

type PlacedLine = Line & { branch: NearbyBranch };

/** Shelf price → specials → loyalty → coupons → trip → final, as the report recommends. */
function Breakdown({ price, onAddCard }: { price: FinalPrice; onAddCard: () => void }) {
  const row = (label: string, value: string, tone = '') => (
    <div className="flex justify-between gap-2 py-1">
      <span className="min-w-0 text-muted">{label}</span>
      <span className={`num shrink-0 font-semibold ${tone}`}>{value}</span>
    </div>
  );
  return (
    <div className="mt-2 rounded-xl bg-paper px-3 py-2 text-sm">
      {row('Shelf price', zar(price.shelf))}
      {price.specials > 0 && row('Specials', `−${zar(price.specials)}`, 'text-save')}
      {price.loyalty > 0 && row('Your loyalty-card prices', `−${zar(price.loyalty)}`, 'text-save')}
      {price.coupons.map((c) => row(`Coupon: ${c.coupon.title}`, `−${zar(c.amount)}`, 'text-save'))}
      {row(`Trip (${price.tripKm.toFixed(1)} km there and back)`, price.trip > 0 ? `+${zar(price.trip)}` : 'R 0.00', price.trip > 0 ? 'text-hot' : '')}
      <div className="mt-1 flex justify-between gap-2 border-t border-line pt-1.5">
        <span className="font-bold">Final price</span>
        <span className="num text-base font-extrabold">{zar(price.final)}</span>
      </div>
      {price.loyaltyMissed.map((m) => (
        <button key={m.programme} onClick={onAddCard} className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg bg-card px-2 py-1.5 text-left text-xs font-semibold text-warn">
          <CreditCard size={14} className="shrink-0" /> Add your {PROGRAMME_NAMES[m.programme]} card to save another {zar(m.amount)}
        </button>
      ))}
    </div>
  );
}

function LineList({ lines, ctx }: { lines: PlacedLine[]; ctx: PriceContext }) {
  return (
    <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
      {lines.map((l) => {
        const p = PRODUCT_BY_ID[l.productId];
        const paid = l.offer ? unitPaid(l.offer, ctx) * l.qty : null;
        const cardOnly = l.offer?.loyalty && l.offer.special !== undefined && paid === l.offer.regular * l.qty;
        return (
          <li key={l.productId} className="flex items-start justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate">{l.qty > 1 ? `${l.qty} × ` : ''}{productTitle(p)} {packLabel(p.size)}</span>
              {l.substitute && l.offer && <span className="block text-xs text-warn">Swap: {productTitle(l.offer.product)} {packLabel(l.offer.product.size)}</span>}
              {!l.offer && <span className="block text-xs text-hot">Not available here</span>}
              {l.offer?.special !== undefined && !cardOnly && <span className="block text-xs text-save">On special{l.offer.loyalty ? ' with your card' : ''}</span>}
              {cardOnly && <span className="block text-xs text-warn">{l.offer!.loyalty} card price: not in your wallet</span>}
              {l.offer && <span className="block text-[11px] text-muted">{l.offer.reported ? 'Real price' : 'Estimate'}</span>}
            </span>
            <span className="num shrink-0 font-semibold">{paid !== null ? zar(paid) : '—'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TravelPicker() {
  const { state, dispatch } = useApp();
  const t = state.travel;
  const modes: { v: TravelMode; label: string; Icon: typeof Car }[] = [
    { v: 'taxi', label: 'Taxi', Icon: Bus },
    { v: 'car', label: 'Car', Icon: Car },
    { v: 'walk', label: 'Walk', Icon: Footprints },
  ];
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <p className="text-sm font-semibold">How do you get to the shops?</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {modes.map(({ v, label, Icon }) => (
          <button key={v} onClick={() => dispatch({ type: 'travel', travel: { mode: v } })} aria-pressed={t.mode === v} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold ${t.mode === v ? 'border-ink bg-ink text-white' : 'border-line'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      {t.mode === 'car' && (
        <label htmlFor="per-km" className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span>Running cost per km (fuel and wear)</span>
          <span className="flex items-center rounded-xl border border-line px-2"><span className="num font-bold">R</span>
            <input id="per-km" inputMode="decimal" value={t.perKm} onChange={(e) => dispatch({ type: 'travel', travel: { perKm: Math.max(0, Number(e.target.value.replace(',', '.')) || 0) } })} className="num w-14 bg-transparent py-1.5 pl-1 font-bold outline-none" />
          </span>
        </label>
      )}
      {t.mode === 'taxi' && (
        <label htmlFor="taxi-fare" className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span>Taxi fare per trip (stores under 1.5 km are walked)</span>
          <span className="flex items-center rounded-xl border border-line px-2"><span className="num font-bold">R</span>
            <input id="taxi-fare" inputMode="decimal" value={t.taxiFare} onChange={(e) => dispatch({ type: 'travel', travel: { taxiFare: Math.max(0, Number(e.target.value.replace(',', '.')) || 0) } })} className="num w-14 bg-transparent py-1.5 pl-1 font-bold outline-none" />
          </span>
        </label>
      )}
    </div>
  );
}

export function Basket({ onEditStores, onAddCard }: { onEditStores: () => void; onAddCard: () => void }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const { branches, today, now, label, home } = useArea();
  const [mode, setMode] = useState<'single' | 'split'>('single');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const items = state.basket;

  const ctx: PriceContext = useMemo(
    () => ({
      today,
      home,
      travel: state.travel,
      cards: new Set(state.loyalty.map((c) => c.program)),
      coupons: new Set(Object.values(state.clipped).filter((c) => !c.usedAt).map((c) => c.couponId)),
    }),
    [today, home.lat, home.lng, state.travel, state.loyalty, state.clipped], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ranked = useMemo(() => rankByFinal(items, branches, ctx), [items, branches, ctx]);
  const split = useMemo(() => bestSplitFinal(items, ranked, ctx), [items, ranked, ctx]);
  const best = ranked[0];
  const complete = ranked.filter((r) => r.price.missing === 0);
  const avgTill = complete.length ? Math.round((complete.reduce((s, r) => s + r.price.till, 0) / complete.length) * 100) / 100 : null;
  const loggedToday = state.savings.some((e) => e.kind === 'basket' && todaySA(e.at) === today);

  const matches = useMemo(() => {
    const q = adding.trim().toLowerCase();
    if (q.length < 2) return [];
    return PRODUCTS.filter((p) => searchText(p).includes(q)).slice(0, 8);
  }, [adding]);

  const logShop = () => {
    const useSplit = mode === 'split' && split?.worthIt;
    const till = useSplit ? split!.price.till : best?.price.till;
    if (till === undefined || avgTill === null) return;
    const saved = Math.max(0, Math.round((avgTill - till) * 100) / 100);
    const where = useSplit ? `${split!.a.name} + ${split!.b.name}` : best!.plan.branch.name;
    dispatch({ type: 'saving', entry: { amount: saved, label: `Basket at ${where} vs area average`, kind: 'basket' } });
    toast(saved > 0 ? `Nice! ${zar(saved)} added to your monthly savings` : 'Logged. No saving against the area average this time.', saved > 0 ? 'ok' : 'info');
  };

  if (!items.length) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="display text-2xl font-black">My Basket</h1>
        <AddBox value={adding} onChange={setAdding} matches={matches} onAdd={(id) => { dispatch({ type: 'basketAdd', productId: id }); setAdding(''); }} />
        <Empty icon={<Store size={28} />} title="Your basket is empty">Add items here, or tap + on any deal. We'll work out the real final price at each store, trip included.</Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="display text-2xl font-black">My Basket</h1>
          <p className="text-sm text-muted">{items.reduce((s, i) => s + i.qty, 0)} items · {ranked.length} stores near {label}</p>
        </div>
        <a
          href={whatsappUrl(basketText(items, label, best, split, state.travel))}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-[#128C7E] px-3.5 py-2.5 text-sm font-bold text-white"
        >
          <Share2 size={16} /> WhatsApp
        </a>
      </div>

      {best && (
        <section className="rounded-2xl bg-save p-4 text-white" aria-live="polite">
          <p className="flex items-center gap-1.5 text-sm font-semibold opacity-90"><Trophy size={16} /> Best plan: one trip</p>
          <p className="mt-1 text-lg leading-tight font-bold">{best.plan.branch.name}</p>
          <p className="num mt-1 text-3xl font-extrabold">{zar(best.price.final)}</p>
          <p className="text-sm opacity-95">
            Final price with specials{best.price.loyalty ? ', your cards' : ''}{best.price.couponTotal ? ', coupons' : ''} and the trip ({travelLabel(state.travel)}).
            {best.price.missing > 0 && ` ${best.price.missing} item${best.price.missing > 1 ? 's' : ''} not available.`}
          </p>
          <p className="mt-2 rounded-xl bg-white/15 px-3 py-2 text-sm">
            {split?.worthIt
              ? <>A second stop is worth it: <b>{split.a.name} + {split.b.name}</b> saves <b className="num">{zar(split.netSaving)}</b> more, after the longer trip.</>
              : split
                ? <>A second stop isn't worth it: it would save {split.netSaving > 0 ? `only ${zar(split.netSaving)}` : 'nothing'} after the extra travel.</>
                : 'Add more items to compare a two-store split.'}
          </p>
        </section>
      )}

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

      <TravelPicker />
      <MyStoresBar onEdit={onEditStores} />

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'single', label: <span className="inline-flex items-center gap-1.5"><Store size={16} /> One store</span> },
          { value: 'split', label: <span className="inline-flex items-center gap-1.5"><Split size={16} /> Split & Save</span> },
        ]}
      />

      {mode === 'single' ? (
        <section className="flex flex-col gap-2">
          {ranked.length === 0 && <Empty icon={<Store size={28} />} title="No stores in range">Widen your radius at the top.</Empty>}
          {ranked.map(({ plan, price }, idx) => {
            const b = plan.branch;
            const st = openStatus(b.hours, now);
            const diff = price.final - (best?.price.final ?? 0);
            const isOpen = open === b.id;
            return (
              <article key={b.id} className={`rounded-2xl border bg-card p-3 ${idx === 0 ? 'border-2 border-save' : 'border-line'}`}>
                <button onClick={() => setOpen(isOpen ? null : b.id)} className="flex w-full items-center gap-3 text-left" aria-expanded={isOpen}>
                  <span className={`num grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold ${idx === 0 ? 'bg-save text-white' : 'bg-paper text-muted'}`}>{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StorePill retailerId={b.retailerId} size="xs" label={b.retailerId === 'local' ? 'Local' : undefined} />
                      <PreferredStar retailerId={b.retailerId} />
                      <span className="text-[11px] text-muted">{b.distanceKm.toFixed(1)} km</span>
                      <span className={`text-[11px] font-semibold ${st.open ? (st.closingSoon ? 'text-warn' : 'text-save') : 'text-hot'}`}>{st.label}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold">{b.name}</p>
                    <p className="text-[11px] text-muted">
                      Till {zar(price.till)} · trip {price.trip > 0 ? zar(price.trip) : 'free'}
                      {price.couponTotal > 0 && ` · coupons −${zar(price.couponTotal)}`}
                    </p>
                    {(plan.missing > 0 || plan.substitutes > 0) && (
                      <p className="flex items-center gap-1 text-xs text-warn">
                        <AlertTriangle size={12} />
                        {plan.missing > 0 && `${plan.missing} not available`}
                        {plan.missing > 0 && plan.substitutes > 0 && ' · '}
                        {plan.substitutes > 0 && `${plan.substitutes} brand swap${plan.substitutes > 1 ? 's' : ''}`}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-xl font-extrabold">{zar(price.final)}</p>
                    {idx === 0 ? <p className="text-[11px] font-bold text-save uppercase">Cheapest</p> : price.missing > (best?.price.missing ?? 0) ? <p className="text-[11px] font-semibold text-muted">Incomplete</p> : <p className="num text-xs font-semibold text-hot">+{zar(diff)}</p>}
                  </div>
                  <ChevronDown size={18} className={`shrink-0 text-muted transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <>
                    <Breakdown price={price} onAddCard={onAddCard} />
                    <LineList lines={plan.lines.map((l) => ({ ...l, branch: b }))} ctx={ctx} />
                  </>
                )}
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
                    <p className="mt-1 text-sm opacity-95">Final {zar(split.price.final)} including a {split.price.tripKm.toFixed(1)} km trip to both stores, vs {zar(best!.price.final)} at {best!.plan.branch.name}.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold">Stick to one store</p>
                    <p className="mt-1 text-sm text-muted">
                      The best split ({split.a.name} + {split.b.name}) comes to {zar(split.price.final)} with the longer trip. That's {split.netSaving > 0 ? `only ${zar(split.netSaving)} less` : `${zar(-split.netSaving)} more`} than one trip to <span className="font-semibold text-ink">{best!.plan.branch.name}</span>. We suggest a second stop only when it saves over R10 and over 1% of your basket.
                    </p>
                  </>
                )}
              </div>
              <Breakdown price={split.price} onAddCard={onAddCard} />
              {[split.a, split.b].map((b, k) => {
                const lines = split.lines.filter((l) => l.branch === b);
                const sub = lines.reduce((t, l) => t + (l.offer ? unitPaid(l.offer, ctx) * l.qty : 0), 0);
                return (
                  <article key={b.id} className="rounded-2xl border border-line bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="num grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-extrabold text-white">{k === 0 ? 'A' : 'B'}</span>
                      <StorePill retailerId={b.retailerId} size="xs" label={b.retailerId === 'local' ? 'Local' : undefined} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b.name}</span>
                      <span className="num shrink-0 font-extrabold">{zar(sub)}</span>
                    </div>
                    <LineList lines={lines} ctx={ctx} />
                  </article>
                );
              })}
            </>
          )}
        </section>
      )}

      <div className="rounded-2xl border border-line bg-card p-3">
        {avgTill !== null && (
          <p className="text-sm text-muted">
            Area average at the till for this basket: <span className="num font-bold text-ink">{zar(avgTill)}</span>
          </p>
        )}
        <button onClick={() => setSlipOpen(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 font-bold text-white">
          <Receipt size={18} /> Check my till slip
        </button>
        <button
          onClick={logShop}
          disabled={loggedToday || avgTill === null}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-sm font-semibold disabled:text-muted"
        >
          {loggedToday ? <><Check size={16} /> Today's shop is logged</> : <><PartyPopper size={16} /> No slip? Log the planned saving</>}
        </button>
      </div>

      <SlipSheet open={slipOpen} onClose={() => setSlipOpen(false)} areaAverage={avgTill} />
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
