import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { X, Sun, CheckCircle2, Circle } from 'lucide-react';

export function Barcode({ value, format = 'CODE128', height = 90 }: { value: string; format?: 'CODE128' | 'EAN13'; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format, height, width: 2.4, margin: 12, displayValue: true, fontSize: 18, font: 'monospace', background: '#ffffff', lineColor: '#000000' });
      setError(false);
    } catch {
      try {
        JsBarcode(ref.current, value, { format: 'CODE128', height, width: 2.2, margin: 12, displayValue: true, fontSize: 18, background: '#ffffff', lineColor: '#000000' });
        setError(false);
      } catch {
        setError(true);
      }
    }
  }, [value, format, height]);
  if (error) return <p className="text-sm text-hot">This number can't be shown as a barcode. Check the digits.</p>;
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} className="h-auto w-full max-w-full" />;
}

/** Keep the screen on while a code is being scanned at the till. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        /* not allowed here; the screen may dim */
      }
    };
    req();
    const vis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

export interface TillCode {
  heading: string;
  subheading: string;
  barcode: string;
  format?: 'CODE128' | 'EAN13';
  qr?: string;
  promo?: string;
  instructions?: string[];
  note?: string;
}

/** Full-screen, high-contrast till view: barcode, QR, promo code and cashier steps. */
export function TillScreen({ code, onClose, used, onToggleUsed }: { code: TillCode | null; onClose: () => void; used?: boolean; onToggleUsed?: () => void }) {
  useWakeLock(!!code);
  if (!code) return null;
  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-white text-black" role="dialog" aria-modal="true" aria-label={code.heading}>
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider text-save uppercase">Show at till</p>
            <h2 className="display text-2xl leading-tight font-black">{code.heading}</h2>
            <p className="text-sm text-neutral-600">{code.subheading}</p>
          </div>
          <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neutral-100" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700">
          <Sun size={16} className="shrink-0" /> Turn your screen brightness up so the scanner reads it first time.
        </p>
        <div className="mt-4 rounded-2xl border-2 border-black p-2">
          <Barcode value={code.barcode} format={code.format} height={110} />
        </div>
        {(code.qr || code.promo) && (
          <div className="mt-4 flex items-center gap-4">
            {code.qr && (
              <div className="shrink-0 rounded-xl border-2 border-black bg-white p-2">
                <QRCodeSVG value={code.qr} size={128} level="M" marginSize={1} />
              </div>
            )}
            {code.promo && (
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wider text-neutral-600 uppercase">Promo code</p>
                <p className="num text-4xl font-black tracking-[0.15em]">{code.promo.slice(0, 3)} {code.promo.slice(3)}</p>
              </div>
            )}
          </div>
        )}
        {code.instructions && (
          <div className="mt-4 rounded-2xl bg-neutral-100 p-3">
            <p className="text-sm font-bold">For the cashier</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
              {code.instructions.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
        )}
        {onToggleUsed && (
          <button
            onClick={onToggleUsed}
            aria-pressed={used}
            className={`mt-4 flex items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold ${used ? 'bg-save text-white' : 'border-2 border-black'}`}
          >
            {used ? <CheckCircle2 size={22} /> : <Circle size={22} />} {used ? 'Used: saving added' : 'Mark as used'}
          </button>
        )}
        {code.note && <p className="mt-3 text-center text-xs text-neutral-500">{code.note}</p>}
      </div>
    </div>
  );
}
