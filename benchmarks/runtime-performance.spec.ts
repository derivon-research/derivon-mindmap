import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  TEST_HOOK_EVENT,
  TEST_HOOK_VERSION,
  type DerivonTestHook,
  type TestHookInteraction,
} from '../src/testHooks';
import { createGeneratedRuntimeWorkspace, type RuntimeWorkspaceFixture } from './fixtures/generated-workspace';
import {
  formatRuntimeSummary,
  INTERACTION_THRESHOLD_MS,
  READY_THRESHOLD_MS,
  summarizeRuntime,
  type RuntimeSample,
} from './runtime-metrics';

function integerEnvironmentValue(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

const concepts = integerEnvironmentValue('PERF_SIZE', 1000, 100);
const runCount = integerEnvironmentValue('PERF_RUNS', 5, 3);

type HookExpectation = {
  kind: DerivonTestHook['kind'];
  interaction?: TestHookInteraction;
  context?: Record<string, string | boolean>;
};
type PerfWindow = Window & {
  __derivonPerfEvents?: DerivonTestHook[];
  __derivonRejectedHookVersion?: unknown;
};

async function prepareFixture(page: Page, fixture: RuntimeWorkspaceFixture): Promise<void> {
  await page.goto('/robots.txt');
  await page.evaluate((workspace) => {
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
      version: 2,
      completedTours: [],
      progress: {},
    }));
    localStorage.setItem('derivon.authoring.workspace/v0.3.0', JSON.stringify(workspace));
  }, fixture.workspace);

  await page.addInitScript(({ eventName, hookVersion }) => {
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
  }, { eventName: TEST_HOOK_EVENT, hookVersion: TEST_HOOK_VERSION });
}

async function waitForHook(
  page: Page,
  afterSequence: number,
  expected: HookExpectation,
): Promise<DerivonTestHook> {
  const handle = await page.waitForFunction(({ minimumSequence, match, hookVersion }) => {
    const perfWindow = window as PerfWindow;
    if (perfWindow.__derivonRejectedHookVersion !== undefined) {
      throw new Error(`Unsupported Derivon test-hook version: ${String(perfWindow.__derivonRejectedHookVersion)}`);
    }
    const events = perfWindow.__derivonPerfEvents ?? [];
    return events.find((event) => {
      const interaction = 'interaction' in event ? event.interaction : undefined;
      const context = 'context' in event
        ? event.context as Record<string, string | boolean>
        : undefined;
      return event.version === hookVersion
        && event.sequence > minimumSequence
        && event.kind === match.kind
        && interaction === match.interaction
        && Object.entries(match.context ?? {}).every(([key, value]) => context?.[key] === value);
    }) ?? false;
  }, { minimumSequence: afterSequence, match: expected, hookVersion: TEST_HOOK_VERSION }, { timeout: 120_000 });
  const event = await handle.jsonValue();
  await handle.dispose();
  if (!event) throw new Error(`Missing ${expected.kind} test hook`);
  return event as DerivonTestHook;
}

async function lastSequence(page: Page): Promise<number> {
  return page.evaluate(() => (window as PerfWindow).__derivonPerfEvents?.at(-1)?.sequence ?? 0);
}

async function measureInteraction(
  page: Page,
  expected: HookExpectation,
  trigger: () => Promise<void>,
): Promise<number> {
  const sequence = await lastSequence(page);
  await trigger();
  const completed = await waitForHook(page, sequence, expected);
  if (completed.kind !== 'interaction-complete') {
    throw new Error(`Expected interaction-complete, received ${completed.kind}`);
  }
  return completed.completedAtMs - completed.startedAtMs;
}

async function runSample(
  browser: Browser,
  fixture: RuntimeWorkspaceFixture,
  run: number,
): Promise<RuntimeSample> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await prepareFixture(page, fixture);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const interactive = await waitForHook(page, 0, { kind: 'interactive' });

  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill(fixture.interactions.selectedConceptId);
  const selectConceptMs = await measureInteraction(
    page,
    {
      kind: 'interaction-complete',
      interaction: 'select-concept',
      context: { conceptId: fixture.interactions.selectedConceptId },
    },
    () => page.getByRole('option', { name: new RegExp(fixture.interactions.selectedConceptId) }).first().click(),
  );

  const panelExpandMs = await measureInteraction(
    page,
    { kind: 'interaction-complete', interaction: 'toggle-panel', context: { panel: 'route', expanded: true } },
    () => page.getByTitle('打开路线模式').click(),
  );

  const targetSearch = page.getByRole('combobox', { name: '目标概念', exact: true });
  await targetSearch.fill(fixture.interactions.targetConceptId);
  const switchTargetMs = await measureInteraction(
    page,
    {
      kind: 'interaction-complete',
      interaction: 'switch-target',
      context: { conceptId: fixture.interactions.targetConceptId, selected: true },
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
    selectConceptMs,
    switchTargetMs,
    panelExpandMs,
    panelCollapseMs,
  };
}

test.describe('runtime performance budget', () => {
  test.describe.configure({ mode: 'serial' });

  test(`${concepts} concept generated workspace`, async ({ browser }, testInfo) => {
    const fixture = createGeneratedRuntimeWorkspace(concepts);
    const samples: RuntimeSample[] = [];
    for (let run = 1; run <= runCount; run += 1) {
      samples.push(await runSample(browser, fixture, run));
    }

    const summary = summarizeRuntime(samples);
    const markdown = formatRuntimeSummary('web', fixture.name, fixture.concepts, summary);
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
    expect(summary.interactionMs.selectConcept.max, 'select concept budget').toBeLessThanOrEqual(INTERACTION_THRESHOLD_MS);
    expect(summary.interactionMs.switchTarget.max, 'switch target budget').toBeLessThanOrEqual(INTERACTION_THRESHOLD_MS);
    expect(summary.interactionMs.togglePanel.max, 'toggle panel budget').toBeLessThanOrEqual(INTERACTION_THRESHOLD_MS);
  });
});
