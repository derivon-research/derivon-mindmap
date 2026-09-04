import { expect, test, type Page } from '@playwright/test';

const TEST_HOOK_EVENT = 'derivon:test-hook';

type TestHookEvent = {
  version: 1;
  sequence: number;
  at: number;
  kind: 'interactive' | 'interaction-complete';
  interaction?: 'select-point' | 'switch-target' | 'toggle-panel';
  context?: Record<string, string | boolean>;
};
type TestWindow = Window & { __testHookEvents?: TestHookEvent[] };

async function installRecorder(page: Page): Promise<void> {
  await page.addInitScript((eventName) => {
    const testWindow = window as TestWindow;
    testWindow.__testHookEvents = [];
    window.addEventListener(eventName, (event) => {
      testWindow.__testHookEvents?.push((event as CustomEvent<TestHookEvent>).detail);
    });
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
      version: 2,
      completedTours: [],
      progress: {},
    }));
  }, TEST_HOOK_EVENT);
}

async function expectHook(
  page: Page,
  expected: Pick<TestHookEvent, 'kind' | 'interaction'> & { context?: Record<string, string | boolean> },
): Promise<void> {
  await expect.poll(() => page.evaluate((match) => {
    const events = (window as TestWindow).__testHookEvents ?? [];
    return events.some((event) => event.version === 1
      && event.kind === match.kind
      && event.interaction === match.interaction
      && Object.entries(match.context ?? {}).every(([key, value]) => event.context?.[key] === value));
  }, expected)).toBe(true);
}

test('math-reforged workspace emits the runtime performance hook contract', async ({ page }) => {
  await installRecorder(page);
  await page.goto('/?example=math-reforged');
  await expectHook(page, { kind: 'interactive' });

  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill('linear-map');
  await page.getByRole('option', { name: /linear-map/ }).click();
  await expectHook(page, {
    kind: 'interaction-complete',
    interaction: 'select-point',
    context: { pointId: 'linear-map' },
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
    context: { pointId: 'null-range', selected: true },
  });

  await page.getByTitle('关闭路线模式').first().click();
  await expectHook(page, {
    kind: 'interaction-complete',
    interaction: 'toggle-panel',
    context: { panel: 'route', expanded: false },
  });

  const events = await page.evaluate(() => (window as TestWindow).__testHookEvents ?? []);
  expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
  expect(events.every((event) => Number.isFinite(event.at) && event.at >= 0)).toBe(true);
});
