export type Unit = 'kg' | 'L' | 'each';

/** "R 24.99" — high-contrast ZAR price with a space after the R, as on SA shelf tags. */
export function zar(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${amount < 0 ? '-' : ''}R ${grouped}.${cents}`;
}

/** Compact form for unit prices: "R14.50" */
export function zarCompact(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

/** Pack size in its base unit: kg, L or count. */
export interface PackSize {
  /** Quantity in the base unit (kg, L or items). */
  qty: number;
  unit: Unit;
  /** Display label for counted items, e.g. "nappy", "roll", "bag". */
  countLabel?: string;
}

export function packLabel(p: PackSize): string {
  if (p.unit === 'kg') return p.qty < 1 ? `${Math.round(p.qty * 1000)}g` : `${trim(p.qty)}kg`;
  if (p.unit === 'L') return p.qty < 1 ? `${Math.round(p.qty * 1000)}ml` : `${trim(p.qty)}L`;
  return `${trim(p.qty)} ${p.countLabel ? plural(p.countLabel, p.qty) : 'items'}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(2));
}

function plural(word: string, n: number): string {
  if (n === 1) return word;
  if (word.endsWith('y') && !/[aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
  return word + 's';
}

/** Price per kg / L / item. */
export function unitPrice(price: number, p: PackSize): number {
  return price / p.qty;
}

export function unitLabel(p: PackSize): string {
  if (p.unit === 'each') return p.countLabel ?? 'each';
  return p.unit;
}

/** "R14.50 / kg" */
export function formatUnitPrice(price: number, p: PackSize): string {
  return `${zarCompact(unitPrice(price, p))} / ${unitLabel(p)}`;
}

export function percentOff(regular: number, special: number): number {
  return Math.round((1 - special / regular) * 100);
}
