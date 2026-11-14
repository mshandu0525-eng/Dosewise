import { useState } from 'react';
import { Gauge, Trash2, Bell } from 'lucide-react';
import { useApp } from '../lib/state';
import { Sheet, useToast } from './ui';
import { zar } from '../lib/format';
import { monthName, todaySA } from '../lib/date';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, savedThisMonth } = useApp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [perm, setPerm] = useState<string>(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const month = monthName(todaySA());
  const entries = [...state.savings].sort((a, b) => b.at - a.at);

  return (
    <Sheet open={open} onClose={onClose} title="My savings & settings" tall>
      <div className="rounded-2xl bg-save p-4 text-white">
        <p className="text-sm opacity-90">Saved in {month}</p>
        <p className="num text-4xl font-extrabold">{zar(savedThisMonth)}</p>
        <p className="mt-1 text-xs opacity-90">From coupons marked as used and baskets you shopped with MzanziSave.</p>
      </div>
      {entries.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {entries.slice(0, 20).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 truncate">{e.label}</span>
              <span className="num shrink-0 font-bold text-save">+{zar(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-4 flex items-center gap-3 rounded-2xl border border-line p-3">
        <Gauge className="shrink-0 text-muted" />
        <span className="flex-1">
          <span className="block font-semibold">Data-Saver mode</span>
          <span className="block text-xs text-muted">Hide product pictures. Prices, unit costs and barcodes stay.</span>
        </span>
        <input
          id="set-datasaver"
          type="checkbox"
          checked={state.dataSaver}
          onChange={(e) => dispatch({ type: 'dataSaver', on: e.target.checked })}
          className="h-6 w-6 accent-[#047857]"
        />
      </label>

      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line p-3">
        <Bell className="shrink-0 text-muted" />
        <span className="flex-1">
          <span className="block font-semibold">Price drop notifications</span>
          <span className="block text-xs text-muted">
            {perm === 'granted' ? 'On. Alerts are checked each time you open the app.' : perm === 'denied' || perm === 'unsupported' ? 'Not available here, so alerts show as an in-app banner.' : 'Get a phone notification when an alert hits your price.'}
          </span>
        </span>
        {perm === 'default' && (
          <button
            onClick={async () => {
              try {
                setPerm(await Notification.requestPermission());
              } catch {
                setPerm('denied');
              }
            }}
            className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white"
          >
            Turn on
          </button>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-line p-3 text-sm text-muted">
        <p className="font-semibold text-ink">Works offline</p>
        <p className="mt-1">Your basket, clipped coupons and loyalty cards are saved on this phone only. No sign-up, nothing is uploaded. Prices are sample data for this proof of concept.</p>
      </div>

      {!confirm ? (
        <button onClick={() => setConfirm(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 font-semibold text-hot">
          <Trash2 size={18} /> Reset all my data
        </button>
      ) : (
        <div className="mt-3 rounded-2xl border border-hot bg-hot-soft p-3">
          <p className="text-sm font-semibold text-hot">This clears your basket, coupons, loyalty cards, alerts and savings on this phone.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl border border-line bg-card py-2.5 font-semibold">Keep my data</button>
            <button
              onClick={() => {
                dispatch({ type: 'reset' });
                setConfirm(false);
                toast('All data cleared', 'info');
                onClose();
              }}
              className="flex-1 rounded-xl bg-hot py-2.5 font-semibold text-white"
            >
              Clear everything
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
