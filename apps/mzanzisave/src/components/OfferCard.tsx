import { Bell, BellRing, Plus, Share2, Check, CreditCard, MapPin, Clock, Zap, BadgeCheck, Store, PencilLine, PackageX, PackageCheck } from 'lucide-react';
import { ageLabel } from '../lib/reports';
import type { Offer } from '../data/prices';
import { priceOf } from '../data/prices';
import { productTitle } from '../data/products';
import { formatUnitPrice, packLabel, percentOff, zar } from '../lib/format';
import { endsLabel } from '../lib/date';
import { openStatus, type NearbyBranch } from '../data/branches';
import { useApp } from '../lib/state';
import { dealText, whatsappUrl } from '../lib/share';
import { StorePill, Thumb, useToast } from './ui';
import { PreferredStar } from './MyStores';

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

/** Where a price comes from and how fresh it is: every price shows one of these. */
export function RealPriceBadge({ offer }: { offer: Offer }) {
  const r = offer.reported;
  if (r) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-save-soft px-1.5 py-0.5 text-[11px] font-bold text-save">
        {r.source === 'store' ? <Store size={11} /> : <BadgeCheck size={11} />}
        {r.source === 'store' ? 'From the store' : 'Checked'} {ageLabel(r.at)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold text-muted" title="Not yet checked on the shelf. Tap Wrong price to correct it.">
      Estimate{offer.hourly ? ' · hourly update' : ''}
    </span>
  );
}

export function StockChip({ offer }: { offer: Offer }) {
  if (!offer.outOfStock) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-hot px-1.5 py-0.5 text-[11px] font-bold text-white">
      <PackageX size={11} /> Reported out of stock {ageLabel(offer.outOfStock.at)}
    </span>
  );
}

export function UpdatePriceLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-semibold text-muted underline decoration-dotted underline-offset-2">
      <PencilLine size={12} /> Wrong price?
    </button>
  );
}

/** One tap: "Out of stock" here (or "Back in stock" to undo your own report). */
export function StockButton({ offer }: { offer: Offer }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const mine = state.stockFlags.find((f) => f.scope === offer.branch.priceScope && f.productId === offer.product.id);
  if (mine) {
    return (
      <button
        onClick={() => { dispatch({ type: 'unflagStock', scope: mine.scope, productId: mine.productId }); toast('Marked back in stock', 'info'); }}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-semibold text-muted underline decoration-dotted underline-offset-2"
      >
        <PackageCheck size={12} /> Back in stock
      </button>
    );
  }
  return (
    <button
      onClick={() => {
        dispatch({ type: 'flagStock', flag: { id: `oos-${Date.now()}`, at: Date.now(), productId: offer.product.id, scope: offer.branch.priceScope, branchId: offer.branch.id } });
        toast('Thanks! Marked out of stock for 3 days (+5 points)');
      }}
      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-semibold text-muted underline decoration-dotted underline-offset-2"
    >
      <PackageX size={12} /> Out of stock?
    </button>
  );
}

export function OfferCard({
  offer, today, best, onAlert, now, onUpdatePrice,
}: { offer: Offer; today: number; best: boolean; onAlert: (productId: string) => void; now: number; onUpdatePrice?: (o: Offer) => void }) {
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
    <article className={`flex gap-3 rounded-2xl border bg-card p-3 ${offer.outOfStock ? 'border-hot/40 opacity-75' : 'border-line'}`}>
      <Thumb product={p} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StorePill retailerId={branch.retailerId} label={branch.retailerId === 'local' ? branch.name : undefined} size="xs" />
          <PreferredStar retailerId={branch.retailerId} />
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
          <RealPriceBadge offer={offer} />
          {offer.hourly && (
            <span className="inline-flex items-center gap-1 rounded-md bg-tag px-1.5 py-0.5 text-[11px] font-bold text-ink">
              <Zap size={11} /> Hourly deal
            </span>
          )}
          <ExpiryChip validTo={offer.validTo} today={today} />
          {offer.loyalty && (
            <span className="inline-flex items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              <CreditCard size={11} /> {offer.loyalty} price
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StockChip offer={offer} />
          {onUpdatePrice && <UpdatePriceLink onClick={() => onUpdatePrice(offer)} />}
          <StockButton offer={offer} />
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
          {offer.hourly ? 'This hour' : left <= 0 ? 'Today' : 'Tomorrow'}
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
