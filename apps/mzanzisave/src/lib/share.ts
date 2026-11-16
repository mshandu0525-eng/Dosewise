import { zar, packLabel, formatUnitPrice, percentOff } from './format';
import { productTitle } from '../data/products';
import { formatDay } from './date';
import { ageLabel } from './reports';
import type { Offer } from '../data/prices';
import { travelLabel, type RankedStore, type SplitResult, type TravelSettings } from './final';
import { PRODUCT_BY_ID } from '../data/products';
import type { BasketItem } from './basket';

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function dealText(o: Offer, today: number): string {
  const price = o.special ?? o.regular;
  const lines = [
    `🔥 *Hot deal at ${o.branch.name}*`,
    `${productTitle(o.product)} ${packLabel(o.product.size)}`,
    o.special ? `~${zar(o.regular)}~ *${zar(price)}* (${percentOff(o.regular, price)}% off)` : `*${zar(price)}*`,
    `Works out to ${formatUnitPrice(price, o.product.size)}`,
  ];
  if (o.loyalty) lines.push(`💳 ${o.loyalty} card price`);
  if (o.reported) lines.push(o.reported.source === 'store' ? '🏪 Price confirmed by the store' : `✅ Real shelf price, checked ${ageLabel(o.reported.at)}`);
  if (o.validTo !== undefined) lines.push(o.validTo <= today + 1 ? `⏰ Ends ${o.validTo === today ? 'TODAY' : 'tomorrow'}!` : `📅 Valid until ${formatDay(o.validTo)}`);
  lines.push('', '_Found on MzanziSave: compare SA grocery specials_');
  return lines.join('\n');
}

export function basketText(items: BasketItem[], area: string, best: RankedStore | undefined, split: SplitResult | null, travel: TravelSettings): string {
  const lines = [`🛒 *My MzanziSave basket* (${items.reduce((s, i) => s + i.qty, 0)} items)`, `📍 ${area}`, ''];
  items.forEach((i, n) => {
    const p = PRODUCT_BY_ID[i.productId];
    if (p) lines.push(`${n + 1}. ${productTitle(p)} ${packLabel(p.size)}${i.qty > 1 ? ` × ${i.qty}` : ''}`);
  });
  lines.push('');
  if (best) {
    lines.push(`💰 *Best plan:* ${best.plan.branch.name}`);
    lines.push(`   Final price *${zar(best.price.final)}* (till ${zar(best.price.till)} + trip ${zar(best.price.trip)}, ${travelLabel(travel)})`);
    if (best.price.missing) lines.push(`   (${best.price.missing} item${best.price.missing > 1 ? 's' : ''} not available there)`);
  }
  if (split?.worthIt) {
    lines.push(`✂️ *Split & Save:* ${split.a.name} + ${split.b.name}: *${zar(split.price.final)}*`);
    lines.push(`   Saves ${zar(split.netSaving)} more, after the longer trip`);
  } else if (split) {
    lines.push('✂️ A second store isn\'t worth it after travel.');
  }
  lines.push('', '_Final prices include specials, loyalty cards, coupons and the trip. Compared on MzanziSave_');
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
