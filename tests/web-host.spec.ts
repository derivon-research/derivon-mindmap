import { expect, test } from '@playwright/test';
import { TEST_HOOK_VERSION } from '../src/testHooks';
import { findCanvasPixel } from '../src/testing/canvasPixels';
import { collectHooks, collectedHooks } from './hookProbe';

test('opens straight into the learning side, with no workspace to choose', async ({ page }) => {
  await page.goto('/');

  const learning = page.locator('[data-derivon-mode="learning"]');
  await expect(learning).toBeVisible();
  await expect(page.getByLabel('打开工作区')).toHaveCount(0);
  await expect(page.locator('.app')).toHaveAttribute('data-derivon-host', 'web');
});

test('offers no authoring entry, because a web build has no authoring side', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-derivon-mode="learning"]')).toBeVisible();

  await expect(page.getByRole('group', { name: '模式' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '创作' })).toHaveCount(0);
  await expect(page.locator('[data-derivon-mode="authoring"]')).toHaveCount(0);
});

test('announces interactive once, after the lazy graph is ready, on the versioned test-hook contract', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('derivon:test-hook', (event) => {
      if ((event as CustomEvent).detail.kind !== 'interactive') return;
      document.documentElement.dataset.graphReadyAtInteractive = String(
        document.querySelector('[aria-label="Knowledge graph"]')?.getAttribute('aria-busy') === 'false',
      );
    });
  });
  await collectHooks(page);
  await page.goto('/');
  await expect(page.locator('[data-derivon-mode="learning"]')).toBeVisible();

  await expect
    .poll(async () => (await collectedHooks(page)).filter((hook) => hook.kind === 'interactive').length)
    .toBe(1);

  const [interactive] = await collectedHooks(page);
  expect(interactive.version).toBe(TEST_HOOK_VERSION);
  expect(interactive.sequence).toBe(1);
  expect(interactive.completedAtMs).toBeGreaterThan(0);
  await expect(page.locator('html')).toHaveAttribute('data-graph-ready-at-interactive', 'true');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`renders and selects the bundled graph at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
    const point = await page.evaluate(findCanvasPixel, { clientCoordinates: true });
    expect(point, 'The graph must have painted concept pixels').toBeDefined();
    await page.mouse.click(point!.x, point!.y);
    await expect(page.getByLabel('Selected concept')).not.toBeEmpty();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('overview.png') });
  });
}

test('does not ship a guided tour', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-derivon-mode="learning"]')).toBeVisible();

  await expect(page.getByRole('button', { name: '操作引导' })).toHaveCount(0);
  await expect(page.locator('.react-joyride__overlay')).toHaveCount(0);
});
