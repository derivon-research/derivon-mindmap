import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  TEST_HOOK_EVENT,
  TEST_HOOK_VERSION,
  type DerivonTestHook,
} from '../src/testHooks';
import { createGeneratedRuntimeWorkspace, type RuntimeWorkspaceFixture } from './fixtures/generated-workspace';

const READY_THRESHOLD_MS = 2_500;
const INTERACTION_THRESHOLD_MS = 200;

function integerEnvironmentValue(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

const concepts = integerEnvironmentValue('PERF_SIZE', 1000, 100);
const runCount = integerEnvironmentValue('PERF_RUNS', 5, 3);

type PerfWindow = Window & {
  __derivonPerfEvents?: DerivonTestHook[];
  __derivonRejectedHookVersion?: number;
};
type Distribution = {
  samples: number;
  min: number;
  median: number;
  p75: number;
  p95: number;
  max: number;
};
type RunSample = {
  run: number;
  readyMs: number;
  selectPointMs: number;
  switchTargetMs: number;
  panelExpandMs: number;
  panelCollapseMs: number;
};

function percentile(values: number[], ratio: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)];
}

function distribution(values: number[]): Distribution {
  return {
    samples: values.length,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

function summarize(samples: RunSample[]) {
  return {
    runs: samples.length,
    readyMs: distribution(samples.map((sample) => sample.readyMs)),
    interactionMs: {
      selectPoint: distribution(samples.map((sample) => sample.selectPointMs)),
      switchTarget: distribution(samples.map((sample) => sample.switchTargetMs)),
      togglePanel: distribution(samples.flatMap((sample) => [sample.panelExpandMs, sample.panelCollapseMs])),
    },
  };
}

function formatDistribution(name: string, values: Distribution, threshold: number): string {
  const number = (value: number) => value.toFixed(1).padStart(7);
  return `| ${name} | ${values.samples} | ${number(values.min)} | ${number(values.median)} | ${number(values.p75)} | ${number(values.p95)} | ${number(values.max)} | ${threshold} |`;
}

function formatSummary(fixture: RuntimeWorkspaceFixture, summary: ReturnType<typeof summarize>): string {
  return [
    `# Runtime performance: ${fixture.name}`,
    '',
    `Fixture size: ${fixture.concepts} concepts. Browser samples: ${summary.runs}.`,
    '',
    '| Metric | Samples | Min ms | Median ms | P75 ms | P95 ms | Max ms | Limit ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    formatDistribution('Open to interactive', summary.readyMs, READY_THRESHOLD_MS),
    formatDistribution('Select point', summary.interactionMs.selectPoint, INTERACTION_THRESHOLD_MS),
    formatDistribution('Switch target', summary.interactionMs.switchTarget, INTERACTION_THRESHOLD_MS),
    formatDistribution('Toggle panel', summary.interactionMs.togglePanel, INTERACTION_THRESHOLD_MS),
    '',
  ].join('\n');
}

async function installFixture(page: Page, fixture: RuntimeWorkspaceFixture): Promise<void> {
  await page.addInitScript(({ eventName, hookVersion, workspace }) => {
    const perfWindow = window as PerfWindow;
    perfWindow.__derivonPerfEvents = [];
    window.addEventListener(eventName, (event) => {
      const detail = (event as CustomEvent<Partial<DerivonTestHook>>).detail;
      if (detail.version !== hookVersion) {
        perfWindow.__derivonRejectedHookVersion = detail.version;
        return;
      }
      perfWindow.__derivonPerfEvents?.push(detail as DerivonTestHook);
    });
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
      version: 2,
      completedTours: [],
      progress: {},
    }));
    localStorage.setItem('derivon.authoring.workspace/v0.3.0', JSON.stringify(workspace));
  }, { eventName: TEST_HOOK_EVENT, hookVersion: TEST_HOOK_VERSION, workspace: fixture.workspace });
}

async function waitForHook(
  page: Page,
  afterSequence: number,
  expected: Pick<DerivonTestHook, 'kind' | 'interaction'> & { context?: Record<string, string | boolean> },
): Promise<DerivonTestHook> {
  await page.waitForFunction(({ minimumSequence, match, hookVersion }) => {
    const perfWindow = window as PerfWindow;
    if (perfWindow.__derivonRejectedHookVersion !== undefined) {
      throw new Error(`Unsupported Derivon test-hook version: ${perfWindow.__derivonRejectedHookVersion}`);
    }
    const events = perfWindow.__derivonPerfEvents ?? [];
    return events.some((event) => event.version === hookVersion
      && event.sequence > minimumSequence
      && event.kind === match.kind
      && event.interaction === match.interaction
      && Object.entries(match.context ?? {}).every(([key, value]) => event.context?.[key] === value));
  }, { minimumSequence: afterSequence, match: expected, hookVersion: TEST_HOOK_VERSION }, { timeout: 120_000 });

  return page.evaluate(({ minimumSequence, match, hookVersion }) => {
    const events = (window as PerfWindow).__derivonPerfEvents ?? [];
    const event = events.find((candidate) => candidate.version === hookVersion
      && candidate.sequence > minimumSequence
      && candidate.kind === match.kind
      && candidate.interaction === match.interaction
      && Object.entries(match.context ?? {}).every(([key, value]) => candidate.context?.[key] === value));
    if (!event) throw new Error(`Missing ${match.kind} test hook`);
    return event;
  }, { minimumSequence: afterSequence, match: expected, hookVersion: TEST_HOOK_VERSION });
}

async function lastSequence(page: Page): Promise<number> {
  return page.evaluate(() => (window as PerfWindow).__derivonPerfEvents?.at(-1)?.sequence ?? 0);
}

async function measureInteraction(
  page: Page,
  expected: Pick<DerivonTestHook, 'kind' | 'interaction'> & { context?: Record<string, string | boolean> },
  trigger: () => Promise<void>,
): Promise<number> {
  const sequence = await lastSequence(page);
  const startedAt = await page.evaluate(() => performance.now());
  await trigger();
  const completed = await waitForHook(page, sequence, expected);
  return completed.completedAtMs - startedAt;
}

async function runSample(
  browser: Browser,
  fixture: RuntimeWorkspaceFixture,
  run: number,
): Promise<RunSample> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installFixture(page, fixture);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const interactive = await waitForHook(page, 0, { kind: 'interactive' });

  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill(fixture.interactions.selectedPointId);
  const selectPointMs = await measureInteraction(
    page,
    {
      kind: 'interaction-complete',
      interaction: 'select-point',
      context: { pointId: fixture.interactions.selectedPointId },
    },
    () => page.getByRole('option', { name: new RegExp(fixture.interactions.selectedPointId) }).first().click(),
  );

  const panelExpandMs = await measureInteraction(
    page,
    { kind: 'interaction-complete', interaction: 'toggle-panel', context: { panel: 'route', expanded: true } },
    () => page.getByTitle('打开路线模式').click(),
  );

  const targetSearch = page.getByRole('combobox', { name: '目标概念', exact: true });
  await targetSearch.fill(fixture.interactions.targetPointId);
  const switchTargetMs = await measureInteraction(
    page,
    {
      kind: 'interaction-complete',
      interaction: 'switch-target',
      context: { pointId: fixture.interactions.targetPointId, selected: true },
    },
    () => page.getByRole('listbox', { name: '目标概念搜索结果' }).getByRole('checkbox').first().click(),
  );

  const panelCollapseMs = await measureInteraction(
    page,
    { kind: 'interaction-complete', interaction: 'toggle-panel', context: { panel: 'route', expanded: false } },
    () => page.getByTitle('关闭路线模式').first().click(),
  );

  await context.close();
  return {
    run,
    readyMs: interactive.completedAtMs,
    selectPointMs,
    switchTargetMs,
    panelExpandMs,
    panelCollapseMs,
  };
}

test.describe('runtime performance budget', () => {
  test.describe.configure({ mode: 'serial' });

  test(`${concepts} concept generated workspace`, async ({ browser }, testInfo) => {
    const fixture = createGeneratedRuntimeWorkspace(concepts);
    const samples: RunSample[] = [];
    for (let run = 1; run <= runCount; run += 1) {
      samples.push(await runSample(browser, fixture, run));
    }

    const summary = summarize(samples);
    const markdown = formatSummary(fixture, summary);
    const result = {
      surface: 'runtime-test-hook-v1',
      fixture: { name: fixture.name, concepts: fixture.concepts },
      thresholds: { readyMs: READY_THRESHOLD_MS, interactionMs: INTERACTION_THRESHOLD_MS },
      summary,
      samples,
    };
    console.log(`\n${markdown}`);
    console.log(`PERF_RESULT ${JSON.stringify(result)}`);
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/runtime-performance-summary.md', markdown);
    await testInfo.attach('runtime-performance.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('runtime-performance-summary.md', {
      body: markdown,
      contentType: 'text/markdown',
    });

    expect(summary.readyMs.max, 'open to interactive budget').toBeLessThanOrEqual(READY_THRESHOLD_MS);
    expect(summary.interactionMs.selectPoint.max, 'select point budget').toBeLessThanOrEqual(INTERACTION_THRESHOLD_MS);
    expect(summary.interactionMs.switchTarget.max, 'switch target budget').toBeLessThanOrEqual(INTERACTION_THRESHOLD_MS);
    expect(summary.interactionMs.togglePanel.max, 'toggle panel budget').toBeLessThanOrEqual(INTERACTION_THRESHOLD_MS);
  });
});
