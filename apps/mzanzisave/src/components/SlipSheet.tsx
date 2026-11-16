import { useEffect, useState } from 'react';
import { Camera, Loader2, CheckCircle2, AlertTriangle, XCircle, RotateCcw, Sparkles } from 'lucide-react';
import { recognise } from '../lib/ocr';
import { checkSlip, sampleSlip, type SlipResult } from '../lib/slip';
import { useApp } from '../lib/state';
import { COUPONS } from '../data/coupons';
import { RETAILER_BY_ID } from '../data/retailers';
import { PRODUCT_BY_ID, productTitle } from '../data/products';
import { formatDay } from '../lib/date';
import { zar } from '../lib/format';
import { Sheet, useToast } from './ui';

/**
 * Snap the till slip right after paying. The app says at once whether it can use it,
 * and why not, so the shopper can re-snap at the till.
 */
export function SlipSheet({ open, onClose, areaAverage }: { open: boolean; onClose: () => void; areaAverage: number | null }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<SlipResult | null>(null);
  const [failed, setFailed] = useState('');
  const [logged, setLogged] = useState(false);
  const clipped = Object.values(state.clipped).filter((c) => !c.usedAt).map((c) => c.couponId);

  useEffect(() => {
    if (!open) {
      setImage(null);
      setResult(null);
      setFailed('');
      setLogged(false);
    }
  }, [open]);

  const run = (text: string) => setResult(checkSlip(text, state.basket.map((i) => i.productId), clipped));

  const onFile = async (file: File) => {
    if (image) URL.revokeObjectURL(image);
    setImage(URL.createObjectURL(file));
    setResult(null);
    setFailed('');
    setBusy('Reading your slip');
    try {
      const text = await recognise(file, (_p, status) => setBusy(status));
      run(text);
    } catch {
      setFailed('The slip reader couldn’t start. Check your connection for the first scan, then try again.');
    } finally {
      setBusy(null);
    }
  };

  // Only compare with the area average when the slip covers the whole basket; a partial slip can't be compared fairly.
  const wholeBasket = !!result && state.basket.length > 0 && result.found.length === state.basket.length;
  const saved = result?.ok && wholeBasket && result.total !== null && areaAverage !== null ? Math.max(0, Math.round((areaAverage - result.total) * 100) / 100) : null;

  const log = () => {
    if (!result?.ok || result.total === null) return;
    dispatch({ type: 'saving', entry: { amount: saved ?? 0, label: `Slip-checked shop at ${RETAILER_BY_ID[result.retailerId ?? '']?.name ?? 'store'}: paid ${zar(result.total)}`, kind: 'basket' } });
    for (const id of result.couponsFound) {
      const c = COUPONS.find((x) => x.id === id);
      if (c) dispatch({ type: 'markUsed', couponId: id, used: true, value: c.value, label: c.title });
    }
    dispatch({ type: 'points', points: 5 });
    setLogged(true);
    toast(saved ? `Logged: ${zar(saved)} saved vs the area average` : 'Shop logged from your slip');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Check my till slip" tall>
      <p className="text-sm text-muted">Snap your slip before you leave the till. We check it straight away and tell you exactly what to fix.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl bg-ink px-3 py-4 text-center font-bold text-white">
          <Camera size={24} /> {image ? 'Re-snap' : 'Snap slip'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <button onClick={() => { setImage(null); run(sampleSlip()); }} className="flex flex-col items-center gap-1 rounded-2xl border-2 border-ink px-3 py-4 text-center font-bold">
          <Sparkles size={24} /> Try a sample
        </button>
      </div>

      {image && (
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-line">
          <img src={image} alt="Your till slip" className="max-h-56 w-full object-contain" />
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/85">
              <Loader2 className="animate-spin text-save" size={26} />
              <p className="text-sm font-semibold capitalize">{busy}…</p>
            </div>
          )}
        </div>
      )}
      {failed && <p className="mt-3 rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">{failed}</p>}

      {result && (
        <section className={`mt-3 rounded-2xl border-2 p-3 ${result.ok ? 'border-save bg-save-soft' : 'border-hot bg-hot-soft'}`} aria-live="polite">
          <p className={`flex items-center gap-2 font-bold ${result.ok ? 'text-save' : 'text-hot'}`}>
            {result.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            {result.ok ? 'Slip looks good' : 'We can’t use this slip yet'}
          </p>
          {(result.retailerId || result.total !== null || result.day !== null) && (
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Store</dt><dd className="font-semibold">{result.retailerId ? RETAILER_BY_ID[result.retailerId].short : '—'}</dd></div>
              <div><dt className="text-xs text-muted">Total</dt><dd className="num font-extrabold">{result.total !== null ? zar(result.total) : '—'}</dd></div>
              <div><dt className="text-xs text-muted">Date</dt><dd className="font-semibold">{result.day !== null ? formatDay(result.day) : '—'}</dd></div>
            </dl>
          )}
          {result.issues.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-sm">
              {result.issues.map((i) => (
                <li key={i.text} className="flex gap-2">
                  {i.level === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0 text-hot" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />}
                  <span>{i.text}</span>
                </li>
              ))}
            </ul>
          )}
          {result.ok && (
            <>
              <p className="mt-2 text-sm">
                Found {result.found.length} of {state.basket.length} basket items
                {result.couponsFound.length > 0 && `, and ${result.couponsFound.length} clipped coupon item${result.couponsFound.length > 1 ? 's' : ''}`}.
              </p>
              {result.couponsFound.length > 0 && (
                <ul className="mt-1 text-xs text-save">
                  {result.couponsFound.map((id) => {
                    const c = COUPONS.find((x) => x.id === id)!;
                    return <li key={id}>✓ {c.title}{c.productIds ? ` (${productTitle(PRODUCT_BY_ID[c.productIds[0]])})` : ''}</li>;
                  })}
                </ul>
              )}
              {!wholeBasket && state.basket.length > 0 && (
                <p className="mt-2 text-xs text-muted">This slip doesn't have your whole basket on it, so we won't compare it with the area average. Your spend is still logged.</p>
              )}
              {saved !== null && (
                <p className="mt-2 text-sm">
                  Area average for your basket: <span className="num font-bold">{zar(areaAverage!)}</span>. You paid <span className="num font-bold">{zar(result.total!)}</span>
                  {saved > 0 ? <>, saving <span className="num font-extrabold text-save">{zar(saved)}</span>.</> : '.'}
                </p>
              )}
              <button onClick={log} disabled={logged} className="mt-3 w-full rounded-2xl bg-save py-3.5 font-bold text-white disabled:opacity-60">
                {logged ? 'Logged' : result.couponsFound.length ? 'Log shop and mark coupons used' : 'Log this shop'}
              </button>
            </>
          )}
          {!result.ok && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold"><RotateCcw size={14} /> Fix that and tap Re-snap while you're still at the till.</p>
          )}
        </section>
      )}
    </Sheet>
  );
}
