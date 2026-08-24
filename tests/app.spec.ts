import { expect, test } from '@playwright/test';

async function connect(page: import('@playwright/test').Page, source: string, target: string) {
  const from = page.locator(`.react-flow__node[data-id="${source}"] .react-flow__handle-right`);
  const to = page.locator(`.react-flow__node[data-id="${target}"] .react-flow__handle-left`);
  const fromBox = await from.boundingBox();
  const toBox = await to.boundingBox();
  if (!fromBox || !toBox) throw new Error('connection handles are not visible');
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('authors a concept and a derivation directly on the graph', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

  await expect(page.locator('.react-flow__node-concept')).toHaveCount(26);
  await expect(page.locator('.react-flow__node-derivation')).toHaveCount(28);
  const firstConcept = await page.locator('.react-flow__node-concept').first().boundingBox();
  expect(firstConcept?.width).toBeGreaterThan(90);

  await page.getByTitle('新建概念').click();
  await expect(page.locator('.react-flow__node[data-id="c-1"]')).toBeVisible();
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(27);
  await page.locator('.inspector label').filter({ hasText: '名称' }).locator('input').fill('AA');
  await expect(page.locator('.react-flow__node[data-id="c-1"]')).toContainText('AA');

  await connect(page, 'a', 'b');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v1') ?? '{}'));
  expect(saved.graph.concepts).toHaveLength(27);
  expect(saved.graph.derivations).toHaveLength(29);
  expect(saved.graph.derivations.at(-1)).toMatchObject({ premises: ['a'], conclusion: 'b', weight: 1 });
  expect(saved.graph).not.toHaveProperty('edges');
  expect(errors).toEqual([]);

  await page.screenshot({ path: '/tmp/derivon-desktop.png', fullPage: true });
});

test('keeps a card rendered during drag and persists only when dragging stops', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="a"]');
  const beforeBox = await node.boundingBox();
  if (!beforeBox) throw new Error('concept a is not visible');
  const beforePosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v1')!).view.positions.a);

  await page.mouse.move(beforeBox.x + beforeBox.width / 2, beforeBox.y + beforeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeBox.x + beforeBox.width / 2 + 70, beforeBox.y + beforeBox.height / 2 + 35, { steps: 8 });

  await expect(node).toBeVisible();
  await expect(node).toContainText('A');
  const duringBox = await node.boundingBox();
  expect(duringBox!.x).toBeGreaterThan(beforeBox.x + 40);
  const duringPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v1')!).view.positions.a);
  expect(duringPosition).toEqual(beforePosition);
  await page.screenshot({ path: '/tmp/derivon-dragging.png', fullPage: true });

  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v1')!).view.positions.a)).not.toEqual(beforePosition);
});

test('opens the editable local layout only on the second click', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="a"]');
  await node.click();
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(26);
  await expect(node).toHaveClass(/selected/);
  const neighbor = page.locator('.react-flow__node[data-id="c"]');
  const anchorTransform = await node.evaluate((element) => (element as HTMLElement).style.transform);
  const neighborOverviewTransform = await neighbor.evaluate((element) => (element as HTMLElement).style.transform);

  await node.click();
  await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.transform)).toBe(anchorTransform);
  await expect.poll(() => neighbor.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(neighborOverviewTransform);
  const allConcepts = page.locator('.react-flow__node-concept');
  await expect(allConcepts).toHaveCount(26);
  const dimmedConcepts = page.locator('.concept-node.is-dimmed');
  expect(await dimmedConcepts.count()).toBeGreaterThan(0);
  await expect(node.locator('.concept-node')).not.toHaveClass(/is-dimmed/);

  await expect(neighbor).toBeVisible();
  await expect(neighbor.locator('.concept-node')).not.toHaveClass(/is-dimmed/);
  await neighbor.click();
  await expect(neighbor).toHaveClass(/selected/);
  await expect(allConcepts).toHaveCount(26);
  await expect(page.locator('.react-flow__node[data-id="z"] .concept-node')).toHaveClass(/is-dimmed/);
  await page.screenshot({ path: '/tmp/derivon-local-context.png', fullPage: true });

  const overviewPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v1')!).view.positions.a);
  const box = await node.boundingBox();
  if (!box) throw new Error('focused concept a is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 25, { steps: 6 });
  await page.mouse.up();

  const afterLocalDrag = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v1')!).view.positions.a);
  expect(afterLocalDrag).toEqual(overviewPosition);
  await page.getByTitle('关闭局部视图').click();
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(26);
  await expect(page.locator('.concept-node.is-dimmed')).toHaveCount(0);
  const restoredBox = await node.boundingBox();
  expect(restoredBox).not.toBeNull();
});

test('keeps the canvas and inspector separated on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const canvas = await page.locator('.canvas-wrap').boundingBox();
  const inspector = await page.locator('.inspector').boundingBox();
  const toolbar = await page.locator('.toolbar').boundingBox();
  expect(canvas).not.toBeNull();
  expect(inspector).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(inspector!.y + 1);
  expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/derivon-mobile.png', fullPage: true });
});
