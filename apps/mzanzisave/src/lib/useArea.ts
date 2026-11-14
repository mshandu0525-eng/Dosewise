import { useEffect, useMemo, useState } from 'react';
import { nearbyBranches } from '../data/branches';
import { CITY_BY_ID, findSuburb } from '../data/locations';
import { todaySA } from './date';
import { useApp } from './state';
import { useFeed } from './useFeed';
import { reportsVersion } from './reports';

/** Current time, refreshed every minute so "Open now" badges and expiry stay live. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return now;
}

export function useArea() {
  const { state } = useApp();
  const now = useNow();
  const today = todaySA(now);
  const { area } = state;
  const { feed } = useFeed();
  const only = state.myStoresOnly ? state.preferredStores : undefined;
  // The feed version is a dependency so every screen recomputes when new prices arrive.
  const feedVersion = `${feed?.version ?? 'none'}|${reportsVersion()}|${state.priceReports.length}`;
  const branches = useMemo(() => nearbyBranches(area, now, only), [area, now, only, feedVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const city = CITY_BY_ID[area.cityId];
  const suburb = findSuburb(area.cityId, area.suburbId);
  return { now, today, branches, city, suburb, label: `${suburb.name}, ${city.name}`, feedVersion, myStoresOnly: !!only };
}
