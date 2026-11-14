/**
 * MzanziSave on Cloudflare Workers.
 * - GET /api/prices: the hourly price feed (src/lib/feed.ts). A real price source plugs in here.
 * - Everything else: the built PWA, from static assets (wrangler deploy) or Workers KV (scripts/deploy-kv.mjs).
 */
import { buildFeed } from '../src/lib/feed';

interface Env {
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  KV?: { get: (key: string, type: 'arrayBuffer') => Promise<ArrayBuffer | null> };
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8', json: 'application/json',
};

function prices(): Response {
  const feed = buildFeed();
  const secondsLeft = Math.max(30, Math.floor((Date.parse(feed.nextUpdateAt) - Date.now()) / 1000));
  return new Response(JSON.stringify(feed), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${Math.min(300, secondsLeft)}`, 'access-control-allow-origin': '*' },
  });
}

async function fromKV(env: Env, url: URL, method: string): Promise<Response> {
  let key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (key === '' || key.endsWith('/')) key += 'index.html';
  let body = await env.KV!.get(key, 'arrayBuffer');
  if (body === null && !key.includes('.')) {
    key = 'index.html';
    body = await env.KV!.get(key, 'arrayBuffer');
  }
  if (body === null) return new Response('Not found', { status: 404 });
  const ext = key.split('.').pop() ?? '';
  const headers = new Headers({ 'content-type': TYPES[ext] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' });
  headers.set('cache-control', key.startsWith('assets/') ? 'public, max-age=31536000, immutable' : key.startsWith('ocr/') ? 'public, max-age=604800' : 'no-cache');
  return new Response(method === 'HEAD' ? null : body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const url = new URL(request.url);
    if (url.pathname === '/api/prices') return prices();
    if (env.ASSETS) return env.ASSETS.fetch(request);
    if (env.KV) return fromKV(env, url, request.method);
    return new Response('No assets configured', { status: 500 });
  },
};
