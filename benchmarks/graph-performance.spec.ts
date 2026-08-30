import { expect, test, type Browser, type Page } from '@playwright/test';
type LongTaskSample = { start: number; duration: number };
type ActionSample = { elapsedMs: number; longTasks: LongTaskSample[] };
type PerfWindow = Window & {
  __derivonLongTasks?: LongTaskSample[];
  __derivonStartedAt?: number;
};

type RunSample = {
  concepts: number;
  run: number;
  readyMs: number;
  layoutReadyMs: number;
  initialLongTasks: LongTaskSample[];
  domElements: number;
  canvasElements: number;
  renderedNodes: number;
  renderedEdges: number;
  heapBytes: number | null;
  routeOpen: ActionSample;
  focus: ActionSample;
  focusedRenderedNodes: number;
  focusedRenderedEdges: number;
};

const sizes = (process.env.PERF_SIZES ?? '1000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value >= 4);
const runCount = Math.max(1, Number(process.env.PERF_RUNS ?? 1));

function percentile(values: number[], ratio: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))];
}

function summarize(samples: RunSample[]) {
  const metric = (select: (sample: RunSample) => number) => {
    const values = samples.map(select);
    return {
      median: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  };
  return {
    concepts: samples[0].concepts,
    runs: samples.length,
    readyMs: metric((sample) => sample.readyMs),
    layoutReadyMs: metric((sample) => sample.layoutReadyMs),
    routeOpenMs: metric((sample) => sample.routeOpen.elapsedMs),
    focusMs: metric((sample) => sample.focus.elapsedMs),
    initialRenderedNodes: samples[0].renderedNodes,
    initialRenderedEdges: samples[0].renderedEdges,
    focusedRenderedNodes: samples[0].focusedRenderedNodes,
    focusedRenderedEdges: samples[0].focusedRenderedEdges,
    domElements: samples[0].domElements,
    canvasElements: samples[0].canvasElements,
    heapBytes: samples.map((sample) => sample.heapBytes),
  };
}

async function installWorkspace(page: Page, concepts: number) {
  await page.addInitScript(({ concepts }) => {
    const perfWindow = window as PerfWindow;
    const longTasks: LongTaskSample[] = [];
    perfWindow.__derivonLongTasks = longTasks;
    perfWindow.__derivonStartedAt = performance.now();
    new PerformanceObserver((list) => {
      longTasks.push(...list.getEntries().map((entry) => ({
        start: entry.startTime,
        duration: entry.duration,
      })));
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
      document: {
        title: `G6 Performance ${concepts}`,
        description: 'Synthetic cyclic B-hypergraph production-path fixture',
      },
      graph: { points, hyperedges },
      view: { replacements: [] },
    };
    localStorage.setItem('derivon.authoring.workspace/v0.3.0', JSON.stringify({ manifest, files }));
  }, { concepts });
}

async function beginAction(page: Page): Promise<number> {
  return page.evaluate(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const longTasks = (window as PerfWindow).__derivonLongTasks ?? [];
    longTasks.length = 0;
    return performance.now();
  });
}

async function finishAction(page: Page, startedAt: number): Promise<ActionSample> {
  return page.evaluate(async (start) => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    for (const canvas of document.querySelectorAll('canvas')) {
      canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
    }
    const elapsedMs = performance.now() - start;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return {
      elapsedMs,
      longTasks: [...((window as PerfWindow).__derivonLongTasks ?? [])],
    };
  }, startedAt);
}

async function runSample(browser: Browser, concepts: number, run: number): Promise<RunSample> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installWorkspace(page, concepts);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const surface = page.locator('.g6-graph-surface');
  const app = page.locator('.app-shell');
  await expect(app).toHaveAttribute('data-layout-ready', 'true', { timeout: 120_000 });
  const layoutReadyMs = await page.evaluate(() => performance.now() - ((window as PerfWindow).__derivonStartedAt ?? 0));
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 120_000 });
  await expect(surface).toHaveAttribute('data-render-style-sample', /head:/, { timeout: 120_000 });
  const readyMs = await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    for (const canvas of document.querySelectorAll('canvas')) {
      canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
    }
    return performance.now() - ((window as PerfWindow).__derivonStartedAt ?? 0);
  });
  await page.waitForTimeout(250);

  const initial = await page.evaluate(() => {
    const perfWindow = window as PerfWindow;
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const surface = document.querySelector<HTMLElement>('.g6-graph-surface');
    return {
      initialLongTasks: [...(perfWindow.__derivonLongTasks ?? [])],
      domElements: document.getElementsByTagName('*').length,
      canvasElements: document.querySelectorAll('canvas').length,
      renderedNodes: Number(surface?.dataset.renderedNodes ?? 0),
      renderedEdges: Number(surface?.dataset.renderedEdges ?? 0),
      heapBytes: memory.memory?.usedJSHeapSize ?? null,
    };
  });

  let startedAt = await beginAction(page);
  await page.getByTitle('打开路线模式').click();
  const routeOpen = await finishAction(page, startedAt);
  await page.getByTitle('关闭路线模式').first().click();

  startedAt = await beginAction(page);
  const middleId = `p-${Math.floor(concepts / 2)}`;
  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill(middleId);
  await page.getByRole('option', { name: new RegExp(middleId) }).first().click();
  await page.getByTitle('开启局部视图').click();
  await expect.poll(async () => Number(await surface.getAttribute('data-rendered-edges'))).toBeGreaterThan(0);
  const focus = await finishAction(page, startedAt);
  const focusedRenderedNodes = Number(await surface.getAttribute('data-rendered-nodes'));
  const focusedRenderedEdges = Number(await surface.getAttribute('data-rendered-edges'));

  await context.close();
  return {
    concepts,
    run,
    readyMs,
    layoutReadyMs,
    ...initial,
    routeOpen,
    focus,
    focusedRenderedNodes,
    focusedRenderedEdges,
  };
}

test.describe('production G6 graph performance', () => {
  test.describe.configure({ mode: 'serial' });

  for (const concepts of sizes) {
    test(`${concepts} concepts`, async ({ browser }, testInfo) => {
      const samples: RunSample[] = [];
      for (let run = 1; run <= runCount; run += 1) {
        samples.push(await runSample(browser, concepts, run));
      }
      const result = {
        surface: 'production-g6-canvas-full-detail-worker',
        summary: summarize(samples),
        samples,
      };
      console.log(`PERF_RESULT ${JSON.stringify(result)}`);
      await testInfo.attach(`production-g6-${concepts}.json`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      expect(samples.every((sample) => sample.renderedNodes === concepts * 2)).toBe(true);
      expect(samples.every((sample) => sample.renderedEdges === concepts * 3)).toBe(true);
      expect(samples.every((sample) => sample.canvasElements > 0)).toBe(true);
      expect(samples.every((sample) => sample.focusedRenderedNodes === concepts * 2)).toBe(true);
      expect(samples.every((sample) => sample.focusedRenderedEdges === concepts * 3)).toBe(true);
    });
  }
});
