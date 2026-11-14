import { useCallback, useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { BottomNav, Header, type Tab } from './components/Chrome';
import { LocationSheet } from './components/LocationSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { AlertSheet } from './components/AlertSheet';
import { ToastProvider } from './components/ui';
import { Deals } from './screens/Deals';
import { Compare } from './screens/Compare';
import { Coupons } from './screens/Coupons';
import { Basket } from './screens/Basket';
import { Scan } from './screens/Scan';
import { useApp } from './lib/state';
import { useArea } from './lib/useArea';
import { dueAlerts, systemNotify, type FiredAlert } from './lib/alerts';
import { priceOf } from './data/prices';
import { productTitle } from './data/products';
import { zar } from './lib/format';

const TAB_IDS: Tab[] = ['deals', 'compare', 'coupons', 'basket', 'scan'];
const tabFromHash = (): Tab => {
  const h = location.hash.replace('#', '') as Tab;
  return TAB_IDS.includes(h) ? h : 'deals';
};

function Shell() {
  const { state, dispatch } = useApp();
  const { label, today } = useArea();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [locOpen, setLocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertFor, setAlertFor] = useState<string | null>(null);
  const [fired, setFired] = useState<FiredAlert[]>([]);

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = useCallback((t: Tab) => {
    setTab(t);
    if (location.hash !== `#${t}`) history.replaceState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  }, []);

  // Price drop alerts: checked on open, when the day rolls over, and when the area changes.
  useEffect(() => {
    const due = dueAlerts(state.alerts, state.area.cityId, today);
    if (!due.length) return;
    setFired((f) => [...f.filter((x) => !due.some((d) => d.alert.productId === x.alert.productId)), ...due]);
    for (const d of due) {
      dispatch({ type: 'alertFired', productId: d.alert.productId, day: today, price: priceOf(d.offer), store: d.offer.branch.name });
      systemNotify(`Price drop: ${productTitle(d.offer.product)}`, `Now ${zar(priceOf(d.offer))} at ${d.offer.branch.name} (your target ${zar(d.alert.target)})`);
    }
  }, [state.alerts, state.area.cityId, today, dispatch]);

  return (
    <div className="min-h-dvh">
      <Header areaLabel={label} radius={state.area.radiusKm} onLocation={() => setLocOpen(true)} onSavings={() => setSettingsOpen(true)} />
      <main
        className="mx-auto max-w-lg pt-4"
        style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))', paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        {!state.seenIntro && (
          <div className="mb-4 flex gap-2 rounded-2xl bg-ink p-3 text-sm text-white">
            <Info size={18} className="mt-0.5 shrink-0" />
            <p className="flex-1">
              Welcome to MzanziSave. Prices and coupons are realistic sample data for this proof of concept. Everything you save stays on this phone and works offline.
            </p>
            <button onClick={() => dispatch({ type: 'seenIntro' })} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}
        {tab === 'deals' && <Deals onAlert={setAlertFor} fired={fired} onDismissFired={() => setFired([])} />}
        {tab === 'compare' && <Compare onAlert={setAlertFor} />}
        {tab === 'coupons' && <Coupons />}
        {tab === 'basket' && <Basket />}
        {tab === 'scan' && <Scan />}
      </main>
      <BottomNav tab={tab} onTab={go} />
      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AlertSheet productId={alertFor} onClose={() => setAlertFor(null)} today={today} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
