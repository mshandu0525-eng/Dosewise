import { useEffect, useRef, useState } from 'react';
import { Tag, Scale, Ticket, ShoppingBasket, ScanLine, MapPin, ChevronDown, PiggyBank } from 'lucide-react';
import { useApp } from '../lib/state';
import { zar } from '../lib/format';
import { monthName, todaySA } from '../lib/date';

export type Tab = 'deals' | 'compare' | 'coupons' | 'basket' | 'scan';

const TABS: { id: Tab; label: string; Icon: typeof Tag }[] = [
  { id: 'deals', label: 'Deals', Icon: Tag },
  { id: 'compare', label: 'Compare', Icon: Scale },
  { id: 'coupons', label: 'Coupons', Icon: Ticket },
  { id: 'basket', label: 'My Basket', Icon: ShoppingBasket },
  { id: 'scan', label: 'Scan/Add', Icon: ScanLine },
];

export function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { state } = useApp();
  const count = state.basket.reduce((s, i) => s + i.qty, 0);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <li key={id}>
              <button
                onClick={() => onTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? 'text-save' : 'text-muted'}`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full ${active ? 'bg-save-soft' : ''}`}>
                  <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
                {id === 'basket' && count > 0 && (
                  <span className="num absolute top-1.5 left-[calc(50%+6px)] min-w-5 rounded-full bg-hot px-1.5 text-[11px] leading-5 font-bold text-white">{count}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Counts up to the new total so a saving visibly lands. */
function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setShown(start + (value - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

export function Header({ areaLabel, radius, onLocation, onSavings }: { areaLabel: string; radius: number; onLocation: () => void; onSavings: () => void }) {
  const { savedThisMonth } = useApp();
  const shown = useCountUp(savedThisMonth);
  const [bump, setBump] = useState(false);
  const prev = useRef(savedThisMonth);
  useEffect(() => {
    if (savedThisMonth > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 400);
      prev.current = savedThisMonth;
      return () => clearTimeout(t);
    }
    prev.current = savedThisMonth;
  }, [savedThisMonth]);

  return (
    <header
      className="sticky z-30 border-b border-line bg-card"
      style={{ top: 'env(safe-area-inset-top, 0px)', paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="display text-xl leading-none font-black tracking-tight">
            Mzanzi<span className="text-save">Save</span>
          </p>
          <button onClick={onLocation} className="mt-1 flex max-w-full items-center gap-1 text-[13px] font-semibold text-muted" aria-label={`Change area, currently ${areaLabel}`}>
            <MapPin size={14} className="shrink-0 text-save" />
            <span className="truncate">{areaLabel}</span>
            <span className="shrink-0">· {radius} km</span>
            <ChevronDown size={14} className="shrink-0" />
          </button>
        </div>
        <button onClick={onSavings} className="flex shrink-0 items-center gap-2 rounded-2xl bg-save-soft py-1.5 pr-3 pl-2 text-left" aria-label="Total saved this month">
          <PiggyBank size={26} className={`text-save ${bump ? 'pop' : ''}`} />
          <span>
            <span className="block text-[10px] font-bold tracking-wide text-save uppercase">Saved in {monthName(todaySA()).slice(0, 3)}</span>
            <span className="num block text-lg leading-tight font-extrabold text-save">{zar(shown)}</span>
          </span>
        </button>
      </div>
    </header>
  );
}
