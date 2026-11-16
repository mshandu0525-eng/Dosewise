import { Star, RefreshCw, WifiOff, Pencil, ShieldCheck } from 'lucide-react';
import { useArea } from '../lib/useArea';
import { distinctStores } from '../lib/basket';
import { REPORT_MAX_AGE_DAYS } from '../lib/reports';
import { RETAILERS, RETAILER_BY_ID } from '../data/retailers';
import { CITY_BY_ID } from '../data/locations';
import { useApp } from '../lib/state';
import { useFeed } from '../lib/useFeed';
import { clockSA, hhmm } from '../lib/date';
import { Sheet } from './ui';

export function MyStoresSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const city = CITY_BY_ID[state.area.cityId];
  const groups = [
    { label: 'Big chains', list: RETAILERS.filter((r) => r.tier === 'national') },
    { label: 'Regional & local', list: RETAILERS.filter((r) => r.tier !== 'national') },
  ];
  const count = state.preferredStores.length;
  return (
    <Sheet open={open} onClose={onClose} title="My preferred stores" tall>
      <p className="text-sm text-muted">Star the stores you like to shop at. Switch on "My stores only" to see just their deals, prices and basket totals.</p>
      <label className={`mt-3 flex items-center gap-3 rounded-2xl border p-3 ${state.myStoresOnly ? 'border-save bg-save-soft' : 'border-line'} ${count ? '' : 'opacity-50'}`}>
        <Star className={state.myStoresOnly ? 'fill-current text-save' : 'text-muted'} size={22} />
        <span className="flex-1">
          <span className="block font-semibold">My stores only</span>
          <span className="block text-xs text-muted">{count ? `${count} store${count > 1 ? 's' : ''} starred` : 'Star at least one store first'}</span>
        </span>
        <input
          id="my-stores-only"
          type="checkbox"
          disabled={!count}
          checked={state.myStoresOnly}
          onChange={(e) => dispatch({ type: 'myStoresOnly', on: e.target.checked })}
          className="h-6 w-6 accent-[#047857]"
        />
      </label>
      {groups.map((g) => (
        <section key={g.label} className="mt-4">
          <h3 className="mb-2 text-[11px] font-bold tracking-wider text-muted uppercase">{g.label}</h3>
          <div className="grid grid-cols-2 gap-2">
            {g.list.map((r) => {
              const on = state.preferredStores.includes(r.id);
              const here = r.provinces.includes(city.province);
              return (
                <button
                  key={r.id}
                  onClick={() => dispatch({ type: 'togglePreferred', retailerId: r.id })}
                  aria-pressed={on}
                  className={`flex min-w-0 items-center gap-2 rounded-2xl border p-2.5 text-left ${on ? 'border-ink bg-card shadow-sm' : 'border-line bg-paper'}`}
                >
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: r.bg }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.tier === 'independent' ? 'Local grocers' : r.name}</span>
                    {!here && <span className="block text-[11px] text-muted">Not in {city.name}</span>}
                  </span>
                  <Star size={20} className={`shrink-0 ${on ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-muted'}`} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <button onClick={onClose} className="sticky bottom-0 mt-4 w-full rounded-2xl bg-ink py-3.5 font-bold text-white">Done</button>
    </Sheet>
  );
}

/** Quick switch shown at the top of Deals, Compare and My Basket. */
export function MyStoresBar({ onEdit }: { onEdit: () => void }) {
  const { state, dispatch } = useApp();
  if (!state.preferredStores.length) {
    return (
      <button onClick={onEdit} className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-ink/40 bg-card px-3 py-2.5 text-left text-sm font-semibold">
        <Star size={18} className="text-[#f59e0b]" /> Choose your preferred stores
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => dispatch({ type: 'myStoresOnly', on: !state.myStoresOnly })}
        aria-pressed={state.myStoresOnly}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold ${state.myStoresOnly ? 'border-ink bg-ink text-white' : 'border-line bg-card'}`}
      >
        <Star size={16} className={state.myStoresOnly ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-[#f59e0b]'} /> My stores only
      </button>
      <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        {state.preferredStores.slice(0, 4).map((id) => (
          <span key={id} className="h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: RETAILER_BY_ID[id]?.bg }} title={RETAILER_BY_ID[id]?.name} />
        ))}
        <span className="truncate text-xs text-muted">
          {state.preferredStores.map((id) => RETAILER_BY_ID[id]?.short).join(', ')}
        </span>
      </div>
      <button onClick={onEdit} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card" aria-label="Edit my stores">
        <Pencil size={16} />
      </button>
    </div>
  );
}

/** Star shown next to a preferred store's name. */
export function PreferredStar({ retailerId }: { retailerId: string }) {
  const { state } = useApp();
  if (!state.preferredStores.includes(retailerId)) return null;
  return <Star size={13} className="shrink-0 fill-[#f59e0b] text-[#f59e0b]" aria-label="Preferred store" />;
}

const atSA = (ms: number) => hhmm(clockSA(ms).minutes);

/** "Prices updated 14:00 · next update 15:00" with a manual refresh. */
export function PriceStatus() {
  const { feed, checkedAt, status, refresh } = useFeed();
  let text: string;
  if (status === 'checking') text = 'Checking for new prices…';
  else if (!feed) text = status === 'offline' ? 'Offline · showing saved prices' : 'Prices update every hour when you are online';
  else if (status === 'offline') text = `Offline · prices from ${atSA(checkedAt ?? Date.parse(feed.generatedAt))}`;
  else if (status === 'unavailable') text = `Couldn't reach price updates · using ${atSA(checkedAt ?? Date.parse(feed.generatedAt))} prices`;
  else text = `Prices updated ${atSA(checkedAt ?? Date.parse(feed.generatedAt))} · next update ${atSA(Date.parse(feed.nextUpdateAt))}`;
  return (
    <div className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
      {status === 'offline' ? <WifiOff size={14} className="shrink-0" /> : <span className={`h-2 w-2 shrink-0 rounded-full ${status === 'unavailable' ? 'bg-warn' : feed ? 'bg-save' : 'bg-line'}`} />}
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <button onClick={refresh} disabled={status === 'checking'} className="flex shrink-0 items-center gap-1 rounded-full bg-card px-2.5 py-1.5 font-semibold text-ink disabled:opacity-50" aria-label="Check for new prices now">
        <RefreshCw size={13} className={status === 'checking' ? 'animate-spin' : ''} /> Refresh
      </button>
    </div>
  );
}

/** Honest coverage: how many prices near you were really checked, and that the rest are estimates. */
export function CoverageLine() {
  const { state } = useApp();
  const { branches } = useArea();
  const stores = distinctStores(branches);
  const scopes = new Set(stores.map((b) => b.priceScope));
  const fresh = state.priceReports.filter((r) => scopes.has(r.scope) && Date.now() - r.at <= REPORT_MAX_AGE_DAYS * 86_400_000);
  const storesChecked = new Set(fresh.map((r) => r.scope)).size;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-card px-3 py-2 text-xs text-muted">
      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-save" />
      <span>
        {fresh.length
          ? <><b className="text-ink">{fresh.length} real price{fresh.length > 1 ? 's' : ''}</b> checked in the last {REPORT_MAX_AGE_DAYS} days at {storesChecked} of {stores.length} stores near you (on this phone). Everything else is an estimate.</>
          : <>No prices checked near you yet, so all prices are <b className="text-ink">estimates</b>. Tap "Wrong price?" or scan a shelf tag to check one.</>}
      </span>
    </p>
  );
}
