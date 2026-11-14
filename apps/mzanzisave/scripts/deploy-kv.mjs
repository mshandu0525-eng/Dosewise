// Deploys dist/ to Cloudflare as a Worker that serves files from Workers KV.
// Used where Wrangler's asset upload can't run (e.g. behind a proxy that rewrites the
// Authorization header). Needs CLOUDFLARE_API_TOKEN (Edit Cloudflare Workers template).
// Usage: npm run build && node scripts/deploy-kv.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN');
const headers = { Authorization: `Bearer ${token}` };
const NAME = 'mzanzisave';
const NS_TITLE = 'mzanzisave-assets';

async function cf(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { ...headers, ...init.headers } });
  const body = await res.json();
  if (!body.success) throw new Error(`${path}: ${JSON.stringify(body.errors)}`);
  return body.result;
}

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

const [account] = await cf('/accounts');
const A = `/accounts/${account.id}`;
const namespaces = await cf(`${A}/storage/kv/namespaces?per_page=100`);
const ns = namespaces.find((n) => n.title === NS_TITLE) ?? (await cf(`${A}/storage/kv/namespaces`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: NS_TITLE }) }));

for (const file of files('dist')) {
  const key = relative('dist', file).split('\\').join('/');
  // The bulk endpoint is used even for one file: the single-value PUT is unreliable on new namespaces.
  await cf(`${A}/storage/kv/namespaces/${ns.id}/bulk`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ key, value: readFileSync(file).toString('base64'), base64: true }]),
  });
  console.log('uploaded', key);
}

const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({ main_module: 'worker.js', compatibility_date: '2026-11-01', bindings: [{ type: 'kv_namespace', name: 'KV', namespace_id: ns.id }] })], { type: 'application/json' }));
form.append('worker.js', new Blob([readFileSync('cloudflare/kv-worker.js')], { type: 'application/javascript+module' }), 'worker.js');
await cf(`${A}/workers/scripts/${NAME}`, { method: 'PUT', body: form });
await cf(`${A}/workers/scripts/${NAME}/subdomain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
const { subdomain } = await cf(`${A}/workers/subdomain`);
console.log(`Live: https://${NAME}.${subdomain}.workers.dev`);
