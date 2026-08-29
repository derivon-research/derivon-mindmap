import { expect, test, type Page } from '@playwright/test';

async function openExample(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?example=replace-with');
  await expect(page.locator('.g6-graph-surface')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
}

async function selectConcept(page: Page, id: string) {
  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill(id);
  await page.getByRole('option', { name: new RegExp(`^${id}`) }).click();
}

test('opens the basics tour on the G6 canvas', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: '操作引导' }).click();
  await expect(page.getByRole('dialog', { name: '选择一个小教程' })).toBeVisible();
  await page.getByRole('button', { name: /第一次创建项目/ }).click();
  await expect(page.getByLabel(/操作引导/).first()).toBeVisible();
  await expect(page.locator('.g6-graph-surface')).toHaveAttribute('data-renderer', 'g6');
});

test('selects a concept through search and edits its document', async ({ page }) => {
  await openExample(page);
  await selectConcept(page, 'A');
  await expect(page.locator('.inspector-heading strong')).toHaveText('A');

  await page.getByRole('button', { name: '编辑文档' }).click();
  const editor = page.getByLabel('Markdown 正文');
  await expect(editor).toBeVisible();
  await editor.fill('# Concept A\n\nEdited through the G6 workflow.');
  await page.getByTitle('返回画布').first().click();
  await expect(page.locator('.g6-graph-surface')).toHaveAttribute('data-ready', 'true');
});

test('defines and toggles a replacement through search', async ({ page }) => {
  await openExample(page);
  await selectConcept(page, 'A');
  await page.getByTitle('解除替换关系').click();
  await page.getByRole('button', { name: '替换', exact: true }).click();

  await selectConcept(page, 'X');
  const definition = page.locator('.replacement-definition');
  await expect(definition).toContainText('A');
  await expect(definition).toContainText('X');

  await definition.getByRole('button', { name: '替换概念', exact: true }).click();
  await page.getByTitle('编辑工作区 JSON').click();
  const manifest = JSON.parse(await page.locator('.json-modal textarea').inputValue());
  expect(manifest.view.replacements).toEqual([{ points: ['A'], replaceWith: 'X', show: 'replacement' }]);
});

test('selects and highlights a route on G6 before native solving', async ({ page }) => {
  await openExample(page);
  await page.getByTitle('打开路线模式').click();

  const startSearch = page.getByRole('combobox', { name: '已经掌握', exact: true });
  await startSearch.fill('C');
  await page.getByRole('listbox', { name: '已经掌握搜索结果' }).getByRole('checkbox').check();

  const targetSearch = page.getByRole('combobox', { name: '目标概念', exact: true });
  await targetSearch.fill('D');
  await page.getByRole('listbox', { name: '目标概念搜索结果' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: '开始求解' }).click();

  await expect(page.getByRole('alert')).toContainText('Derivon 本地应用');
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-route-nodes', /C/);
  await expect(surface).toHaveAttribute('data-route-nodes', /D/);
  await page.getByTitle('清除路线').click();
  await expect(surface).toHaveAttribute('data-route-nodes', '');
  await page.getByTitle('关闭路线模式').first().click();
  await expect(surface).toHaveAttribute('data-render-style-sample', /(?:^|\|)A:1:/);
});

test('deletes a concept and restores it with undo', async ({ page }) => {
  await openExample(page);
  await selectConcept(page, 'A');
  await page.getByTitle('删除概念').click();
  await expect(page.getByRole('alertdialog')).toContainText('相关的');
  await page.getByRole('button', { name: '删除', exact: true }).click();

  await page.getByTitle('编辑工作区 JSON').click();
  let manifest = JSON.parse(await page.locator('.json-modal textarea').inputValue());
  expect(manifest.graph.points.some((point: { id: string }) => point.id === 'A')).toBe(false);
  await page.getByTitle('关闭').click();

  await page.getByRole('button', { name: '撤回' }).click();
  await page.getByTitle('编辑工作区 JSON').click();
  manifest = JSON.parse(await page.locator('.json-modal textarea').inputValue());
  expect(manifest.graph.points.some((point: { id: string }) => point.id === 'A')).toBe(true);
});

test('keeps the G6 canvas and inspector separated on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openExample(page);
  const canvas = await page.locator('.canvas-wrap').boundingBox();
  const inspector = await page.locator('.inspector').boundingBox();
  expect(canvas).not.toBeNull();
  expect(inspector).not.toBeNull();
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(inspector!.y + 1);
  await expect(page.locator('.g6-graph-surface canvas').first()).toBeVisible();
});

test('links to the GitHub repository beside search', async ({ page }) => {
  await openExample(page);
  const repositoryLink = page.getByRole('link', { name: '查看 GitHub 仓库' });
  await expect(repositoryLink).toHaveAttribute('href', 'https://github.com/derivon-research/derivon-mindmap');
  await expect(repositoryLink).toHaveAttribute('target', '_blank');
  await expect(repositoryLink).toHaveAttribute('rel', 'noreferrer');
});
