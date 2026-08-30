import { expect, test, type Page } from '@playwright/test';

const WORKSPACE_KEY = 'derivon.authoring.workspace/v0.3.0';

async function openConceptDocument(page: Page, id: string) {
  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill(id);
  await page.getByRole('option', { name: new RegExp(`^${id}`) }).click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  await expect(page.locator('.markdown-editor')).toBeVisible();
}

async function activeDocumentMarkdown(page: Page, id: string): Promise<string> {
  return page.evaluate(({ key, pointId }) => {
    const workspace = JSON.parse(localStorage.getItem(key) ?? '{}');
    const point = workspace.manifest?.graph?.points?.find((item: { id: string }) => item.id === pointId);
    return workspace.files?.[`${point?.data?.document}/document.md`] ?? '';
  }, { key: WORKSPACE_KEY, pointId: id });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/?example=replace-with');
});

test('round-trips images and task lists without selection errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openConceptDocument(page, 'A');

  await page.locator('.tiptap-content').evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['clipboard image'], 'clipboard.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  });
  await expect(page.getByRole('status')).toContainText('粘贴图片前需要先连接工作区文件夹');

  await page.getByRole('button', { name: '插入图片' }).click();
  const imageSettings = page.getByRole('form', { name: '图片设置' });
  await imageSettings.getByRole('textbox', { name: '图片地址' }).fill('../../assets/diagram.png');
  await imageSettings.getByRole('textbox', { name: '图片替代文字' }).fill('示意图');
  await imageSettings.getByRole('button', { name: '应用图片设置' }).click();

  const image = page.locator('.workspace-image');
  await expect(image).toHaveAttribute('data-state', 'error');
  await expect(image.locator('strong')).toHaveText('示意图');
  await expect(image.locator('code')).toHaveText('../../assets/diagram.png');

  await image.click();
  await expect(page.getByRole('button', { name: '修改图片' })).toBeVisible();
  await page.getByRole('button', { name: '修改图片' }).click();
  await imageSettings.getByRole('textbox', { name: '图片地址' }).fill('../../assets/updated-diagram.png');
  await imageSettings.getByRole('textbox', { name: '图片替代文字' }).fill('更新后的示意图');
  await imageSettings.getByRole('button', { name: '应用图片设置' }).click();
  await expect(image.locator('code')).toHaveText('../../assets/updated-diagram.png');

  const lastParagraph = page.locator('.tiptap-content p').last();
  await lastParagraph.click();
  await page.getByRole('button', { name: '任务清单' }).click();
  const task = page.locator('ul[data-type="taskList"] > li').last();
  await expect(task).toContainText('点 A。');
  await task.locator('input[type="checkbox"]').click();
  await expect(task).toHaveAttribute('data-checked', 'true');

  await expect.poll(() => activeDocumentMarkdown(page, 'A')).toContain(
    '![更新后的示意图](../../assets/updated-diagram.png)',
  );
  await expect.poll(() => activeDocumentMarkdown(page, 'A')).toContain('- [x] 点 A。');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByTitle('返回画布').first().click();
    await openConceptDocument(page, 'A');
    await expect(page.locator('.workspace-image')).toHaveAttribute('data-state', 'error');
  }

  expect(pageErrors).toEqual([]);
});

test('exposes complete heading and code block controls', async ({ page }) => {
  await openConceptDocument(page, 'A');

  const heading = page.getByRole('combobox', { name: '段落样式' });
  await expect(heading.locator('option')).toHaveText([
    '正文',
    '标题 1',
    '标题 2',
    '标题 3',
    '标题 4',
    '标题 5',
    '标题 6',
  ]);
  await expect(page.getByRole('button', { name: '代码块' })).toBeVisible();
});
