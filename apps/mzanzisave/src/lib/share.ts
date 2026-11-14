import { zar, packLabel, formatUnitPrice, percentOff } from './format';
import { productTitle } from '../data/products';
import { formatDay } from './date';
import type { Offer } from '../data/prices';
import type { SplitPlan, StorePlan } from './basket';
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
  if (o.validTo !== undefined) lines.push(o.validTo <= today + 1 ? `⏰ Ends ${o.validTo === today ? 'TODAY' : 'tomorrow'}!` : `📅 Valid until ${formatDay(o.validTo)}`);
  lines.push('', '_Found on MzanziSave: compare SA grocery specials_');
  return lines.join('\n');
}

export function basketText(items: BasketItem[], area: string, best: StorePlan | undefined, split: SplitPlan | null, travel: number): string {
  const lines = [`🛒 *My MzanziSave basket* (${items.reduce((s, i) => s + i.qty, 0)} items)`, `📍 ${area}`, ''];
  items.forEach((i, n) => {
    const p = PRODUCT_BY_ID[i.productId];
    if (p) lines.push(`${n + 1}. ${productTitle(p)} ${packLabel(p.size)}${i.qty > 1 ? ` × ${i.qty}` : ''}`);
  });
  lines.push('');
  if (best) {
    lines.push(`💰 *Cheapest one-stop shop:* ${best.branch.name}: *${zar(best.total)}*`);
    if (best.missing) lines.push(`   (${best.missing} item${best.missing > 1 ? 's' : ''} not stocked there)`);
  }
  if (split?.worthIt) {
    lines.push(`✂️ *Split & Save:* ${split.a.branch.name} + ${split.b.branch.name}: *${zar(split.total)}*`);
    lines.push(`   Saves ${zar(split.netSaving)} after ${zar(travel)} taxi/travel`);
  } else if (split) {
    lines.push(`✂️ Splitting across 2 stores isn't worth it after ${zar(travel)} travel.`);
  }
  lines.push('', '_Compared on MzanziSave_');
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
