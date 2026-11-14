// Renders public/icon.svg to the PNG sizes Android needs to install the app.
const { chromium } = require('playwright');
const { readFileSync } = require('fs');
const path = require('path');
(async () => {
  const svg = readFileSync(path.join(__dirname, '../public/icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
    await page.screenshot({ path: path.join(__dirname, `../public/icon-${size}.png`), omitBackground: true });
    await page.close();
  }
  await browser.close();
})();
