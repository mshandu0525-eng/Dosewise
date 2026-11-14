// Turns the single-file build into a page body for a claude.ai artifact (the host adds
// <html>/<head>/<body>). The OCR engine is published next to it as separate files.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-artifact/index.html', 'utf8');
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('No inline module script found. Did the singlefile build run?');
const out = `<title>MzanziSave</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#047857">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&display=swap">
<style>${styles}</style>
<div id="root"></div>
<script type="module">${scripts.join('\n').replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync('dist-artifact/mzanzisave.html', out);
console.log(`dist-artifact/mzanzisave.html: ${(out.length / 1024).toFixed(0)} KB`);
