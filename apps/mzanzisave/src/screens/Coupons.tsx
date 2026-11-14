import { useMemo, useState } from 'react';
import { Scissors, Check, Ticket, Users, Minus, Plus, CreditCard, Trash2, ScanBarcode, Factory, Store, Package, WifiOff } from 'lucide-react';
import { COUPONS, couponCodes, couponEnd, type Coupon } from '../data/coupons';
import { PRODUCT_BY_ID, productTitle } from '../data/products';
import { RETAILER_BY_ID } from '../data/retailers';
import { shelfPrice } from '../data/prices';
import { packLabel, zar } from '../lib/format';
import { useApp, type LoyaltyCard } from '../lib/state';
import { useArea } from '../lib/useArea';
import { ExpiryChip } from '../components/OfferCard';
import { Empty, Segmented, StorePill, useToast } from '../components/ui';
import { Barcode, TillScreen } from '../components/Codes';

type View = 'browse' | 'wallet' | 'cards';

export function comboRegular(c: Coupon): number {
  if (!c.combo) return 0;
  const r = RETAILER_BY_ID[c.retailerIds[0]];
  return Math.round(
    c.combo.items.reduce((s, i) => s + shelfPrice(PRODUCT_BY_ID[i.productId].base * (r?.priceLevel ?? 1) * (r?.categoryLevel?.[PRODUCT_BY_ID[i.productId].category] ?? 1)) * i.qty, 0) * 100,
  ) / 100;
}

export function couponValue(c: Coupon): number {
  return c.combo ? Math.max(0, Math.round((comboRegular(c) - c.combo.price) * 100) / 100) : c.value;
}

/** Split a total fairly: everyone pays the same rounded-up amount, cents rounding shown. */
export function splitAmong(total: number, members: number) {
  const cents = Math.round(total * 100);
  const each = Math.ceil(cents / members) / 100;
  const extra = Math.round((each * members - total) * 100) / 100;
  return { each, extra };
}

function StokvelCalc({ c }: { c: Coupon }) {
  const [members, setMembers] = useState(4);
  if (!c.combo) return null;
  const { each, extra } = splitAmong(c.combo.price, members);
  return (
    <div className="mt-3 rounded-2xl border border-save bg-save-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-save"><Users size={16} /> Members</p>
        <div className="flex items-center gap-1 rounded-full bg-card p-1">
          <button onClick={() => setMembers((m) => Math.max(2, m - 1))} className="grid h-9 w-9 place-items-center rounded-full bg-paper" aria-label="Fewer members"><Minus size={16} /></button>
          <span className="num w-8 text-center text-lg font-extrabold">{members}</span>
          <button onClick={() => setMembers((m) => Math.min(12, m + 1))} className="grid h-9 w-9 place-items-center rounded-full bg-paper" aria-label="More members"><Plus size={16} /></button>
        </div>
      </div>
      <p className="mt-2 text-sm">Each member contributes</p>
      <p className="num text-3xl font-extrabold text-save">{zar(each)}</p>
      {extra > 0 && <p className="text-xs text-muted">Rounded up: {zar(extra)} left over for the kitty.</p>}
      <p className="mt-2 text-sm font-semibold">Each member takes home</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {c.combo.items.map((i) => {
          const p = PRODUCT_BY_ID[i.productId];
          const share = i.qty / members;
          const amount = p.size.qty * share;
          const unit = p.size.unit === 'each' ? '' : p.size.unit;
          return (
            <li key={i.productId} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{productTitle(p)}</span>
              <span className="num shrink-0 font-semibold">
                {Number.isInteger(share) ? `${share} × ${packLabel(p.size)}` : `${+amount.toFixed(2)}${unit} (${+share.toFixed(2)} packs)`}
              </span>
            </li>
          );
        })}
      </ul>
      {c.combo.items.some((i) => i.qty % members !== 0) && <p className="mt-1 text-xs text-muted">Packs don't divide evenly for {members}: share out at collection, or pick {c.combo.items.map((i) => i.qty).reduce((a, b) => gcd(a, b))} members.</p>}
    </div>
  );
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function CouponCard({ c, today, onRedeem }: { c: Coupon; today: number; onRedeem: (c: Coupon) => void }) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const clipped = state.clipped[c.id];
  const [stokvel, setStokvel] = useState(false);
  const value = couponValue(c);
  const end = couponEnd(c, today);
  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-card ${clipped?.usedAt ? 'border-line opacity-70' : clipped ? 'border-save' : 'border-line'}`}>
      <div className="flex">
        <div className={`flex w-24 shrink-0 flex-col items-center justify-center border-r-2 border-dashed px-2 py-3 text-center ${clipped ? 'border-save bg-save-soft' : 'border-line bg-paper'}`}>
          <span className="text-[10px] font-bold tracking-wide text-muted uppercase">{c.combo ? 'You save' : 'Save'}</span>
          <span className="num text-2xl leading-tight font-black text-save">{zar(value).replace('.00', '')}</span>
        </div>
        <div className="min-w-0 flex-1 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {c.retailerIds.length ? c.retailerIds.map((r) => <StorePill key={r} retailerId={r} size="xs" />) : <span className="rounded-full bg-paper px-2 py-1 text-[10px] font-bold text-muted">All participating stores</span>}
            <ExpiryChip validTo={end} today={today} />
          </div>
          <h3 className="mt-1.5 leading-snug font-bold">{c.title}</h3>
          <p className="text-sm text-muted">{c.detail}</p>
          {c.combo && (
            <p className="mt-1 text-sm">
              <span className="num text-lg font-extrabold">{zar(c.combo.price)}</span>{' '}
              <span className="num text-muted line-through">{zar(comboRegular(c))}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {!clipped ? (
              <button
                onClick={() => {
                  dispatch({ type: 'clip', couponId: c.id });
                  toast('Clipped to your wallet. Works offline in store.');
                }}
                className="flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2.5 text-sm font-bold text-white"
              >
                <Scissors size={16} /> Clip coupon
              </button>
            ) : (
              <button onClick={() => onRedeem(c)} className="flex items-center gap-1.5 rounded-xl bg-save px-3.5 py-2.5 text-sm font-bold text-white">
                {clipped.usedAt ? <><Check size={16} /> Used</> : <><ScanBarcode size={16} /> Redeem in store</>}
              </button>
            )}
            {c.stokvel && (
              <button
                onClick={() => setStokvel((s) => !s)}
                aria-pressed={stokvel}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold ${stokvel ? 'border-save bg-save-soft text-save' : 'border-line'}`}
              >
                <Users size={16} /> Stokvel & Bulk
              </button>
            )}
          </div>
        </div>
      </div>
      {stokvel && <div className="px-3 pb-3"><StokvelCalc c={c} /></div>}
    </article>
  );
}

const PROGRAMS: { id: string; label: string; retailerId: string }[] = [
  { id: 'xtra', label: 'Xtra Savings (Shoprite / Checkers / Usave)', retailerId: 'checkers' },
  { id: 'smart', label: 'Smart Shopper (Pick n Pay)', retailerId: 'pnp' },
  { id: 'wrewards', label: 'WRewards (Woolworths)', retailerId: 'woolworths' },
  { id: 'spar', label: 'SPAR Rewards', retailerId: 'spar' },
  { id: 'mcard', label: 'Makro mCard', retailerId: 'makro' },
  { id: 'other', label: 'Other store card', retailerId: 'local' },
];

type DetectorCtor = new (o: { formats: string[] }) => { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string; format: string }[]> };

function LoyaltyVault() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [program, setProgram] = useState('xtra');
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [show, setShow] = useState<LoyaltyCard | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState('');
  const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const clean = number.replace(/\s+/g, '');

  const add = () => {
    if (clean.length < 6) return;
    const format: LoyaltyCard['format'] = /^\d{13}$/.test(clean) ? 'EAN13' : 'CODE128';
    dispatch({ type: 'loyaltyAdd', card: { id: `${program}-${clean}`, program, number: clean, format, holder: holder.trim() || undefined } });
    setNumber('');
    setHolder('');
    toast('Card saved on this phone');
  };

  const scanPhoto = async (file: File) => {
    if (!Detector) return;
    setScanMsg('Reading barcode…');
    try {
      const bmp = await createImageBitmap(file);
      const found = await new Detector({ formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'qr_code', 'itf', 'upc_a'] }).detect(bmp);
      if (found[0]) {
        setNumber(found[0].rawValue);
        setScanMsg('Got it. Check the number, then save.');
      } else setScanMsg('No barcode found. Try closer, in good light, or type the number.');
    } catch {
      setScanMsg('Could not read that photo. Type the number instead.');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {state.loyalty.length === 0 ? (
        <Empty icon={<CreditCard size={28} />} title="No cards yet">Save your loyalty cards here so you never miss card-only specials, even with no signal.</Empty>
      ) : (
        state.loyalty.map((card) => {
          const prog = PROGRAMS.find((p) => p.id === card.program) ?? PROGRAMS[5];
          const r = RETAILER_BY_ID[prog.retailerId];
          return (
            <div key={card.id} className="overflow-hidden rounded-2xl" style={{ background: r.bg, color: r.fg }}>
              <button onClick={() => setShow(card)} className="block w-full p-4 text-left">
                <p className="display text-lg font-black">{prog.label.split(' (')[0]}</p>
                <p className="num mt-4 text-lg tracking-widest">{card.number.replace(/(.{4})/g, '$1 ').trim()}</p>
                <p className="mt-1 text-xs opacity-80">{card.holder ?? 'Tap to show barcode at till'}</p>
              </button>
              <div className="flex justify-end bg-black/15 px-3 py-1.5">
                {confirmDelete === card.id ? (
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    Remove card?
                    <button onClick={() => setConfirmDelete(null)} className="rounded-lg bg-white/20 px-2.5 py-1.5">Keep</button>
                    <button onClick={() => { dispatch({ type: 'loyaltyRemove', id: card.id }); setConfirmDelete(null); }} className="rounded-lg bg-white px-2.5 py-1.5 text-hot">Remove</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(card.id)} className="flex items-center gap-1 text-xs font-semibold opacity-90"><Trash2 size={14} /> Remove</button>
                )}
              </div>
            </div>
          );
        })
      )}

      <section className="rounded-2xl border border-line bg-card p-3">
        <h3 className="display font-extrabold">Add a loyalty card</h3>
        <label htmlFor="card-program" className="mt-2 block text-sm font-semibold">Programme</label>
        <select id="card-program" value={program} onChange={(e) => setProgram(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-3 font-semibold">
          {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <label htmlFor="card-number" className="mt-3 block text-sm font-semibold">Card number (under the barcode)</label>
        <input id="card-number" inputMode="numeric" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 6009 1234 5678 9012" className="num mt-1 w-full rounded-xl border border-line px-3 py-3 text-lg tracking-wider outline-none focus:border-ink" />
        <label htmlFor="card-holder" className="mt-3 block text-sm font-semibold">Name on card (optional)</label>
        <input id="card-holder" value={holder} onChange={(e) => setHolder(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-3 outline-none focus:border-ink" />
        {Detector && (
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink py-3 text-sm font-semibold">
            <ScanBarcode size={18} /> Photograph the card's barcode
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && scanPhoto(e.target.files[0])} />
          </label>
        )}
        {scanMsg && <p className="mt-1 text-xs text-muted">{scanMsg}</p>}
        {clean.length >= 6 && (
          <div className="mt-3 rounded-xl border border-line p-2">
            <Barcode value={clean} format={/^\d{13}$/.test(clean) ? 'EAN13' : 'CODE128'} height={60} />
          </div>
        )}
        <button disabled={clean.length < 6} onClick={add} className="mt-3 w-full rounded-2xl bg-ink py-3.5 font-bold text-white disabled:opacity-40">Save card</button>
      </section>

      <TillScreen
        code={show && {
          heading: (PROGRAMS.find((p) => p.id === show.program) ?? PROGRAMS[5]).label.split(' (')[0],
          subheading: show.holder ?? 'Loyalty card',
          barcode: show.number,
          format: show.format,
          instructions: ['Scan the barcode before the first item.', 'If it won’t scan, type the number under the bars.'],
        }}
        onClose={() => setShow(null)}
      />
    </div>
  );
}

export function Coupons() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const { today } = useArea();
  const [view, setView] = useState<View>('browse');
  const [redeem, setRedeem] = useState<Coupon | null>(null);
  const clippedList = useMemo(() => COUPONS.filter((c) => state.clipped[c.id]), [state.clipped]);
  const live = COUPONS.filter((c) => couponEnd(c, today) >= today);

  const section = (title: string, Icon: typeof Factory, kind: Coupon['kind']) => {
    const list = live.filter((c) => c.kind === kind);
    return (
      <section>
        <h2 className="display mb-2 flex items-center gap-1.5 text-lg font-extrabold"><Icon size={18} className="text-save" /> {title}</h2>
        <div className="flex flex-col gap-2.5">
          {list.map((c) => <CouponCard key={c.id} c={c} today={today} onRedeem={setRedeem} />)}
        </div>
      </section>
    );
  };

  const codes = redeem ? couponCodes(redeem.id, state.deviceId) : null;
  const used = redeem ? !!state.clipped[redeem.id]?.usedAt : false;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-2xl font-black">Coupons & cards</h1>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'browse', label: 'Coupons' },
          { value: 'wallet', label: `Wallet${clippedList.length ? ` (${clippedList.length})` : ''}` },
          { value: 'cards', label: `Loyalty${state.loyalty.length ? ` (${state.loyalty.length})` : ''}` },
        ]}
      />
      {view !== 'browse' && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-save"><WifiOff size={14} /> Saved on your phone: works in store with no signal.</p>
      )}
      {view === 'browse' && (
        <>
          {section('Manufacturer coupons', Factory, 'manufacturer')}
          {section('Store vouchers', Store, 'store')}
          {section('Combo & Stokvel bulk deals', Package, 'combo')}
        </>
      )}
      {view === 'wallet' &&
        (clippedList.length === 0 ? (
          <Empty icon={<Ticket size={28} />} title="Your wallet is empty">Clip coupons and they'll wait here, ready to scan at the till.</Empty>
        ) : (
          <div className="flex flex-col gap-2.5">
            {clippedList
              .sort((a, b) => Number(!!state.clipped[a.id].usedAt) - Number(!!state.clipped[b.id].usedAt))
              .map((c) => <CouponCard key={c.id} c={c} today={today} onRedeem={setRedeem} />)}
          </div>
        ))}
      {view === 'cards' && <LoyaltyVault />}

      <TillScreen
        code={redeem && codes && {
          heading: redeem.title,
          subheading: redeem.retailerIds.length ? redeem.retailerIds.map((r) => RETAILER_BY_ID[r].name).join(' / ') : 'Any participating store',
          barcode: codes.barcode,
          qr: `MZS|${redeem.id}|${codes.barcode}|${codes.promo}`,
          promo: codes.promo,
          instructions: [
            redeem.minSpend ? `Check the basket is ${zar(redeem.minSpend)} or more.` : redeem.productIds ? `Check the item: ${redeem.detail}.` : `Check the combo items are all in the basket.`,
            'Scan the barcode, or key in the promo code.',
            `Discount: ${zar(couponValue(redeem))}.`,
          ],
          note: 'Sample coupon for this proof of concept. Real tills will not accept it yet.',
        }}
        used={used}
        onToggleUsed={() => {
          if (!redeem) return;
          dispatch({ type: 'markUsed', couponId: redeem.id, used: !used, value: couponValue(redeem), label: redeem.title });
          if (!used) toast(`${zar(couponValue(redeem))} added to your monthly savings`);
        }}
        onClose={() => setRedeem(null)}
      />
    </div>
  );
}
