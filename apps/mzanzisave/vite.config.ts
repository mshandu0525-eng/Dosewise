import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Writes sw.js after the bundle is built so the service worker precaches every hashed
 * asset of this exact build. The OCR engine (~7 MB) is not precached: it is cached the
 * first time someone scans, so installing the app stays data-light.
 */
function serviceWorker(): Plugin {
  return {
    name: 'mzanzisave-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const assets = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const precache = ['./', ...assets, 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
      const version = Date.now().toString(36);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Generated at build time.
const CACHE = 'mzanzisave-${version}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'mzanzisave-ocr').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fonts and the OCR engine: cache on first use, then serve from cache.
  const runtime = url.pathname.includes('/ocr/') ? 'mzanzisave-ocr'
    : (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) ? CACHE : null;
  if (runtime) {
    e.respondWith(caches.open(runtime).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./', { ignoreVary: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./'))));
});
`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    plugins: [react(), tailwindcss(), ...(artifact ? [viteSingleFile()] : [serviceWorker()])],
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      copyPublicDir: !artifact,
      sourcemap: false,
    },
    test: { environment: 'node' },
  };
});
