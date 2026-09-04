import { expect, test, type Browser, type Page } from '@playwright/test';

type LongTaskSample = { start: number; duration: number };
type PerfWindow = Window & { __derivonLongTasks?: LongTaskSample[]; __derivonStartedAt?: number };

const concepts = Math.max(100, Number(process.env.PERF_SIZE ?? 1000));
const runCount = Math.max(1, Number(process.env.PERF_RUNS ?? 1));

async function installWorkspace(page: Page) {
  await page.addInitScript(({ concepts }) => {
    const longTasks: LongTaskSample[] = [];
    (window as PerfWindow).__derivonLongTasks = longTasks;
    (window as PerfWindow).__derivonStartedAt = performance.now();
    new PerformanceObserver((list) => {
      longTasks.push(...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration })));
    }).observe({ type: 'longtask', buffered: true });

    const points = Array.from({ length: concepts }, (_, index) => ({
      id: `p-${index}`,
      data: { label: `Concept ${index}`, document: `docs/p-${index}`, format: 'html' },
    }));
    const hyperedges = Array.from({ length: concepts }, (_, index) => ({
      id: `h-${index}`,
      weight: (index % 6) + 0.5,
      tails: [`p-${index}`, `p-${(index + concepts - 1) % concepts}`],
      head: `p-${(index + 1) % concepts}`,
      data: { document: `docs/h-${index}`, format: 'html' },
    }));
    const files = Object.fromEntries([
      ...points.map((point) => [`${point.data.document}/index.html`, '']),
      ...hyperedges.map((edge) => [`${edge.data.document}/index.html`, '']),
    ]);
    const manifest = {
      schema: 'derivon.authoring/v0.3.0',
      document: { title: 'Replacement performance', description: '' },
      graph: { points, hyperedges },
      view: {
        replacements: [
          { points: ['p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5'], replaceWith: 'p-6', show: 'points' },
          { points: ['p-7', 'p-8', 'p-9', 'p-10', 'p-11', 'p-12', 'p-13', 'p-14'], replaceWith: 'p-15', show: 'points' },
          { points: ['p-16', 'p-17'], replaceWith: 'p-18', show: 'replacement' },
          { points: ['p-18', 'p-19'], replaceWith: 'p-20', show: 'points' },
        ],
      },
    };
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: {} }));
    localStorage.setItem('derivon.authoring.workspace/v0.3.0', JSON.stringify({ manifest, files }));
  }, { concepts });
}

async function selectConcept(page: Page, id: string) {
  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill(id);
  await page.getByRole('option', { name: new RegExp(id) }).first().click();
  await page.waitForTimeout(350);
}

async function openCompare(page: Page, relationTarget: string, expectedAssists: number) {
  const definition = page.locator('.replacement-definition').filter({ hasText: relationTarget }).first();
  const button = definition.getByRole('button', { name: '对照', exact: true });
  await page.evaluate(() => {
    const perfWindow = window as PerfWindow;
    (perfWindow.__derivonLongTasks ?? []).length = 0;
  });
  const surface = page.locator('.g6-graph-surface');
  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-layout-running', 'false');
  const layoutRequestsBefore = await main.getAttribute('data-layout-requests');
  const viewportBefore = await surface.getAttribute('data-viewport-sample');
  const startedAt = await page.evaluate(() => performance.now());
  await button.click();
  await expect(surface).toHaveAttribute('data-replacement-assists', String(expectedAssists));
  const materializedMs = await page.evaluate(async (start) => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return performance.now() - start;
  }, startedAt);
  await page.waitForTimeout(250);
  await expect(main).toHaveAttribute('data-layout-running', 'false');
  await expect(main).toHaveAttribute('data-layout-requests', layoutRequestsBefore ?? '0');
  await expect(surface).toHaveAttribute('data-viewport-sample', viewportBefore ?? '');
  return page.evaluate(() => {
    const perfWindow = window as PerfWindow;
    return { longTasks: [...(perfWindow.__derivonLongTasks ?? [])] };
  }).then((result) => ({ ...result, materializedMs }));
}

async function runSample(browser: Browser, run: number) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installWorkspace(page);
  await page.goto('/legacy.html', { waitUntil: 'domcontentloaded' });
  const surface = page.locator('.g6-graph-surface');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-layout-ready', 'true', { timeout: 120_000 });
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 120_000 });
  const readyMs = await page.evaluate(() => performance.now() - ((window as PerfWindow).__derivonStartedAt ?? 0));

  await selectConcept(page, 'p-0');
  const sixMember = await openCompare(page, 'p-6', 1);
  await selectConcept(page, 'p-7');
  const wrapped = await openCompare(page, 'p-15', 2);
  await selectConcept(page, 'p-18');
  const child = await openCompare(page, 'p-18', 3);
  const parent = await openCompare(page, 'p-20', 4);

  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      heapBytes: memory.memory?.usedJSHeapSize ?? null,
      domElements: document.getElementsByTagName('*').length,
    };
  });
  await context.close();
  return { run, readyMs, sixMember, wrapped, child, parent, ...metrics };
}

test.describe('replacement compare performance', () => {
  test.describe.configure({ mode: 'serial' });
  test(`${concepts} concepts`, async ({ browser }, testInfo) => {
    const samples = [];
    for (let run = 1; run <= runCount; run += 1) samples.push(await runSample(browser, run));
    const result = { surface: 'production-replacement-compare', concepts, samples };
    console.log(`PERF_RESULT ${JSON.stringify(result)}`);
    await testInfo.attach(`replacement-compare-${concepts}.json`, {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });

    expect(samples.every((sample) => [sample.sixMember, sample.wrapped, sample.child, sample.parent]
      .every((action) => action.materializedMs <= 200))).toBe(true);
    expect(samples.every((sample) => [sample.sixMember, sample.wrapped, sample.child, sample.parent]
      .flatMap((action) => action.longTasks).every((task) => task.duration <= 100))).toBe(true);
    expect(samples.every((sample) => sample.heapBytes === null || sample.heapBytes <= 45 * 1024 * 1024)).toBe(true);
  });
});
