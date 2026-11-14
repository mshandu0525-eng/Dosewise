import { BRANCHES } from '../data/branches';
import { PRODUCT_BY_ID } from '../data/products';
import { getOffer, priceOf, type Offer } from '../data/prices';
import type { PriceAlert } from './state';

/** Cheapest current offer for a product across the whole city. */
export function cheapestInCity(productId: string, cityId: string, today: number): Offer | null {
  const p = PRODUCT_BY_ID[productId];
  if (!p) return null;
  let best: Offer | null = null;
  for (const b of BRANCHES) {
    if (b.cityId !== cityId) continue;
    const o = getOffer(p, b, today);
    if (o && (!best || priceOf(o) < priceOf(best))) best = o;
  }
  return best;
}

export interface FiredAlert {
  alert: PriceAlert;
  offer: Offer;
}

/** Alerts whose target price is met today and that haven't fired for today's price yet. */
export function dueAlerts(alerts: Record<string, PriceAlert>, cityId: string, today: number): FiredAlert[] {
  const out: FiredAlert[] = [];
  for (const a of Object.values(alerts)) {
    const o = cheapestInCity(a.productId, cityId, today);
    if (!o || priceOf(o) > a.target) continue;
    if (a.firedDay === today && a.firedPrice === priceOf(o)) continue;
    out.push({ alert: a, offer: o });
  }
  return out;
}

export async function systemNotify(title: string, body: string): Promise<void> {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: title });
    else new Notification(title, { body });
  } catch {
    /* notifications unavailable here: the in-app banner still shows */
  }
}
