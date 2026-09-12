/**
 * PROTOTYPE ONLY — throwaway screenshot helper. `node src/prototype/shoot.mjs`
 * Needs `npm run dev` already serving on 1420.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = 'test-results/prototype';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
for (const variant of ['A', 'B', 'C']) {
  await page.goto(`http://localhost:1420/prototype.html?variant=${variant}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.proto-switcher', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${variant}.png` });
  console.log('shot', variant);
}
await browser.close();
