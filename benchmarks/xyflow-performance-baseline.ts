import { expect, test, type Browser, type Page } from '@playwright/test';
type LongTaskSample = { start: number; duration: number };

type ActionSample = {
  elapsedMs: number;
  longTasks: LongTaskSample[];
};

type RunSample = {
  concepts: number;
  visualNodes: number;
  visualEdges: number;
  run: number;
  readyMs: number;
  initialLongTasks: LongTaskSample[];
  domElements: number;
  renderedNodes: number;
  renderedEdges: number;
  heapBytes: number | null;
  hover: ActionSample;
  routeOpen: ActionSample;
  focusedRouteOpen: ActionSample;
};

type PerfWindow = Window & {
  __derivonLongTasks?: LongTaskSample[];
  __derivonStartedAt?: number;
};

const sizes = (process.env.PERF_SIZES ?? '64,250,1000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value >= 4);
const runCount = Math.max(1, Number(process.env.PERF_RUNS ?? 3));

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
    visualNodes: samples[0].visualNodes,
    visualEdges: samples[0].visualEdges,
    runs: samples.length,
    readyMs: metric((sample) => sample.readyMs),
    hoverMs: metric((sample) => sample.hover.elapsedMs),
    routeOpenMs: metric((sample) => sample.routeOpen.elapsedMs),
    focusedRouteOpenMs: metric((sample) => sample.focusedRouteOpen.elapsedMs),
    domElements: samples[0].domElements,
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
        title: `Performance ${concepts}`,
        description: 'Synthetic cyclic B-hypergraph performance fixture',
      },
      graph: { points, hyperedges },
      view: { replacements: [] },
    };
    localStorage.setItem('derivon.authoring.workspace/v0.3.0', JSON.stringify({ manifest, files }));
  }, { concepts });
}

async function measureBrowserAction(
  page: Page,
  action: 'hover' | 'route-open',
  concepts: number,
): Promise<ActionSample> {
  return page.evaluate(async ({ actionName, middle }) => {
    const perfWindow = window as PerfWindow;
    const longTasks = perfWindow.__derivonLongTasks ?? [];
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    longTasks.length = 0;
    const startedAt = performance.now();
    if (actionName === 'hover') {
      document.querySelector(`.react-flow__node[data-id="p-${middle}"]`)
        ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    } else {
      document.querySelector<HTMLButtonElement>('button[title="打开路线模式"]')?.click();
    }
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const elapsedMs = performance.now() - startedAt;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return {
      elapsedMs,
      longTasks: [...longTasks],
    };
  }, { actionName: action, middle: Math.floor(concepts / 2) });
}

async function closeRouteAndFocusMiddle(page: Page, concepts: number) {
  await page.evaluate(async (middle) => {
    document.querySelector<HTMLButtonElement>('button[title="关闭路线模式"]')?.click();
    await new Promise(requestAnimationFrame);
    document.querySelector(`.react-flow__node[data-id="p-${middle}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(requestAnimationFrame);
    document.querySelector(`.react-flow__node[data-id="p-${middle}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(requestAnimationFrame);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }, Math.floor(concepts / 2));
}

async function runSample(browser: Browser, concepts: number, run: number): Promise<RunSample> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installWorkspace(page, concepts);
  await page.goto('/legacy.html', { waitUntil: 'domcontentloaded' });
  await page.getByTitle('打开路线模式').waitFor({ state: 'visible', timeout: 120_000 });
  const readyMs = await page.evaluate(() => performance.now() - ((window as PerfWindow).__derivonStartedAt ?? 0));
  await page.waitForTimeout(300);

  const initial = await page.evaluate(() => {
    const perfWindow = window as PerfWindow;
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      initialLongTasks: [...(perfWindow.__derivonLongTasks ?? [])],
      domElements: document.getElementsByTagName('*').length,
      renderedNodes: document.querySelectorAll('.react-flow__node').length,
      renderedEdges: document.querySelectorAll('.react-flow__edge').length,
      heapBytes: memory.memory?.usedJSHeapSize ?? null,
    };
  });
  const hover = await measureBrowserAction(page, 'hover', concepts);
  const routeOpen = await measureBrowserAction(page, 'route-open', concepts);
  await closeRouteAndFocusMiddle(page, concepts);
  const focusedRouteOpen = await measureBrowserAction(page, 'route-open', concepts);

  await context.close();
  return {
    concepts,
    visualNodes: concepts * 2,
    visualEdges: concepts * 3,
    run,
    readyMs,
    ...initial,
    hover,
    routeOpen,
    focusedRouteOpen,
  };
}

test.describe('XYFlow graph performance baseline', () => {
  test.describe.configure({ mode: 'serial' });

  for (const concepts of sizes) {
    test(`${concepts} concepts`, async ({ browser }, testInfo) => {
      const samples: RunSample[] = [];
      for (let run = 1; run <= runCount; run += 1) {
        samples.push(await runSample(browser, concepts, run));
      }
      const result = { surface: 'xyflow', summary: summarize(samples), samples };
      console.log(`PERF_RESULT ${JSON.stringify(result)}`);
      await testInfo.attach(`xyflow-${concepts}.json`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });

      expect(samples.every((sample) => sample.renderedNodes === sample.visualNodes)).toBe(true);
      expect(samples.every((sample) => sample.renderedEdges === sample.visualEdges)).toBe(true);
    });
  }
});
