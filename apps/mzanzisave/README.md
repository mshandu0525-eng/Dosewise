# MzanziSave

Proof-of-concept PWA that compares grocery specials across South African supermarkets (big chains and regional/independent stores), bundles coupons and loyalty cards, and works offline. Not part of the DoseWise npm workspace; it has its own `package.json`.

## Run it

```bash
cd apps/mzanzisave
npm install
npm run dev          # http://localhost:5173, also on your Wi-Fi IP for your phone
npm test             # unit price maths, shelf-tag parser, store hours, basket optimiser, stokvel split
npm run build        # dist/: installable PWA with service worker (offline)
npm run build:artifact   # dist-artifact/mzanzisave.html: single-file version for a claude.ai artifact
```

To install on a phone as a real app (offline, home-screen icon), host `dist/` on any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages) and choose "Add to Home screen" / "Install app" in Chrome.

## What's in it

| Module | Where |
| --- | --- |
| 1. Price comparison, true unit price, Best Value badge, price-drop alerts | `screens/Deals.tsx`, `screens/Compare.tsx`, `components/AlertSheet.tsx`, `lib/alerts.ts` |
| 2. Basket optimiser: one-stop ranking, Split & Save with taxi/fuel cost, WhatsApp share | `screens/Basket.tsx`, `lib/basket.ts`, `lib/share.ts` |
| 3. Coupons, till screen (Code-128 + QR + promo code), loyalty card vault | `screens/Coupons.tsx`, `components/Codes.tsx` |
| 4. Snap & Compare: on-device OCR of shelf tags / flyers | `screens/Scan.tsx`, `lib/ocr.ts` |
| 5. Area filter: 8 cities, suburbs, 2/5/15 km, taxi rank / mall / open now | `components/LocationSheet.tsx`, `data/branches.ts` |
| 6. Stokvel & bulk calculator (2–12 members) | `screens/Coupons.tsx` |
| 7. "Ends Tomorrow" last-chance carousel | `screens/Deals.tsx` |
| 8. Monthly savings counter | `components/Chrome.tsx`, `lib/state.tsx` |

## Data

All prices, specials and coupons are generated sample data (`src/data/`). Specials run in stable 7- or 14-day promo cycles, so a deal keeps its dates while new ones roll in daily. Coupon barcodes are samples and won't scan at a real till; loyalty cards you add use your real card number and do scan.

State (basket, coupons, cards, alerts, savings) is kept in `localStorage` on the phone. No accounts, nothing uploaded. OCR runs in the browser with Tesseract; the engine (~17 MB across CPU variants, one ~9 MB set downloaded) is fetched only on the first scan and cached.
