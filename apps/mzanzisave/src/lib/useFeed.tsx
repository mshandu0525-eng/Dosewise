import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isFeed, setActiveFeed, type PriceFeed } from './feed';

const KEY = 'mzanzisave:feed';
const HOUR = 3_600_000;

export type FeedStatus = 'idle' | 'checking' | 'ok' | 'offline' | 'unavailable';

interface FeedCtx {
  feed: PriceFeed | null;
  /** When the app last got prices from the server (ms). */
  checkedAt: number | null;
  status: FeedStatus;
  refresh: () => void;
}

const Ctx = createContext<FeedCtx>({ feed: null, checkedAt: null, status: 'idle', refresh: () => {} });

function loadCached(): { feed: PriceFeed; checkedAt: number } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && isFeed(raw.feed) && typeof raw.checkedAt === 'number') return raw;
  } catch {
    /* no cache */
  }
  return null;
}

/** Downloads new prices once an hour (and when the app is reopened), keeping the last ones for offline use. */
export function FeedProvider({ children }: { children: ReactNode }) {
  const cached = useRef(loadCached());
  // Apply the cached feed before the first render so prices are consistent from the start.
  if (cached.current) setActiveFeed(cached.current.feed);
  const [feed, setFeed] = useState<PriceFeed | null>(cached.current?.feed ?? null);
  const [checkedAt, setCheckedAt] = useState<number | null>(cached.current?.checkedAt ?? null);
  const [status, setStatus] = useState<FeedStatus>('idle');
  const busy = useRef(false);
  const last = useRef({ feed, checkedAt });
  last.current = { feed, checkedAt };

  const fetchFeed = useCallback(async () => {
    if (busy.current) return;
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    busy.current = true;
    setStatus('checking');
    try {
      const res = await fetch(new URL('./api/prices', document.baseURI), { cache: 'no-store' });
      const body: unknown = res.ok ? await res.json() : null;
      if (!isFeed(body)) throw new Error('bad feed');
      const at = Date.now();
      setActiveFeed(body);
      setFeed(body);
      setCheckedAt(at);
      setStatus('ok');
      try {
        localStorage.setItem(KEY, JSON.stringify({ feed: body, checkedAt: at }));
      } catch {
        /* storage full: keep using it for this visit */
      }
    } catch {
      setStatus(navigator.onLine ? 'unavailable' : 'offline');
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const due = () => {
      const { feed: f, checkedAt: c } = last.current;
      const now = Date.now();
      return !f || !c || now - c >= HOUR || now >= Date.parse(f.nextUpdateAt);
    };
    if (due()) fetchFeed();
    const tick = setInterval(() => due() && fetchFeed(), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && due() && fetchFeed();
    const onOnline = () => due() && fetchFeed();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [fetchFeed]);

  const value = useMemo(() => ({ feed, checkedAt, status, refresh: fetchFeed }), [feed, checkedAt, status, fetchFeed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useFeed = () => useContext(Ctx);
