import { useEffect, useMemo, useState } from 'react';
import { Camera, FileText, Loader2, Sparkles, TrendingDown, TrendingUp, Plus, Megaphone, ImageUp } from 'lucide-react';
import { parseTag, recognise, SAMPLE_TAGS, type ParsedTag } from '../lib/ocr';
import { useArea } from '../lib/useArea';
import { useApp } from '../lib/state';
import { distinctStores } from '../lib/basket';
import { PRODUCTS, GROUP_LABELS, productTitle } from '../data/products';
import { offersFor, priceOf, unitOf, type Offer } from '../data/prices';
import { RETAILERS, RETAILER_BY_ID } from '../data/retailers';
import { formatUnitPrice, packLabel, zar, type PackSize } from '../lib/format';
import { StorePill, useToast } from '../components/ui';

export function Scan() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const { branches, today } = useArea();
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ p: number; status: string } | null>(null);
  const [error, setError] = useState('');
  const [tag, setTag] = useState<ParsedTag | null>(null);
  // Editable fields after extraction
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [sizeQty, setSizeQty] = useState('');
  const [sizeUnit, setSizeUnit] = useState<'kg' | 'L' | 'each'>('kg');
  const [store, setStore] = useState('');
  const [storeName, setStoreName] = useState('');

  useEffect(() => () => { if (image) URL.revokeObjectURL(image); }, [image]);

  const applyParse = (raw: string) => {
    const t = parseTag(raw);
    setTag(t);
    setName(t.name);
    setPrice(t.price ? t.price.toFixed(2) : '');
    setSizeQty(t.size ? String(+t.size.qty.toFixed(3)) : '');
    setSizeUnit(t.size?.unit ?? 'kg');
    setStore(t.retailerId ?? 'local');
    setStoreName('');
  };

  const onFile = async (file: File) => {
    setError('');
    setTag(null);
    if (image) URL.revokeObjectURL(image);
    setImage(URL.createObjectURL(file));
    setBusy({ p: 0, status: 'Starting the scanner' });
    try {
      const raw = await recognise(file, (p, status) => setBusy({ p, status }));
      setText(raw.trim());
      applyParse(raw);
      if (!raw.trim()) setError('No text found. Try a sharper photo, closer to the tag, or type the details below.');
    } catch {
      setError('The scanner couldn’t start here. Type or paste the tag text below and we’ll still read it.');
    } finally {
      setBusy(null);
    }
  };

  const size: PackSize | null = Number(sizeQty) > 0 ? { qty: Number(sizeQty), unit: sizeUnit, countLabel: sizeUnit === 'each' ? 'item' : undefined } : null;
  const priceNum = Number(price.replace(',', '.'));
  const match = tag?.match ?? null;

  const comparison = useMemo(() => {
    if (!match || !size) return [] as Offer[];
    const stores = distinctStores(branches);
    return PRODUCTS.filter((p) => p.group === match.group && p.size.unit === size.unit)
      .flatMap((p) => offersFor(p, stores, today))
      .sort((a, b) => unitOf(a) - unitOf(b));
  }, [match, size?.unit, branches, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const scannedUnit = size && priceNum > 0 ? priceNum / size.qty : null;
  const cheapest = comparison[0];
  const avgUnit = comparison.length ? comparison.reduce((s, o) => s + unitOf(o), 0) / comparison.length : null;
  const cheaperCount = scannedUnit ? comparison.filter((o) => unitOf(o) < scannedUnit - 0.005).length : 0;

  const post = () => {
    if (!(priceNum > 0) || !name.trim()) return;
    const sName = store === 'local' ? storeName.trim() || 'Local store' : RETAILER_BY_ID[store]?.name ?? 'Store';
    dispatch({
      type: 'communityAdd',
      deal: { id: `cd-${Date.now()}`, at: Date.now(), name: name.trim(), size, price: priceNum, wasPrice: tag?.wasPrice ?? null, storeName: sName, retailerId: store, cityId: state.area.cityId, group: match?.group ?? null },
    });
    toast('Saved to your Deals feed. Share it from there.');
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="display text-2xl font-black">Snap & Compare</h1>
        <p className="text-sm text-muted">Photograph a shelf tag or a pamphlet special. We read the product, size, store and price, and check it against specials near you.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl bg-ink px-3 py-5 text-center font-bold text-white">
          <Camera size={28} /> Take photo
          <span className="text-[11px] font-normal opacity-80">Shelf tag or flyer</span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-ink bg-card px-3 py-5 text-center font-bold">
          <ImageUp size={28} /> Upload
          <span className="text-[11px] font-normal text-muted">From your gallery</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">Text is read on your phone. Photos are never uploaded. The first scan downloads the reader (about 7 MB), then it works offline.</p>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={16} className="text-save" /> No tag handy? Try a sample</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {SAMPLE_TAGS.map((s) => (
            <button
              key={s.label}
              onClick={() => { setImage(null); setError(''); setText(s.text); applyParse(s.text); }}
              className="shrink-0 rounded-full border border-line bg-card px-3.5 py-2 text-sm font-semibold"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {(image || busy) && (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-card">
          {image && <img src={image} alt="Your photo of the price tag" className="max-h-64 w-full object-contain" />}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/85 p-4 text-center">
              <Loader2 className="animate-spin text-save" size={28} />
              <p className="text-sm font-semibold capitalize">{busy.status}…</p>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-line"><div className="h-full bg-save transition-all" style={{ width: `${Math.round(busy.p * 100)}%` }} /></div>
            </div>
          )}
        </div>
      )}
      {error && <p className="rounded-xl bg-warn-soft p-3 text-sm font-semibold text-warn">{error}</p>}

      <details className="rounded-2xl border border-line bg-card p-3" open={!!text && !tag}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold"><FileText size={16} /> Text we read {text ? '' : '(or type it)'}</summary>
        <textarea
          id="scan-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={'e.g.\nBOXER\nSunfoil 2L\nR59.99'}
          className="mt-2 w-full rounded-xl border border-line bg-paper p-3 font-mono text-sm outline-none focus:border-ink"
        />
        <button onClick={() => applyParse(text)} disabled={!text.trim()} className="mt-2 w-full rounded-xl bg-ink py-2.5 text-sm font-bold text-white disabled:opacity-40">Read this text</button>
      </details>

      {tag && (
        <section className="rounded-2xl border-2 border-ink bg-card p-3">
          <h2 className="display text-lg font-extrabold">What we found</h2>
          <p className="text-xs text-muted">Check and fix anything that looks wrong.</p>
          <label htmlFor="scan-name" className="mt-2 block text-xs font-bold text-muted uppercase">Product</label>
          <input id="scan-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 w-full rounded-xl border border-line px-3 py-2.5 font-semibold" />
          {match && (
            <p className={`mt-1 text-xs ${tag.confidence >= 0.6 ? 'text-save' : 'text-warn'}`}>
              Matched to {productTitle(match)} {packLabel(match.size)} ({GROUP_LABELS[match.group]}){tag.confidence < 0.6 ? ': low confidence, please check' : ''}
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="scan-price" className="block text-xs font-bold text-muted uppercase">Price</label>
              <div className="mt-0.5 flex items-center rounded-xl border border-line px-2">
                <span className="num font-extrabold">R</span>
                <input id="scan-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="num w-full min-w-0 bg-transparent py-2.5 pl-1 text-lg font-extrabold outline-none" />
              </div>
              {tag.wasPrice && <p className="num mt-0.5 text-xs text-muted">Was {zar(tag.wasPrice)}</p>}
            </div>
            <div>
              <label htmlFor="scan-size" className="block text-xs font-bold text-muted uppercase">Pack size</label>
              <div className="mt-0.5 flex gap-1">
                <input id="scan-size" inputMode="decimal" value={sizeQty} onChange={(e) => setSizeQty(e.target.value)} className="num w-full min-w-0 rounded-xl border border-line px-2 py-2.5 text-lg font-extrabold" />
                <select id="scan-unit" value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value as 'kg' | 'L' | 'each')} className="rounded-xl border border-line bg-card px-1 font-semibold" aria-label="Unit">
                  <option value="kg">kg</option><option value="L">L</option><option value="each">items</option>
                </select>
              </div>
            </div>
          </div>
          <label htmlFor="scan-store" className="mt-2 block text-xs font-bold text-muted uppercase">Store</label>
          <select id="scan-store" value={store} onChange={(e) => setStore(e.target.value)} className="mt-0.5 w-full rounded-xl border border-line bg-card px-3 py-2.5 font-semibold">
            {RETAILERS.map((r) => <option key={r.id} value={r.id}>{r.tier === 'independent' ? 'Local / independent store' : r.name}</option>)}
          </select>
          {store === 'local' && (
            <input id="scan-store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Store name, e.g. Bismillah Superette" className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5" />
          )}
          {scannedUnit && size && <p className="num mt-2 text-lg font-extrabold">= {formatUnitPrice(priceNum, size)}</p>}
        </section>
      )}

      {tag && scannedUnit && size && (
        <section className="flex flex-col gap-2">
          {comparison.length === 0 ? (
            <p className="rounded-2xl border border-line bg-card p-3 text-sm text-muted">We couldn't find this product in stores near you. You can still save it for your area.</p>
          ) : (
            <div className={`rounded-2xl p-4 ${cheaperCount === 0 ? 'bg-save text-white' : 'border-2 border-warn bg-warn-soft'}`}>
              {cheaperCount === 0 ? (
                <>
                  <p className="flex items-center gap-1.5 font-bold"><TrendingDown size={18} /> Great price: cheapest near you</p>
                  <p className="mt-1 text-sm opacity-95">
                    {avgUnit && `${Math.round((1 - scannedUnit / avgUnit) * 100)}% below the area average of R${avgUnit.toFixed(2)} / ${size.unit === 'each' ? 'item' : size.unit}.`}
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 font-bold text-warn"><TrendingUp size={18} /> {cheaperCount} cheaper option{cheaperCount > 1 ? 's' : ''} nearby</p>
                  <p className="mt-1 text-sm">
                    Best: <span className="font-semibold">{productTitle(cheapest.product)} {packLabel(cheapest.product.size)}</span> at {cheapest.branch.name} for{' '}
                    <span className="num font-extrabold">{zar(priceOf(cheapest))}</span> ({formatUnitPrice(priceOf(cheapest), cheapest.product.size)}).
                  </p>
                </>
              )}
            </div>
          )}
          {comparison.slice(0, 5).map((o) => (
            <div key={`${o.branch.id}-${o.product.id}`} className="flex items-center gap-2 rounded-2xl border border-line bg-card p-2.5">
              <StorePill retailerId={o.branch.retailerId} size="xs" label={o.branch.retailerId === 'local' ? 'Local' : undefined} />
              <span className="min-w-0 flex-1 truncate text-sm">{productTitle(o.product)} {packLabel(o.product.size)}</span>
              <span className="shrink-0 text-right">
                <span className="num block text-sm font-extrabold">{zar(priceOf(o))}</span>
                <span className={`num block text-[11px] font-semibold ${unitOf(o) < scannedUnit ? 'text-save' : 'text-muted'}`}>{formatUnitPrice(priceOf(o), o.product.size)}</span>
              </span>
              <button onClick={() => { dispatch({ type: 'basketAdd', productId: o.product.id }); toast('Added to basket'); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper" aria-label="Add to basket">
                <Plus size={16} />
              </button>
            </div>
          ))}
          <button onClick={post} className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 font-bold text-white">
            <Megaphone size={18} /> Add to my area's deals
          </button>
          <p className="text-center text-xs text-muted">Store owners: snap your own specials to list them for shoppers nearby.</p>
        </section>
      )}
    </div>
  );
}
