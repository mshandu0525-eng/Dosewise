import { useEffect, useState } from 'react';
import { Store, User, Trash2, CheckCircle2 } from 'lucide-react';
import { PRODUCT_BY_ID, productTitle } from '../data/products';
import { BRANCH_BY_ID } from '../data/branches';
import { getOffer, priceOf } from '../data/prices';
import { formatUnitPrice, packLabel, zar } from '../lib/format';
import { dayToDate, todaySA } from '../lib/date';
import { useApp } from '../lib/state';
import type { ReportSource } from '../lib/reports';
import { Sheet, StorePill, Thumb, useToast } from './ui';

export interface PriceTarget {
  productId: string;
  branchId: string;
  price?: number;
  wasPrice?: number;
}

const toInputDate = (day: number) => dayToDate(day).toISOString().slice(0, 10);
const fromInputDate = (v: string) => (v ? Math.floor(Date.parse(v + 'T00:00:00Z') / 86_400_000) : undefined);
const num = (v: string) => Number(v.replace(',', '.').replace(/[^\d.]/g, ''));

/** Save a real shelf price for one product at one store (shopper or store owner). */
export function UpdatePriceSheet({ target, onClose }: { target: PriceTarget | null; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const p = target ? PRODUCT_BY_ID[target.productId] : null;
  const branch = target ? BRANCH_BY_ID[target.branchId] : null;
  const today = todaySA();
  const current = p && branch ? getOffer(p, branch, today) : null;
  const mine = p && branch ? state.priceReports.find((r) => r.scope === branch.priceScope && r.productId === p.id) : undefined;

  const [price, setPrice] = useState('');
  const [was, setWas] = useState('');
  const [until, setUntil] = useState('');
  const [source, setSource] = useState<ReportSource>('you');

  useEffect(() => {
    if (!target) return;
    const start = target.price ?? (current ? priceOf(current) : undefined);
    setPrice(start ? start.toFixed(2) : '');
    setWas(target.wasPrice ? target.wasPrice.toFixed(2) : '');
    setUntil(mine?.validTo !== undefined ? toInputDate(mine.validTo) : '');
    setSource(mine?.source ?? 'you');
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p || !branch) return null;
  const priceNum = num(price);
  const wasNum = was ? num(was) : undefined;
  const valid = priceNum > 0 && (wasNum === undefined || wasNum > priceNum);
  const validTo = fromInputDate(until);

  const save = () => {
    if (!valid) return;
    dispatch({
      type: 'reportPrice',
      report: { id: `rp-${Date.now()}`, at: Date.now(), productId: p.id, scope: branch.priceScope, branchId: branch.id, price: priceNum, wasPrice: wasNum, validTo, source },
    });
    toast(`Saved ${zar(priceNum)} at ${branch.retailerId === 'local' ? branch.name : branch.name.split(' ')[0]}. Basket and alerts updated.`);
    onClose();
  };

  return (
    <Sheet open={!!target} onClose={onClose} title="Update price">
      <div className="flex items-center gap-3">
        <Thumb product={p} size={48} />
        <div className="min-w-0">
          <p className="leading-tight font-semibold">{productTitle(p)}</p>
          <p className="text-sm text-muted">{packLabel(p.size)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-paper p-3 text-sm">
        <StorePill retailerId={branch.retailerId} label={branch.retailerId === 'local' ? 'Local' : undefined} size="xs" />
        <span className="min-w-0 flex-1 truncate font-semibold">{branch.name}</span>
        {current && (
          <span className="shrink-0 text-right text-xs text-muted">
            Now <span className="num font-bold text-ink">{zar(priceOf(current))}</span>
            <span className="block">{current.reported ? 'real price' : 'sample price'}</span>
          </span>
        )}
      </div>
      {branch.retailerId !== 'local' && <p className="mt-1 text-xs text-muted">Chain prices apply to every {branch.name.split(' ')[0]} branch near you.</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="up-price" className="text-sm font-semibold">Price on the shelf</label>
          <div className="mt-1 flex items-center rounded-2xl border-2 border-ink px-3">
            <span className="num text-xl font-extrabold">R</span>
            <input id="up-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="num w-full min-w-0 bg-transparent py-2.5 pl-1 text-xl font-extrabold outline-none" />
          </div>
        </div>
        <div>
          <label htmlFor="up-was" className="text-sm font-semibold">Was (if on special)</label>
          <div className="mt-1 flex items-center rounded-2xl border border-line px-3">
            <span className="num text-xl font-bold text-muted">R</span>
            <input id="up-was" inputMode="decimal" value={was} onChange={(e) => setWas(e.target.value)} placeholder="optional" className="num w-full min-w-0 bg-transparent py-2.5 pl-1 text-xl font-bold outline-none" />
          </div>
        </div>
      </div>
      {priceNum > 0 && <p className="num mt-1 text-sm font-bold">= {formatUnitPrice(priceNum, p.size)}</p>}
      {wasNum !== undefined && wasNum <= priceNum && <p className="mt-1 text-xs text-hot">The "was" price must be higher than the shelf price.</p>}

      <label htmlFor="up-until" className="mt-3 block text-sm font-semibold">Special valid until (optional)</label>
      <input id="up-until" type="date" min={toInputDate(today)} value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-2.5" />

      <p className="mt-3 text-sm font-semibold">Who is reporting?</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {([['you', User, 'I saw it in store'], ['store', Store, 'I own / work here']] as const).map(([v, Icon, label]) => (
          <button
            key={v}
            onClick={() => setSource(v)}
            aria-pressed={source === v}
            className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-sm font-semibold ${source === v ? 'border-save bg-save-soft text-save' : 'border-line'}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        {mine && (
          <button
            onClick={() => {
              dispatch({ type: 'removeReport', id: mine.id });
              toast('Your price was removed', 'info');
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-2xl border border-line px-4 py-3.5 font-semibold"
          >
            <Trash2 size={18} /> Remove
          </button>
        )}
        <button disabled={!valid} onClick={save} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-save py-3.5 font-bold text-white disabled:opacity-50">
          <CheckCircle2 size={18} /> Save real price
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">Saved on this phone. Real prices count for 14 days, then fall back to estimates.</p>
    </Sheet>
  );
}
