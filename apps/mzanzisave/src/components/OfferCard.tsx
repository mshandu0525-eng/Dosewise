import { Bell, BellRing, Plus, Share2, Check, CreditCard, MapPin, Clock } from 'lucide-react';
import type { Offer } from '../data/prices';
import { priceOf } from '../data/prices';
import { productTitle } from '../data/products';
import { formatUnitPrice, packLabel, percentOff, zar } from '../lib/format';
import { endsLabel } from '../lib/date';
import { openStatus, type NearbyBranch } from '../data/branches';
import { useApp } from '../lib/state';
import { dealText, whatsappUrl } from '../lib/share';
import { StorePill, Thumb, useToast } from './ui';

export function BestValueBadge({ unit }: { unit: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-save px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      <Check size={11} strokeWidth={3} /> Best value per {unit}
    </span>
  );
}

export function ExpiryChip({ validTo, today }: { validTo?: number; today: number }) {
  if (validTo === undefined) return null;
  const left = validTo - today;
  const tone = left <= 0 ? 'bg-hot text-white' : left === 1 ? 'bg-hot-soft text-hot' : left <= 2 ? 'bg-warn-soft text-warn' : 'bg-paper text-muted';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      <Clock size={11} /> {endsLabel(validTo, today)}
    </span>
  );
}

export function OfferCard({
  offer, today, best, onAlert, now,
}: { offer: Offer; today: number; best: boolean; onAlert: (productId: string) => void; now: number }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const p = offer.product;
  const price = priceOf(offer);
  const inBasket = state.basket.some((i) => i.productId === p.id);
  const alert = state.alerts[p.id];
  const branch = offer.branch as NearbyBranch;
  const status = openStatus(branch.hours, now);
  const unitWord = p.size.unit === 'each' ? (p.size.countLabel ?? 'item') : p.size.unit;

  return (
    <article className="flex gap-3 rounded-2xl border border-line bg-card p-3">
      <Thumb product={p} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StorePill retailerId={branch.retailerId} label={branch.retailerId === 'local' ? branch.name : undefined} size="xs" />
          {branch.distanceKm !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
              <MapPin size={11} /> {branch.distanceKm.toFixed(1)} km
            </span>
          )}
          <span className={`text-[11px] font-medium ${status.open ? (status.closingSoon ? 'text-warn' : 'text-save') : 'text-hot'}`}>{status.label}</span>
        </div>
        <p className="mt-1 text-[12px] font-medium text-muted">{p.brand !== 'Fresh' && p.brand !== 'Butchery' ? p.brand : p.category === 'meat' ? 'Butchery' : 'Fresh produce'}</p>
        <h3 className="text-[15px] font-semibold leading-snug">
          {p.name} <span className="font-normal text-muted">· {packLabel(p.size)}</span>
        </h3>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className={`num text-2xl font-extrabold ${offer.special ? 'text-hot' : 'text-ink'}`}>{zar(price)}</span>
          {offer.special && (
            <>
              <span className="num text-sm text-muted line-through">{zar(offer.regular)}</span>
              <span className="rounded bg-tag px-1.5 py-0.5 text-[11px] font-extrabold text-ink">-{percentOff(offer.regular, price)}%</span>
            </>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="num text-[13px] font-bold text-ink">{formatUnitPrice(price, p.size)}</span>
          {best && <BestValueBadge unit={unitWord} />}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ExpiryChip validTo={offer.validTo} today={today} />
          {offer.loyalty && (
            <span className="inline-flex items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              <CreditCard size={11} /> {offer.loyalty} price
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <button
          onClick={() => onAlert(p.id)}
          className={`grid h-10 w-10 place-items-center rounded-full ${alert ? 'bg-save-soft text-save' : 'bg-paper text-muted'}`}
          aria-label={alert ? `Price alert on for ${productTitle(p)}` : `Set price alert for ${productTitle(p)}`}
        >
          {alert ? <BellRing size={18} /> : <Bell size={18} />}
        </button>
        <button
          onClick={() => {
            dispatch({ type: 'basketAdd', productId: p.id });
            toast(`Added ${p.brand === 'Fresh' ? p.name : p.brand} to My Basket`);
          }}
          className={`grid h-10 w-10 place-items-center rounded-full ${inBasket ? 'bg-ink text-white' : 'bg-paper text-ink'}`}
          aria-label={`Add ${productTitle(p)} to basket`}
        >
          {inBasket ? <Check size={18} /> : <Plus size={18} />}
        </button>
        <a
          href={whatsappUrl(dealText(offer, today))}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-10 w-10 place-items-center rounded-full bg-paper text-[#128C7E]"
          aria-label="Share deal on WhatsApp"
        >
          <Share2 size={18} />
        </a>
      </div>
    </article>
  );
}

/** Compact card for the "Ends Tomorrow" carousel. */
export function LastChanceCard({ offer, today, onOpen }: { offer: Offer; today: number; onOpen: () => void }) {
  const p = offer.product;
  const price = priceOf(offer);
  const left = (offer.validTo ?? today) - today;
  return (
    <button onClick={onOpen} className="flex w-44 shrink-0 snap-start flex-col gap-1 rounded-2xl border border-line bg-card p-3 text-left">
      <div className="flex items-center justify-between gap-1">
        <StorePill retailerId={offer.branch.retailerId} label={offer.branch.retailerId === 'local' ? 'Local' : undefined} size="xs" />
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${left <= 0 ? 'bg-hot text-white' : 'bg-warn-soft text-warn'}`}>
          {left <= 0 ? 'Today' : 'Tomorrow'}
        </span>
      </div>
      <p className="line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-tight">
        {productTitle(p)} {packLabel(p.size)}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="num text-xl font-extrabold text-hot">{zar(price)}</span>
        <span className="num text-[11px] text-muted line-through">{zar(offer.regular)}</span>
      </div>
      <span className="num text-[11px] font-semibold text-muted">{formatUnitPrice(price, p.size)}</span>
    </button>
  );
}
