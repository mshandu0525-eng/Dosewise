import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { BottomNav, Header, type Tab } from './components/Chrome';
import { LocationSheet } from './components/LocationSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { AlertSheet } from './components/AlertSheet';
import { MyStoresSheet } from './components/MyStores';
import { UpdatePriceSheet, type PriceTarget } from './components/UpdatePriceSheet';
import type { Offer } from './data/prices';
import { ToastProvider } from './components/ui';
import { Deals } from './screens/Deals';
import { Basket } from './screens/Basket';
import { useApp } from './lib/state';
import { useArea } from './lib/useArea';
import { dueAlerts, systemNotify, type FiredAlert } from './lib/alerts';
import { priceOf } from './data/prices';
import { productTitle } from './data/products';
import { zar } from './lib/format';

// Screens other than Deals and My Basket load on first open, so the first visit uses less data.
const Compare = lazy(() => import('./screens/Compare').then((m) => ({ default: m.Compare })));
const Coupons = lazy(() => import('./screens/Coupons').then((m) => ({ default: m.Coupons })));
const Scan = lazy(() => import('./screens/Scan').then((m) => ({ default: m.Scan })));

const TAB_IDS: Tab[] = ['deals', 'compare', 'coupons', 'basket', 'scan'];
const tabFromHash = (): Tab => {
  const h = location.hash.replace('#', '') as Tab;
  return TAB_IDS.includes(h) ? h : 'deals';
};

function Shell() {
  const { state, dispatch } = useApp();
  const { label, today, feedVersion } = useArea();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [locOpen, setLocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertFor, setAlertFor] = useState<string | null>(null);
  const [storesOpen, setStoresOpen] = useState(false);
  const editStores = useCallback(() => setStoresOpen(true), []);
  const [priceTarget, setPriceTarget] = useState<PriceTarget | null>(null);
  const [couponsView, setCouponsView] = useState<'cards' | undefined>(undefined);
  const updatePrice = useCallback((o: Offer) => setPriceTarget({ productId: o.product.id, branchId: o.branch.id }), []);
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
  }, [state.alerts, state.area.cityId, today, feedVersion, dispatch]);

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
        <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Loading…</p>}>
        {tab === 'deals' && <Deals onAlert={setAlertFor} fired={fired} onDismissFired={() => setFired([])} onEditStores={editStores} onUpdatePrice={updatePrice} />}
        {tab === 'compare' && <Compare onAlert={setAlertFor} onEditStores={editStores} onUpdatePrice={updatePrice} />}
        {tab === 'coupons' && <Coupons initialView={couponsView} onViewShown={() => setCouponsView(undefined)} />}
        {tab === 'basket' && <Basket onEditStores={editStores} onAddCard={() => { setCouponsView('cards'); go('coupons'); }} />}
        {tab === 'scan' && <Scan onSaveRealPrice={setPriceTarget} />}
        </Suspense>
      </main>
      <BottomNav tab={tab} onTab={go} />
      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onEditStores={() => { setSettingsOpen(false); setStoresOpen(true); }} />
      <MyStoresSheet open={storesOpen} onClose={() => setStoresOpen(false)} />
      <UpdatePriceSheet target={priceTarget} onClose={() => setPriceTarget(null)} />
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
