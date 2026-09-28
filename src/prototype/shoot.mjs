/** PROTOTYPE ONLY — screenshot helper. `node src/prototype/shoot.mjs` with `npm run dev` serving on 1420. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const out = 'test-results/prototype-153';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
for (const variant of ['A', 'B', 'C']) for (const mode of ['authoring', 'learning']) {
  await page.goto(`http://localhost:1420/prototype.html?variant=${variant}&mode=${mode}&store=2`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.proto-switcher', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${variant}-${mode}.png` });
  console.log('shot', variant, mode);
}
await browser.close();
