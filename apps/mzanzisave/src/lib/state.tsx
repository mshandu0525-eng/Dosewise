import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { AreaFilter } from '../data/branches';
import type { BasketItem } from './basket';
import type { PackSize } from './format';
import { monthKey, todaySA } from './date';

export interface PriceAlert {
  productId: string;
  target: number;
  createdDay: number;
  /** Day it last fired, so it only notifies once per price drop. */
  firedDay?: number;
  firedPrice?: number;
  firedStore?: string;
}

export interface ClippedCoupon {
  couponId: string;
  clippedAt: number;
  usedAt?: number;
}

export interface LoyaltyCard {
  id: string;
  program: string;
  number: string;
  format: 'CODE128' | 'EAN13';
  holder?: string;
}

export interface SavingEntry {
  id: string;
  at: number;
  month: string;
  amount: number;
  label: string;
  kind: 'coupon' | 'basket';
}

export interface CommunityDeal {
  id: string;
  at: number;
  name: string;
  size: PackSize | null;
  price: number;
  wasPrice: number | null;
  storeName: string;
  retailerId: string | null;
  cityId: string;
  group: string | null;
}

export interface AppState {
  version: 1;
  deviceId: string;
  area: AreaFilter;
  dataSaver: boolean;
  basket: BasketItem[];
  travelCost: number;
  alerts: Record<string, PriceAlert>;
  clipped: Record<string, ClippedCoupon>;
  loyalty: LoyaltyCard[];
  savings: SavingEntry[];
  community: CommunityDeal[];
  seenIntro: boolean;
}

const KEY = 'mzanzisave:v1';

function initial(): AppState {
  return {
    version: 1,
    deviceId: Math.random().toString(36).slice(2, 10),
    area: { cityId: 'jhb', suburbId: 'soweto', radiusKm: 5, nearTaxi: false, inMall: false, openNow: false },
    dataSaver: false,
    // A realistic month-end starter basket so the optimiser has something to show.
    basket: [
      { productId: 'whitestar-10', qty: 1 },
      { productId: 'sunfoil-2', qty: 1 },
      { productId: 'selati-2.5', qty: 1 },
      { productId: 'tastic-2', qty: 1 },
      { productId: 'rainbow-iqf-2', qty: 1 },
      { productId: 'clover-fc-2', qty: 2 },
      { productId: 'albany-white', qty: 2 },
      { productId: 'potatoes-7', qty: 1 },
    ],
    travelCost: 20,
    alerts: {},
    clipped: {},
    loyalty: [],
    savings: [],
    community: [],
    seenIntro: false,
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      if (parsed.version === 1) return { ...initial(), ...parsed, area: { ...initial().area, ...parsed.area } };
    }
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  return initial();
}

type Action =
  | { type: 'area'; area: Partial<AreaFilter> }
  | { type: 'dataSaver'; on: boolean }
  | { type: 'basketAdd'; productId: string; qty?: number }
  | { type: 'basketQty'; productId: string; qty: number }
  | { type: 'basketClear' }
  | { type: 'travel'; cost: number }
  | { type: 'alertSet'; alert: PriceAlert }
  | { type: 'alertRemove'; productId: string }
  | { type: 'alertFired'; productId: string; day: number; price: number; store: string }
  | { type: 'clip'; couponId: string }
  | { type: 'unclip'; couponId: string }
  | { type: 'markUsed'; couponId: string; used: boolean; value: number; label: string }
  | { type: 'loyaltyAdd'; card: LoyaltyCard }
  | { type: 'loyaltyRemove'; id: string }
  | { type: 'saving'; entry: Omit<SavingEntry, 'id' | 'at' | 'month'> }
  | { type: 'communityAdd'; deal: CommunityDeal }
  | { type: 'communityRemove'; id: string }
  | { type: 'seenIntro' }
  | { type: 'reset' };

function reducer(s: AppState, a: Action): AppState {
  const now = Date.now();
  switch (a.type) {
    case 'area':
      return { ...s, area: { ...s.area, ...a.area } };
    case 'dataSaver':
      return { ...s, dataSaver: a.on };
    case 'basketAdd': {
      const found = s.basket.find((i) => i.productId === a.productId);
      return {
        ...s,
        basket: found
          ? s.basket.map((i) => (i.productId === a.productId ? { ...i, qty: i.qty + (a.qty ?? 1) } : i))
          : [...s.basket, { productId: a.productId, qty: a.qty ?? 1 }],
      };
    }
    case 'basketQty':
      return {
        ...s,
        basket: a.qty <= 0 ? s.basket.filter((i) => i.productId !== a.productId) : s.basket.map((i) => (i.productId === a.productId ? { ...i, qty: a.qty } : i)),
      };
    case 'basketClear':
      return { ...s, basket: [] };
    case 'travel':
      return { ...s, travelCost: a.cost };
    case 'alertSet':
      return { ...s, alerts: { ...s.alerts, [a.alert.productId]: a.alert } };
    case 'alertRemove': {
      const { [a.productId]: _, ...rest } = s.alerts;
      return { ...s, alerts: rest };
    }
    case 'alertFired': {
      const al = s.alerts[a.productId];
      if (!al) return s;
      return { ...s, alerts: { ...s.alerts, [a.productId]: { ...al, firedDay: a.day, firedPrice: a.price, firedStore: a.store } } };
    }
    case 'clip':
      return { ...s, clipped: { ...s.clipped, [a.couponId]: { couponId: a.couponId, clippedAt: now } } };
    case 'unclip': {
      const { [a.couponId]: _, ...rest } = s.clipped;
      return { ...s, clipped: rest, savings: s.savings.filter((e) => e.id !== `coupon:${a.couponId}`) };
    }
    case 'markUsed': {
      const c = s.clipped[a.couponId] ?? { couponId: a.couponId, clippedAt: now };
      const id = `coupon:${a.couponId}`;
      const savings = s.savings.filter((e) => e.id !== id);
      if (a.used) savings.push({ id, at: now, month: monthKey(todaySA(now)), amount: a.value, label: a.label, kind: 'coupon' });
      return { ...s, clipped: { ...s.clipped, [a.couponId]: { ...c, usedAt: a.used ? now : undefined } }, savings };
    }
    case 'loyaltyAdd':
      return { ...s, loyalty: [...s.loyalty.filter((c) => c.id !== a.card.id), a.card] };
    case 'loyaltyRemove':
      return { ...s, loyalty: s.loyalty.filter((c) => c.id !== a.id) };
    case 'saving':
      return { ...s, savings: [...s.savings, { ...a.entry, id: `basket:${now}`, at: now, month: monthKey(todaySA(now)) }] };
    case 'communityAdd':
      return { ...s, community: [a.deal, ...s.community].slice(0, 100) };
    case 'communityRemove':
      return { ...s, community: s.community.filter((d) => d.id !== a.id) };
    case 'seenIntro':
      return { ...s, seenIntro: true };
    case 'reset':
      return { ...initial(), deviceId: s.deviceId };
  }
}

interface Ctx {
  state: AppState;
  dispatch: (a: Action) => void;
  /** Rand saved in the current calendar month. */
  savedThisMonth: number;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const dispatch = useCallback((a: Action) => rawDispatch(a), []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the app keeps working for this visit */
    }
  }, [state]);
  const savedThisMonth = useMemo(() => {
    const m = monthKey(todaySA());
    return Math.round(state.savings.filter((e) => e.month === m).reduce((s, e) => s + e.amount, 0) * 100) / 100;
  }, [state.savings]);
  const value = useMemo(() => ({ state, dispatch, savedThisMonth }), [state, dispatch, savedThisMonth]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}
