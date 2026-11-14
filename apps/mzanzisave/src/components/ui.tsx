import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { RETAILER_BY_ID } from '../data/retailers';
import type { Product } from '../data/products';
import { useApp } from '../lib/state';

export function StorePill({ retailerId, label, size = 'sm' }: { retailerId: string | null; label?: string; size?: 'xs' | 'sm' }) {
  const r = retailerId ? RETAILER_BY_ID[retailerId] : null;
  const text = label ?? r?.short ?? 'Local';
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-full font-semibold leading-none ${size === 'xs' ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
      style={{ background: r?.bg ?? '#374151', color: r?.fg ?? '#fff' }}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}

const TILE_TINTS: Record<string, string> = {
  staples: '#fbf3dc', meat: '#fde7e2', produce: '#e6f6e4', baby: '#e8f0fd', toiletries: '#eef0fb', beverages: '#e2f4f6',
};

/** Light product picture: an emoji on a tinted tile. Hidden in Data-Saver mode. */
export function Thumb({ product, size = 56 }: { product: Product; size?: number }) {
  const { state } = useApp();
  if (state.dataSaver) return null;
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-xl"
      style={{ width: size, height: size, background: TILE_TINTS[product.category], fontSize: size * 0.5 }}
    >
      {product.emoji}
    </div>
  );
}

export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title: string; children: ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`sheet-in w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card shadow-2xl outline-none ${tall ? 'max-h-[92dvh]' : 'max-h-[85dvh]'}`}
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-4 py-3">
          <h2 className="display text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-paper" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="px-4 pt-3">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-2xl bg-line/70 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl px-2 py-2.5 text-sm font-semibold transition ${value === o.value ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${active ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink'}`}
    >
      {children}
    </button>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-card px-6 py-10 text-center">
      <div className="text-muted">{icon}</div>
      <p className="display text-base font-bold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

/* ---------- Toasts ---------- */

interface ToastMsg {
  id: number;
  text: string;
  tone: 'ok' | 'info' | 'warn';
}
const ToastCtx = createContext<(text: string, tone?: ToastMsg['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: ToastMsg['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }} aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`sheet-in max-w-md rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${t.tone === 'ok' ? 'bg-save' : t.tone === 'warn' ? 'bg-warn' : 'bg-ink'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
