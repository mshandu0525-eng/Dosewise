import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { PRODUCT_BY_ID, productTitle } from '../data/products';
import { priceOf } from '../data/prices';
import { cheapestInCity } from '../lib/alerts';
import { packLabel, zar, formatUnitPrice } from '../lib/format';
import { useApp } from '../lib/state';
import { CITY_BY_ID } from '../data/locations';
import { Sheet, Thumb, useToast } from './ui';

export function AlertSheet({ productId, onClose, today }: { productId: string | null; onClose: () => void; today: number }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const p = productId ? PRODUCT_BY_ID[productId] : null;
  const existing = productId ? state.alerts[productId] : undefined;
  const cheapest = productId ? cheapestInCity(productId, state.area.cityId, today) : null;
  const now = cheapest ? priceOf(cheapest) : p?.base ?? 0;
  const [target, setTarget] = useState('');
  const [perm, setPerm] = useState<string>(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  useEffect(() => {
    if (!p) return;
    setTarget((existing?.target ?? Math.floor(now * 0.9) + 0.99).toFixed(2));
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null;
  const value = Number(target.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0;

  const save = async () => {
    if (!valid) return;
    dispatch({ type: 'alertSet', alert: { productId: p.id, target: value, createdDay: today } });
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        setPerm(await Notification.requestPermission());
      } catch {
        /* blocked in this browser frame */
      }
    }
    toast(`Alert set: we'll tell you when it's ${zar(value)} or less`);
    onClose();
  };

  return (
    <Sheet open={!!p} onClose={onClose} title="Price drop alert">
      <div className="flex items-center gap-3">
        <Thumb product={p} size={48} />
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{productTitle(p)}</p>
          <p className="text-sm text-muted">{packLabel(p.size)}</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-paper p-3 text-sm">
        <p className="text-muted">Cheapest in {CITY_BY_ID[state.area.cityId]?.name ?? 'your city'} today</p>
        {cheapest ? (
          <p className="mt-0.5">
            <span className="num text-xl font-extrabold">{zar(now)}</span>{' '}
            <span className="text-muted">at {cheapest.branch.name} · {formatUnitPrice(now, p.size)}</span>
          </p>
        ) : (
          <p className="mt-0.5 font-semibold">Not stocked nearby right now</p>
        )}
      </div>
      <label htmlFor="alert-target" className="mt-4 block text-sm font-semibold">
        Tell me when it drops to
      </label>
      <div className="mt-1 flex items-center gap-2 rounded-2xl border-2 border-ink bg-card px-3">
        <span className="num text-2xl font-extrabold">R</span>
        <input
          id="alert-target"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="num w-full bg-transparent py-3 text-2xl font-extrabold outline-none"
        />
      </div>
      <div className="mt-2 flex gap-2">
        {[5, 10, 15, 20].map((pct) => (
          <button key={pct} onClick={() => setTarget((Math.floor(now * (1 - pct / 100)) + 0.99).toFixed(2))} className="flex-1 rounded-xl bg-paper py-2 text-sm font-semibold">
            -{pct}%
          </button>
        ))}
      </div>
      {perm !== 'granted' && (
        <p className="mt-3 text-xs text-muted">
          {perm === 'denied' || perm === 'unsupported'
            ? 'Phone notifications are off for this app, so alerts show as a banner when you open MzanziSave.'
            : 'We’ll ask to send phone notifications. Alerts also show as a banner when you open the app.'}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        {existing && (
          <button
            onClick={() => {
              dispatch({ type: 'alertRemove', productId: p.id });
              toast('Alert removed', 'info');
              onClose();
            }}
            className="flex items-center justify-center gap-2 rounded-2xl border border-line px-4 py-3.5 font-semibold"
          >
            <BellOff size={18} /> Remove
          </button>
        )}
        <button disabled={!valid} onClick={save} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-save py-3.5 font-bold text-white disabled:opacity-50">
          <BellRing size={18} /> {existing ? 'Update alert' : 'Set alert'}
        </button>
      </div>
    </Sheet>
  );
}
