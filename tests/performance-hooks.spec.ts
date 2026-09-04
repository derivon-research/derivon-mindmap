import { expect, test, type Page } from '@playwright/test';
import {
  TEST_HOOK_EVENT,
  TEST_HOOK_VERSION,
  type DerivonTestHook,
  type TestHookInteraction,
} from '../src/testHooks';

type HookExpectation = {
  kind: DerivonTestHook['kind'];
  interaction?: TestHookInteraction;
  context?: Record<string, string | boolean>;
};
type TestWindow = Window & {
  __testHookEvents?: DerivonTestHook[];
  __interactiveSnapshot?: { layoutReady: boolean; rendererReady: boolean };
};

async function installRecorder(page: Page): Promise<void> {
  await page.addInitScript((eventName) => {
    const testWindow = window as TestWindow;
    testWindow.__testHookEvents = [];
    window.addEventListener(eventName, (event) => {
      const detail = (event as CustomEvent<DerivonTestHook>).detail;
      testWindow.__testHookEvents?.push(detail);
      if (detail.kind === 'interactive') {
        testWindow.__interactiveSnapshot = {
          layoutReady: document.querySelector('.app-shell')?.getAttribute('data-layout-ready') === 'true',
          rendererReady: document.querySelector('.g6-graph-surface')?.getAttribute('data-ready') === 'true',
        };
      }
    });
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
      version: 2,
      completedTours: [],
      progress: {},
    }));
  }, TEST_HOOK_EVENT);
}

async function expectHook(page: Page, expected: HookExpectation): Promise<void> {
  await expect.poll(() => page.evaluate(({ match, hookVersion }) => {
    const events = (window as TestWindow).__testHookEvents ?? [];
    return events.some((event) => {
      const interaction = 'interaction' in event ? event.interaction : undefined;
      const context = 'context' in event
        ? event.context as Record<string, string | boolean>
        : undefined;
      return event.version === hookVersion
        && event.kind === match.kind
        && interaction === match.interaction
        && Object.entries(match.context ?? {}).every(([key, value]) => context?.[key] === value);
    });
  }, { match: expected, hookVersion: TEST_HOOK_VERSION }), { timeout: 120_000 }).toBe(true);
}

test('math-reforged workspace emits the runtime performance hook contract', async ({ page }) => {
  await installRecorder(page);
  await page.goto('/?example=math-reforged');
  await expectHook(page, { kind: 'interactive' });
  expect(await page.evaluate(() => (window as TestWindow).__interactiveSnapshot)).toEqual({
    layoutReady: true,
    rendererReady: true,
  });

  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill('linear-map');
  await page.getByRole('option', { name: /linear-map/ }).click();
  await expectHook(page, {
    kind: 'interaction-complete',
    interaction: 'select-concept',
    context: { conceptId: 'linear-map' },
  });

  await page.getByTitle('打开路线模式').click();
  await expectHook(page, {
    kind: 'interaction-complete',
    interaction: 'toggle-panel',
    context: { panel: 'route', expanded: true },
  });

  const targetSearch = page.getByRole('combobox', { name: '目标概念', exact: true });
  await targetSearch.fill('null-range');
  await page.getByRole('listbox', { name: '目标概念搜索结果' }).getByRole('checkbox').click();
  await expectHook(page, {
    kind: 'interaction-complete',
    interaction: 'switch-target',
    context: { conceptId: 'null-range', selected: true },
  });

  await page.getByTitle('关闭路线模式').first().click();
  await expectHook(page, {
    kind: 'interaction-complete',
    interaction: 'toggle-panel',
    context: { panel: 'route', expanded: false },
  });

  const events = await page.evaluate(() => (window as TestWindow).__testHookEvents ?? []);
  expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
  expect(events.every((event) => Number.isFinite(event.completedAtMs) && event.completedAtMs >= 0)).toBe(true);
  expect(events.filter((event) => event.kind === 'interaction-complete').every((event) =>
    Number.isFinite(event.startedAtMs) && event.completedAtMs >= event.startedAtMs,
  )).toBe(true);
});
