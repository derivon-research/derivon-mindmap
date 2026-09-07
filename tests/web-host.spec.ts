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

test('announces interactive once, after the opening questions are ready, on the versioned test-hook contract', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('derivon:test-hook', (event) => {
      if ((event as CustomEvent).detail.kind !== 'interactive') return;
      document.documentElement.dataset.openingReadyAtInteractive = String(
        Boolean(document.querySelector('[aria-label="目标与已知"] button'))
          && !document.querySelector('[role="status"], [aria-busy="true"]'),
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
  await expect(page.locator('html')).toHaveAttribute('data-opening-ready-at-interactive', 'true');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`renders and selects the bundled graph at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route('https://**/*', (route) => route.abort());
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    // The overview sits beside the orientation thread from the first frame: the learner can
    // point at a concept before answering anything.
    await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
    const point = await page.evaluate(findCanvasPixel, { clientCoordinates: true });
    expect(point, 'The graph must have painted concept pixels').toBeDefined();
    await page.mouse.click(point!.x, point!.y);

    // Reading is a full pane beside the map, not a card folded into the thread.
    const reader = page.locator('.learning-reader');
    await expect(reader).toBeVisible();
    const label = (await reader.getAttribute('aria-label'))!.replace(/ 文档$/, '');
    await expect(reader.frameLocator('iframe').getByRole('heading', { name: label, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('overview.png') });
  });
}

test('carries the bundled example through every learning view the top bar offers', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');

  // The bundled workspace seeds its targets from the author's orientation config, so the
  // route entry is live from the first frame — no answer needed to reach the other views.
  await expect(page.locator('[data-derivon-mode="learning"]')).not.toHaveAttribute('data-learning-targets', '');

  await page.getByRole('button', { name: '路线学习' }).click();
  // No solver ships with the web build, and the preview says so rather than inventing an order.
  await expect(page.getByRole('heading', { name: '还没有可以走的路线' })).toBeVisible();
  await expect(page.getByText('这个宿主还不能求解路线')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始学' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('preview.png') });

  await page.getByRole('button', { name: '先去大图里看看' }).click();
  await expect(page.locator('.learning-browse')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
  const browsePoint = await page.evaluate(findCanvasPixel, { clientCoordinates: true });
  await page.mouse.click(browsePoint!.x, browsePoint!.y);
  const inspector = page.locator('.learning-reader');
  await expect(inspector).toBeVisible();
  const label = (await inspector.getAttribute('aria-label'))!.replace(/ 文档$/, '');
  await expect(inspector.frameLocator('iframe').getByRole('heading', { name: label, exact: true })).toBeVisible();

  await inspector.getByRole('button', { name: '看关联 →' }).click();
  await expect(page.locator('.learning-browse')).not.toHaveAttribute('data-browse-focus', '');
  await page.getByRole('button', { name: '回到全图' }).click();

  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test('does not ship a guided tour', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-derivon-mode="learning"]')).toBeVisible();

  await expect(page.getByRole('button', { name: '操作引导' })).toHaveCount(0);
  await expect(page.locator('.react-joyride__overlay')).toHaveCount(0);
});
