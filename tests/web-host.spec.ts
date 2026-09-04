import { expect, test } from '@playwright/test';
import { TEST_HOOK_VERSION } from '../src/testHooks';
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

test('announces interactive once, on the versioned test-hook contract', async ({ page }) => {
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
});

test('does not ship a guided tour', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-derivon-mode="learning"]')).toBeVisible();

  await expect(page.getByRole('button', { name: '操作引导' })).toHaveCount(0);
  await expect(page.locator('.react-joyride__overlay')).toHaveCount(0);
});
