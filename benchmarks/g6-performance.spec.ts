import { expect, test, type Browser, type Page } from '@playwright/test';

type LongTaskSample = { start: number; duration: number };

type ActionSample = {
  elapsedMs: number;
  longTasks: LongTaskSample[];
};

type G6Timings = {
  entryStarted: number;
  dataReady: number;
  graphConstructed: number;
  renderStarted: number;
  renderFinished: number;
};

type G6RunSample = {
  concepts: number;
  visualNodes: number;
  renderedNodes: number;
  visualEdges: number;
  renderedEdges: number;
  run: number;
  readyMs: number;
  initialLongTasks: LongTaskSample[];
  domElements: number;
  canvasElements: number;
  heapBytes: number | null;
  timings: G6Timings;
  hover: ActionSample;
  routeOpen: ActionSample;
  focusedRouteOpen: ActionSample;
  routeHighlight: ActionSample;
};

type PerfWindow = Window & {
  __derivonLongTasks?: LongTaskSample[];
  __derivonStartedAt?: number;
  __g6Benchmark?: {
    ready: boolean;
    timings: G6Timings;
    concepts: number;
    visualNodes: number;
    renderedNodes: number;
    visualEdges: number;
    renderedEdges: number;
    hoverNode: (id: string) => Promise<void>;
    openRouteMode: () => void;
    closeRouteMode: () => void;
    focusNode: (id: string) => void;
    highlightRoute: (count?: number) => Promise<void>;
  };
};

const sizes = (process.env.PERF_SIZES ?? '64,250,1000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value >= 4);
const runCount = Math.max(1, Number(process.env.PERF_RUNS ?? 3));
const labelMode = process.env.G6_LABELS === 'all' ? 'all' : 'none';
const edgeMode = process.env.G6_EDGES === 'all' ? 'all' : 'none';
const derivationMode = process.env.G6_DERIVATIONS === 'all' ? 'all' : 'none';
const batchSize = Math.max(1, Number(process.env.G6_BATCH_SIZE ?? 300));

function percentile(values: number[], ratio: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))];
}

function summarize(samples: G6RunSample[]) {
  const metric = (select: (sample: G6RunSample) => number) => {
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
    visualNodes: samples[0].visualNodes,
    renderedNodes: samples[0].renderedNodes,
    visualEdges: samples[0].visualEdges,
    renderedEdges: samples[0].renderedEdges,
    runs: samples.length,
    readyMs: metric((sample) => sample.readyMs),
    hoverMs: metric((sample) => sample.hover.elapsedMs),
    routeOpenMs: metric((sample) => sample.routeOpen.elapsedMs),
    focusedRouteOpenMs: metric((sample) => sample.focusedRouteOpen.elapsedMs),
    routeHighlightMs: metric((sample) => sample.routeHighlight.elapsedMs),
    domElements: samples[0].domElements,
    canvasElements: samples[0].canvasElements,
    heapBytes: samples.map((sample) => sample.heapBytes),
  };
}

async function installObserver(page: Page) {
  await page.addInitScript(() => {
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
  });
}

async function measureApiAction(
  page: Page,
  method: 'hoverNode' | 'openRouteMode' | 'highlightRoute',
  argument?: string | number,
): Promise<ActionSample> {
  return page.evaluate(async ({ methodName, argumentValue }) => {
    const perfWindow = window as PerfWindow;
    const benchmark = perfWindow.__g6Benchmark;
    if (!benchmark) throw new Error('G6 benchmark API is unavailable');
    const longTasks = perfWindow.__derivonLongTasks ?? [];
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    longTasks.length = 0;
    const startedAt = performance.now();
    if (methodName === 'hoverNode') await benchmark.hoverNode(String(argumentValue));
    else if (methodName === 'highlightRoute') await benchmark.highlightRoute(Number(argumentValue));
    else benchmark.openRouteMode();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    for (const canvas of document.querySelectorAll('canvas')) {
      canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
    }
    const elapsedMs = performance.now() - startedAt;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return { elapsedMs, longTasks: [...longTasks] };
  }, { methodName: method, argumentValue: argument });
}

async function runSample(browser: Browser, concepts: number, run: number): Promise<G6RunSample> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installObserver(page);
  await page.goto(
    `/benchmarks/g6.html?concepts=${concepts}&labels=${labelMode}&edges=${edgeMode}&derivations=${derivationMode}&batch=${batchSize}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(() => (window as PerfWindow).__g6Benchmark?.ready === true, null, {
    timeout: 120_000,
  });
  const readyMs = await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    for (const canvas of document.querySelectorAll('canvas')) {
      canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
    }
    return performance.now() - ((window as PerfWindow).__derivonStartedAt ?? 0);
  });
  await page.waitForTimeout(300);

  const initial = await page.evaluate(() => {
    const perfWindow = window as PerfWindow;
    const benchmark = perfWindow.__g6Benchmark;
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    if (!benchmark) throw new Error('G6 benchmark API is unavailable');
    return {
      concepts: benchmark.concepts,
      timings: benchmark.timings,
      visualNodes: benchmark.visualNodes,
      renderedNodes: benchmark.renderedNodes,
      visualEdges: benchmark.visualEdges,
      renderedEdges: benchmark.renderedEdges,
      initialLongTasks: [...(perfWindow.__derivonLongTasks ?? [])],
      domElements: document.getElementsByTagName('*').length,
      canvasElements: document.querySelectorAll('canvas').length,
      heapBytes: memory.memory?.usedJSHeapSize ?? null,
    };
  });

  const middleId = `p-${Math.floor(concepts / 2)}`;
  const hover = await measureApiAction(page, 'hoverNode', middleId);
  const routeOpen = await measureApiAction(page, 'openRouteMode');
  await page.evaluate((id) => {
    const benchmark = (window as PerfWindow).__g6Benchmark;
    benchmark?.closeRouteMode();
    benchmark?.focusNode(id);
  }, middleId);
  const focusedRouteOpen = await measureApiAction(page, 'openRouteMode');
  const routeHighlight = await measureApiAction(page, 'highlightRoute', 64);

  await context.close();
  return {
    ...initial,
    run,
    readyMs,
    hover,
    routeOpen,
    focusedRouteOpen,
    routeHighlight,
  };
}

test.describe('G6 Canvas vertical-slice performance', () => {
  test.describe.configure({ mode: 'serial' });

  for (const concepts of sizes) {
    test(`${concepts} concepts`, async ({ browser }, testInfo) => {
      const samples: G6RunSample[] = [];
      for (let run = 1; run <= runCount; run += 1) {
        samples.push(await runSample(browser, concepts, run));
      }
      const result = {
        surface: `g6-canvas-labels-${labelMode}-edges-${edgeMode}-derivations-${derivationMode}-batch-${batchSize}`,
        summary: summarize(samples),
        samples,
      };
      console.log(`PERF_RESULT ${JSON.stringify(result)}`);
      await testInfo.attach(`g6-canvas-${concepts}.json`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      expect(samples.every((sample) => sample.visualNodes === concepts * 2)).toBe(true);
      expect(samples.every((sample) => sample.visualEdges === concepts * 3)).toBe(true);
      expect(samples.every((sample) => sample.canvasElements > 0)).toBe(true);
    });
  }
});
