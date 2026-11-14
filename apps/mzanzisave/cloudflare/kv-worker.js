// Serves the MzanziSave PWA files stored in Workers KV.
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8' };
export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const url = new URL(request.url);
    let key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (key === '' || key.endsWith('/')) key += 'index.html';
    let body = await env.KV.get(key, 'arrayBuffer');
    if (body === null && !key.includes('.')) { key = 'index.html'; body = await env.KV.get(key, 'arrayBuffer'); }
    if (body === null) return new Response('Not found', { status: 404 });
    const ext = key.split('.').pop();
    const headers = new Headers({ 'content-type': TYPES[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    headers.set('cache-control', key.startsWith('assets/') ? 'public, max-age=31536000, immutable' : key.startsWith('ocr/') ? 'public, max-age=604800' : 'no-cache');
    return new Response(request.method === 'HEAD' ? null : body, { headers });
  },
};
