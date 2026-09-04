import { expect, test, type Page } from '@playwright/test';
import { RECENT_WORKSPACES_KEY } from '../src/hosts/desktop/recentWorkspaces';
import { collectHooks, collectedHooks } from './hookProbe';

async function seedRecentWorkspace(page: Page): Promise<void> {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, {
    key: RECENT_WORKSPACES_KEY,
    value: JSON.stringify({
      version: 1,
      workspaces: [{ path: '/tmp/math-reforged', name: 'math-reforged', openedAtMs: 1 }],
    }),
  });
}

async function openWorkspace(page: Page): Promise<void> {
  await seedRecentWorkspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: /math-reforged/ }).click();
  await expect(page.locator('[data-derivon-mode="authoring"]')).toBeVisible();
}

test('opens on the recent workspaces, not on a mode chooser', async ({ page }) => {
  await seedRecentWorkspace(page);
  await page.goto('/');

  const launch = page.getByLabel('打开工作区');
  await expect(launch).toBeVisible();
  await expect(launch.getByRole('button', { name: /math-reforged/ })).toBeVisible();
  await expect(page.getByRole('group', { name: '模式' })).toHaveCount(0);
  await expect(page.locator('[data-derivon-mode]')).toHaveCount(0);
});

test('lands in authoring once a workspace is open, with the mode switch in the top bar', async ({ page }) => {
  await openWorkspace(page);

  const modes = page.locator('.app-topbar').getByRole('group', { name: '模式' });
  await expect(modes).toBeVisible();
  await expect(modes.getByRole('button', { name: '创作' })).toHaveAttribute('aria-pressed', 'true');
  await expect(modes.getByRole('button', { name: '学习' })).toHaveAttribute('aria-pressed', 'false');
});

test('switches the whole window between the two modes and keeps authoring alive', async ({ page }) => {
  await openWorkspace(page);
  const authoring = page.locator('[data-derivon-mode="authoring"]');
  const learning = page.locator('[data-derivon-mode="learning"]');

  await page.getByRole('button', { name: '学习' }).click();
  await expect(learning).toBeVisible();
  await expect(authoring).toBeHidden();
  await expect(authoring).toHaveCount(1);

  await page.getByRole('button', { name: '创作' }).click();
  await expect(authoring).toBeVisible();
  await expect(learning).toBeHidden();
  await expect(learning).toHaveCount(1);
});

test('announces interactive on the desktop host too', async ({ page }) => {
  await collectHooks(page);
  await seedRecentWorkspace(page);
  await page.goto('/');
  await expect(page.getByLabel('打开工作区')).toBeVisible();

  await expect
    .poll(async () => (await collectedHooks(page)).filter((hook) => hook.kind === 'interactive').length)
    .toBe(1);
});
