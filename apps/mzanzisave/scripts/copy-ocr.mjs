// Copies the on-device OCR engine (worker, WebAssembly core in 3 CPU variants, English model) into public/ocr
// so scanning never depends on a third-party CDN and works offline once cached.
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
];
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) throw new Error(`Missing ${from}. Run npm install.`);
  copyFileSync(src, join(out, to));
}
// The English model ships as base64 text of the gzipped file: every static host serves .txt
// unchanged, while binary .gz/.traineddata files get re-encoded or refused by some hosts.
const model = join(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz');
if (!existsSync(model)) throw new Error('Missing English OCR model. Run npm install.');
writeFileSync(join(out, 'eng-model.b64.txt'), readFileSync(model).toString('base64'));
for (const old of ['eng.traineddata', 'eng.traineddata.gz']) rmSync(join(out, old), { force: true });
console.log('OCR engine copied to public/ocr');
