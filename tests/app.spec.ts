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

test('authors source concepts and derivations without persisting React Flow objects', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

  await expect(page.locator('.react-flow__node-concept')).toHaveCount(4);
  await expect(page.locator('.react-flow__node-derivation')).toHaveCount(5);
  const firstConceptWidth = await page.locator('.react-flow__node-concept .concept-node').first().evaluate((element) => (element as HTMLElement).offsetWidth);
  expect(firstConceptWidth).toBe(136);

  await page.getByTitle('新建概念').click();
  await expect(page.locator('.react-flow__node[data-id="c-1"]')).toBeVisible();
  await page.locator('.inspector label').filter({ hasText: '名称' }).locator('input').fill('AA');
  await expect(page.locator('.react-flow__node[data-id="c-1"]')).toContainText('AA');

  await connect(page, 'A', 'B');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0') ?? '{}'));
  expect(saved.graph.points).toHaveLength(6);
  expect(saved.graph.points.at(-1)).toEqual({ id: 'c-1', data: { label: 'AA', definition: '' } });
  expect(saved.graph.hyperedges).toHaveLength(8);
  expect(saved.graph.hyperedges.at(-1)).toEqual({
    id: 'h-1',
    weight: 1,
    tails: ['A'],
    head: 'B',
    data: { introduction: '', reasoning: '' },
  });
  expect(saved.graph).not.toHaveProperty('concepts');
  expect(saved.graph).not.toHaveProperty('derivations');
  expect(errors).toEqual([]);
});

test('keeps a concept rendered during drag and persists only on drag stop', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="A"]');
  const beforeBox = await node.boundingBox();
  if (!beforeBox) throw new Error('A is not visible');
  const beforePosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions.A);

  await page.mouse.move(beforeBox.x + beforeBox.width / 2, beforeBox.y + beforeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeBox.x + beforeBox.width / 2 + 70, beforeBox.y + beforeBox.height / 2 + 35, { steps: 8 });
  await expect(node).toBeVisible();
  const duringPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions.A);
  expect(duringPosition).toEqual(beforePosition);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions.A)).not.toEqual(beforePosition);
});

test('persists every selected node after a multi-node drag', async ({ page }) => {
  const nodeA = page.locator('.react-flow__node[data-id="A"]');
  const nodeB = page.locator('.react-flow__node[data-id="B"]');
  await nodeA.click({ modifiers: ['Shift'] });
  await nodeB.click({ modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);

  const before = await page.evaluate(() => {
    const positions = JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions;
    return { A: positions.A, B: positions.B };
  });
  const box = await nodeA.boundingBox();
  if (!box) throw new Error('A is not visible');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 35, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions.B)).not.toEqual(before.B);
  const after = await page.evaluate(() => {
    const positions = JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions;
    return { A: positions.A, B: positions.B };
  });
  expect(after.A.x - before.A.x).toBeCloseTo(after.B.x - before.B.x, 5);
  expect(after.A.y - before.A.y).toBeCloseTo(after.B.y - before.B.y, 5);
});

test('opens the editable local layout only on the second click', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="A"]');
  const neighbor = page.locator('.react-flow__node[data-id="B"]');
  await node.click();
  await expect(node).toHaveClass(/selected/);
  const anchorTransform = await node.evaluate((element) => (element as HTMLElement).style.transform);
  const neighborOverviewTransform = await neighbor.evaluate((element) => (element as HTMLElement).style.transform);

  await node.click();
  await expect.poll(() => node.evaluate((element) => (element as HTMLElement).style.transform)).toBe(anchorTransform);
  await expect.poll(() => neighbor.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(neighborOverviewTransform);
  await expect(page.locator('.concept-node.is-dimmed')).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id="D"] .concept-node')).toHaveClass(/is-dimmed/);

  const overviewPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions.A);
  const box = await node.boundingBox();
  if (!box) throw new Error('focused A is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!).view.positions.A)).toEqual(overviewPosition);
});

test('toggles selection with Shift without opening the local view', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="A"]');
  const neighbor = page.locator('.react-flow__node[data-id="B"]');
  const neighborOverviewTransform = await neighbor.evaluate((element) => (element as HTMLElement).style.transform);

  await node.click({ modifiers: ['Shift'] });
  await expect(node).toHaveClass(/selected/);

  await node.click({ modifiers: ['Shift'] });
  await expect(node).not.toHaveClass(/selected/);
  await expect.poll(() => neighbor.evaluate((element) => (element as HTMLElement).style.transform)).toBe(neighborOverviewTransform);
  await expect(page.locator('.concept-node.is-dimmed')).toHaveCount(0);
});

test('keeps only node highlights after a Shift marquee selection', async ({ page }) => {
  const boxes = await page.locator('.react-flow__node').evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  }));
  const bounds = boxes.reduce((result, box) => ({
    left: Math.min(result.left, box.left),
    top: Math.min(result.top, box.top),
    right: Math.max(result.right, box.right),
    bottom: Math.max(result.bottom, box.bottom),
  }));

  await page.keyboard.down('Shift');
  await page.mouse.move(bounds.left - 12, bounds.top - 12);
  await page.mouse.down();
  await page.mouse.move(bounds.right + 12, bounds.bottom + 12, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect(page.locator('.react-flow__node.selected')).toHaveCount(boxes.length);
  await expect(page.locator('.react-flow__selection')).toHaveCount(0);
  const persistentSelection = page.locator('.react-flow__nodesselection-rect');
  await expect(persistentSelection).toHaveCSS('border-top-width', '0px');
  await expect(persistentSelection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('switches between the detailed A B path and X inside the shared C D graph', async ({ page }) => {
  const pointA = page.locator('.react-flow__node-concept[data-id="A"]');
  await expect(pointA.locator('.replacement-tag')).toContainText('X');
  await expect(page.locator('.react-flow__node[data-id="X"]')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/derivon-points-view.png', fullPage: true });

  await pointA.locator('.replacement-tag').click();
  const replacement = page.locator('.react-flow__node-concept[data-id="X"]');
  await expect(replacement).toBeVisible();
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(3);
  await expect(page.locator('.react-flow__node-derivation')).toHaveCount(4);
  await expect(page.locator('.react-flow__node[data-id="C"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="D"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="h-x"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="h-d-x"]')).toBeVisible();
  await expect(replacement.locator('.replacement-tag')).toContainText('2 点');
  await page.waitForTimeout(450);
  await page.screenshot({ path: '/tmp/derivon-replacement-view.png', fullPage: true });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!));
  expect(saved.graph.points.map((concept: { id: string }) => concept.id)).toEqual(['A', 'B', 'C', 'D', 'X']);
  expect(saved.graph.hyperedges).toHaveLength(7);
  expect(saved.view.replacements[0]).toEqual({
    points: ['A', 'B'],
    replaceWith: 'X',
    show: 'replacement',
  });

  await replacement.locator('.replacement-tag').click();
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(4);
  await expect(page.locator('.react-flow__node-derivation')).toHaveCount(5);
});

test('defines replace with by selecting a point set and an existing target', async ({ page }) => {
  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.getByTitle('解除替换关系').click();
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(5);

  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.locator('.react-flow__node[data-id="B"]').click({ modifiers: ['Shift'] });
  await page.getByTitle('Replace with').click();
  await page.locator('.react-flow__node[data-id="X"]').click();

  await expect(page.locator('.react-flow__node[data-id="X"]')).toHaveCount(0);
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(4);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.demo/v0.1.0')!));
  expect(saved.view.replacements).toEqual([{
    points: ['A', 'B'],
    replaceWith: 'X',
    show: 'points',
  }]);
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
