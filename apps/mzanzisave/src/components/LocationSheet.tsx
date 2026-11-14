import { Bus, ShoppingBag, Clock } from 'lucide-react';
import { CITIES, CITY_BY_ID } from '../data/locations';
import { nearbyBranches, openStatus } from '../data/branches';
import { useApp } from '../lib/state';
import { Sheet, StorePill } from './ui';
import { useNow } from '../lib/useArea';

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useApp();
  const now = useNow();
  const { area } = state;
  const city = CITY_BY_ID[area.cityId];
  const stores = nearbyBranches(area, now);

  const toggle = (key: 'nearTaxi' | 'inMall' | 'openNow', Icon: typeof Bus, label: string) => (
    <button
      onClick={() => dispatch({ type: 'area', area: { [key]: !area[key] } })}
      aria-pressed={area[key]}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-semibold ${area[key] ? 'border-save bg-save-soft text-save' : 'border-line bg-card'}`}
    >
      <Icon size={20} />
      {label}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Where do you shop?" tall>
      <label htmlFor="loc-city" className="text-sm font-semibold">City</label>
      <select
        id="loc-city"
        value={area.cityId}
        onChange={(e) => dispatch({ type: 'area', area: { cityId: e.target.value, suburbId: CITY_BY_ID[e.target.value].suburbs[0].id } })}
        className="mt-1 w-full rounded-2xl border border-line bg-card px-3 py-3 text-base font-semibold"
      >
        {['GP', 'WC', 'KZN', 'EC', 'FS', 'LP', 'MP'].map((prov) => {
          const cs = CITIES.filter((c) => c.province === prov);
          return (
            <optgroup key={prov} label={cs[0].provinceName}>
              {cs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          );
        })}
      </select>

      <p className="mt-4 text-sm font-semibold">Suburb or township</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {city.suburbs.map((s) => (
          <button
            key={s.id}
            onClick={() => dispatch({ type: 'area', area: { suburbId: s.id } })}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${area.suburbId === s.id ? 'border-ink bg-ink text-white' : 'border-line bg-card'}`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm font-semibold">How far will you go?</p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {[2, 5, 15].map((r) => (
          <button
            key={r}
            onClick={() => dispatch({ type: 'area', area: { radiusKm: r } })}
            className={`rounded-2xl border py-3 text-center ${area.radiusKm === r ? 'border-ink bg-ink text-white' : 'border-line bg-card'}`}
          >
            <span className="num block text-xl font-extrabold">{r} km</span>
            <span className="text-[11px] opacity-80">{r === 2 ? 'Walking' : r === 5 ? 'One taxi' : 'Drive / 2 taxis'}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm font-semibold">Quick filters</p>
      <div className="mt-1 flex gap-2">
        {toggle('nearTaxi', Bus, 'Near taxi rank')}
        {toggle('inMall', ShoppingBag, 'In a mall')}
        {toggle('openNow', Clock, 'Open now')}
      </div>

      <p className="mt-5 text-sm font-semibold">{stores.length} stores in range</p>
      <ul className="mt-1 divide-y divide-line">
        {stores.map((b) => {
          const st = openStatus(b.hours, now);
          return (
            <li key={b.id} className="flex items-center gap-2 py-2.5">
              <StorePill retailerId={b.retailerId} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{b.name}</p>
                <p className="flex flex-wrap gap-x-2 text-[11px] text-muted">
                  <span>{b.distanceKm.toFixed(1)} km</span>
                  {b.nearTaxi && <span>· Near taxi rank</span>}
                  {b.inMall && <span>· {b.mallName}</span>}
                </p>
              </div>
              <span className={`shrink-0 text-[11px] font-semibold ${st.open ? (st.closingSoon ? 'text-warn' : 'text-save') : 'text-hot'}`}>{st.label}</span>
            </li>
          );
        })}
      </ul>
      <button onClick={onClose} className="sticky bottom-0 mt-3 w-full rounded-2xl bg-ink py-3.5 font-bold text-white">
        Show specials near {city.suburbs.find((s) => s.id === area.suburbId)?.name}
      </button>
    </Sheet>
  );
}
