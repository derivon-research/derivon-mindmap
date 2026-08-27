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
  await page.goto('/?example=replace-with');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('opens a blank workspace with a target-bound guided tour', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByLabel('操作引导：新建项目文件夹')).toBeVisible();
  await expect(page.getByLabel('操作引导：新建项目文件夹')).toContainText('1 / 37');
  const newWorkspace = page.getByTitle('在新文件夹创建空项目');
  await expect(newWorkspace).toHaveAttribute('data-tour-feature', 'new-workspace');
  const targetBox = await newWorkspace.boundingBox();
  const highlightBox = await page.locator('.tour-highlight').boundingBox();
  expect(targetBox).not.toBeNull();
  expect(highlightBox).not.toBeNull();
  expect(highlightBox!.x).toBeLessThan(targetBox!.x);
  expect(highlightBox!.x + highlightBox!.width).toBeGreaterThan(targetBox!.x + targetBox!.width);
  const next = page.getByRole('button', { name: 'Next' });
  const skip = page.getByRole('button', { name: '跳过引导' });
  await expect(next).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(next).toHaveCSS('color', 'rgb(47, 109, 79)');
  await expect(skip).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(skip).toHaveCSS('color', 'rgb(133, 141, 136)');
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      localStorage.setItem('derivon.test.tour-picker', 'called');
      throw new DOMException('Cancelled', 'AbortError');
    };
  });
  await next.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('derivon.test.tour-picker'))).toBe('called');
  await expect(page.getByLabel('操作引导：新建项目文件夹')).toBeVisible();
  await page.screenshot({ path: '/tmp/derivon-onboarding-desktop.png', fullPage: true });

  await skip.click();
  await expect(page.getByLabel('操作引导：新建项目文件夹')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByLabel('操作引导：新建项目文件夹')).toHaveCount(0);
  await page.getByRole('button', { name: '操作引导' }).click();
  await expect(page.getByLabel('操作引导：新建项目文件夹')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('操作引导：新建项目文件夹')).toBeVisible();
  await page.screenshot({ path: '/tmp/derivon-onboarding-mobile.png', fullPage: true });
});

test('advances guide steps from the bound feature actions', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('derivon:tour-action', {
    detail: { action: 'workspace-created' },
  })));
  await expect(page.getByLabel('操作引导：命名示例项目')).toBeVisible();
  await page.getByLabel('文档标题').fill('用户输入的项目标题');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('操作引导：补充项目说明')).toBeVisible();
  await expect(page.getByLabel('文档标题')).toHaveValue('用户输入的项目标题');

  const description = page.locator('.inspector textarea');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('操作引导：新建第一个概念')).toBeVisible();
  await expect(description).toHaveValue('演示如何由概念 A 和 B 构造替换概念 X。');

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('操作引导：命名概念 A')).toBeVisible();
  const name = page.locator('.inspector label').filter({ hasText: '名称' }).locator('input');
  await name.fill('A');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('操作引导：打开概念文档')).toBeVisible();
  await expect(name).toHaveValue('A');
});

test('completes every preset guide action through Next', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('derivon:tour-action', {
    detail: { action: 'workspace-created' },
  })));

  const tour = page.locator('.tour-popover');
  await expect(tour).toContainText('2 / 37');
  for (let step = 3; step <= 37; step += 1) {
    await tour.getByRole('button', { name: 'Next' }).click();
    await expect(tour).toContainText(`${step} / 37`);
  }
  await tour.getByRole('button', { name: '完成' }).click();
  await expect(tour).toHaveCount(0);
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
  await expect(page.locator('.react-flow__node-derivation')).toHaveCount(5);
  const parallelGroup = page.locator('.react-flow__node-derivation[data-id="h-b"]');
  await expect(parallelGroup.getByRole('button', { name: '该推导路径有 3 种方式实现' })).toBeVisible();
  await expect(parallelGroup.locator('.derivation-weight')).toHaveText('1.0');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0') ?? '{"manifest":{}}').manifest);
  expect(saved.graph.points).toHaveLength(6);
  expect(saved.graph.points.at(-1)).toEqual({ id: 'c-1', data: { label: 'AA', document: 'docs/concept-c-1', format: 'markdown' } });
  expect(saved.graph.hyperedges).toHaveLength(9);
  expect(saved.graph.hyperedges.at(-1)).toEqual({
    id: 'h-1',
    weight: 1,
    tails: ['A'],
    head: 'B',
    data: { document: 'docs/derivation-h-1', format: 'markdown' },
  });
  const files = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).files);
  expect(files['docs/concept-c-1/document.md']).toContain('# 新概念');
  expect(files['docs/concept-c-1/index.html']).toContain('<h1>新概念</h1>');
  expect(files['docs/derivation-h-1/document.md']).toContain('# 推导 h-1');
  expect(files['docs/derivation-h-1/index.html']).toContain('<h1>推导 h-1</h1>');
  expect(saved.graph).not.toHaveProperty('concepts');
  expect(saved.graph).not.toHaveProperty('derivations');
  expect(errors).toEqual([]);
});

test('authors Markdown in place with shortcuts and interactive HTML blocks', async ({ page }) => {
  await page.getByTitle('新建概念').click();
  await page.getByRole('button', { name: '编辑文档' }).click();

  const markdownBody = page.getByLabel('Markdown 正文');
  const primaryModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await markdownBody.click();
  await page.keyboard.press(`${primaryModifier}+a`);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('# ');
  await page.keyboard.type('Tiptap document');
  await expect(markdownBody.locator('h1')).toHaveText('Tiptap document');
  await page.keyboard.press(`${primaryModifier}+a`);
  await page.keyboard.press(`${primaryModifier}+b`);
  await expect(markdownBody.locator('h1 strong')).toHaveText('Tiptap document');

  await markdownBody.locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '插入 HTML 交互示例' }).click();
  const preview = page.frameLocator('.raw-html-block iframe');
  await expect(preview.getByText('HTML 交互示例', { exact: true })).toBeVisible();
  await expect(preview.getByText('这里的 HTML、CSS 和 JavaScript 都可以自由改写。')).toBeVisible();
  await preview.getByLabel('变化强度').fill('82');
  await expect(preview.locator('#demo-output')).toHaveText('82');
  await page.screenshot({ path: '/tmp/derivon-html-example.png', fullPage: true });

  await page.getByRole('button', { name: '编辑 HTML 元素' }).click();
  const htmlSource = page.getByLabel('HTML 元素源码');
  await htmlSource.fill('<button id="counter" type="button" onclick="this.textContent = Number(this.textContent) + 1">0</button>');
  await page.getByRole('button', { name: '预览 HTML 元素' }).click();
  await preview.locator('#counter').click();
  await expect(preview.locator('#counter')).toHaveText('1');

  await page.getByRole('button', { name: '编辑 HTML 元素' }).click();
  await htmlSource.fill(`<style>body { margin: 0; } #content { height: 360px; background: #e4f2eb; }</style>
<button id="expand" type="button" onclick="document.querySelector('#content').style.height = '680px'">展开</button>
<div id="content"></div>`);
  await page.getByRole('button', { name: '预览 HTML 元素' }).click();
  const iframe = page.locator('.raw-html-block iframe');
  await expect.poll(async () => iframe.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(380);
  const beforeExpansion = await iframe.evaluate((element) => element.getBoundingClientRect().height);
  await preview.locator('#expand').click();
  await expect.poll(async () => iframe.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(beforeExpansion + 250);
  expect(await preview.locator('html').evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.screenshot({ path: '/tmp/derivon-tiptap-editor.png', fullPage: true });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!));
  expect(stored.manifest.graph.points.at(-1).data).toEqual({
    label: '新概念',
    document: 'docs/concept-c-1',
    format: 'markdown',
  });
  expect(stored.files['docs/concept-c-1/document.md']).toContain('# **Tiptap document**');
  expect(stored.files['docs/concept-c-1/document.md']).toContain('<button id="expand"');
  expect(stored.files['docs/concept-c-1/index.html']).toContain('<button id="expand"');
});

test('renders and edits inline and block KaTeX syntax', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'derivon.authoring.workspace/v0.2.0';
    const workspace = JSON.parse(localStorage.getItem(key)!);
    workspace.files['docs/concept-a/document.md'] = `# Formula document

Inline formula: $E = mc^2$.

$$
\\int_0^1 x^2 \\, dx
$$`;
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload();

  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  const inlineMath = page.locator('.tiptap-mathematics-render[data-type="inline-math"]');
  const blockMath = page.locator('.tiptap-mathematics-render[data-type="block-math"]');
  await expect(inlineMath.locator('.katex')).toBeVisible();
  await expect(blockMath.locator('.katex-display')).toBeVisible();
  await expect(inlineMath).toHaveAttribute('data-latex', 'E = mc^2');
  await expect(blockMath).toHaveAttribute('data-latex', '\\int_0^1 x^2 \\, dx');
  await page.screenshot({ path: '/tmp/derivon-katex-editor.png', fullPage: true });

  await inlineMath.click();
  const formulaSource = page.getByLabel('行内公式源码');
  await expect(formulaSource).toHaveValue('E = mc^2');
  await page.screenshot({ path: '/tmp/derivon-formula-source-editor.png', fullPage: true });
  await formulaSource.fill('a^2 + b^2 = c^2');
  await page.getByRole('button', { name: '关闭公式编辑' }).click();
  await expect(inlineMath).toHaveAttribute('data-latex', 'a^2 + b^2 = c^2');
  await expect.poll(() => page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).files;
    return {
      markdown: files['docs/concept-a/document.md'],
      html: files['docs/concept-a/index.html'],
    };
  })).toEqual({
    markdown: expect.stringContaining('$a^2 + b^2 = c^2$'),
    html: expect.stringContaining('class="katex"'),
  });
});

test('turns typed single and double dollar syntax into live formulas', async ({ page }) => {
  await page.getByTitle('新建概念').click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  const markdownBody = page.getByLabel('Markdown 正文');
  const primaryModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await markdownBody.click();
  await page.keyboard.press(`${primaryModifier}+a`);
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Energy: $E = mc^2$');
  const inlineMath = page.locator('.tiptap-mathematics-render[data-type="inline-math"]');
  await expect(inlineMath).toHaveAttribute('data-latex', 'E = mc^2');

  await page.keyboard.press('Enter');
  await page.keyboard.type('$$\\sum_{i=1}^n i$$');
  const blockMath = page.locator('.tiptap-mathematics-render[data-type="block-math"]');
  await expect(blockMath).toHaveAttribute('data-latex', '\\sum_{i=1}^n i');
  await expect.poll(() => page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).files;
    return files['docs/concept-c-1/document.md'];
  })).toContain('Energy: $E = mc^2$');
  await expect.poll(() => page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).files;
    return files['docs/concept-c-1/document.md'];
  })).toContain('$$\n\\sum_{i=1}^n i\n$$');
});

test('migrates legacy HTML documents without losing interactive content', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'derivon.authoring.workspace/v0.2.0';
    const workspace = JSON.parse(localStorage.getItem(key)!);
    const point = workspace.manifest.graph.points.find((item: { id: string }) => item.id === 'A');
    point.data.format = 'html';
    workspace.files['docs/concept-a/index.html'] = `<!doctype html>
<html lang="zh-CN">
<body>
  <button id="legacy-counter">0</button>
  <script>
    document.querySelector('#legacy-counter').addEventListener('click', (event) => {
      event.currentTarget.textContent = String(Number(event.currentTarget.textContent) + 1);
    });
  </script>
</body>
</html>`;
    delete workspace.files['docs/concept-a/document.md'];
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload();

  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  await expect(page.getByRole('status')).toHaveText('旧版 HTML 已迁移到 Markdown');
  let preview = page.frameLocator('.raw-html-block iframe');
  await preview.locator('#legacy-counter').click();
  await expect(preview.locator('#legacy-counter')).toHaveText('1');
  await expect.poll(() => page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!);
    return {
      format: workspace.manifest.graph.points.find((item: { id: string }) => item.id === 'A').data.format,
      markdown: workspace.files['docs/concept-a/document.md'],
    };
  })).toEqual({
    format: 'markdown',
    markdown: expect.stringContaining("querySelector('#legacy-counter')"),
  });

  await page.reload();
  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  preview = page.frameLocator('.raw-html-block iframe');
  await preview.locator('#legacy-counter').click();
  await expect(preview.locator('#legacy-counter')).toHaveText('1');
});

test('keeps a concept rendered during drag and persists only on drag stop', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="A"]');
  const beforeBox = await node.boundingBox();
  if (!beforeBox) throw new Error('A is not visible');
  const beforePosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.A);

  await page.mouse.move(beforeBox.x + beforeBox.width / 2, beforeBox.y + beforeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeBox.x + beforeBox.width / 2 + 70, beforeBox.y + beforeBox.height / 2 + 35, { steps: 8 });
  await expect(node).toBeVisible();
  const duringPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.A);
  expect(duringPosition).toEqual(beforePosition);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.A)).not.toEqual(beforePosition);
});

test('persists every selected node after a multi-node drag', async ({ page }) => {
  const nodeA = page.locator('.react-flow__node[data-id="A"]');
  const nodeB = page.locator('.react-flow__node[data-id="B"]');
  await nodeA.click({ modifiers: ['Shift'] });
  await nodeB.click({ modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);

  const before = await page.evaluate(() => {
    const positions = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions;
    return { A: positions.A, B: positions.B };
  });
  const box = await nodeA.boundingBox();
  if (!box) throw new Error('A is not visible');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 35, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.B)).not.toEqual(before.B);
  const after = await page.evaluate(() => {
    const positions = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions;
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

  const overviewPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.A);
  const box = await node.boundingBox();
  if (!box) throw new Error('focused A is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.A)).toEqual(overviewPosition);
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

test('shows a pointer and lift shadow when selectable graph objects are hovered', async ({ page }) => {
  const cases = [
    {
      node: page.locator('.react-flow__node-concept[data-id="A"]'),
      shadow: page.locator('.react-flow__node-concept[data-id="A"] .concept-node'),
    },
    {
      node: page.locator('.react-flow__node-derivation').first(),
      shadow: page.locator('.react-flow__node-derivation .derivation-diamond').first(),
    },
  ];

  for (const item of cases) {
    const restingShadow = await item.shadow.evaluate((element) => getComputedStyle(element).boxShadow);
    await item.node.hover();
    await expect(item.node).toHaveCSS('cursor', 'pointer');
    await expect(item.node).toHaveCSS('translate', '0px -2px');
    await expect.poll(() => item.shadow.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(restingShadow);
  }
});

test('stacks parallel derivations and lets each implementation be inspected', async ({ page }) => {
  const groupNode = page.locator('.react-flow__node-derivation[data-id="h-b"]');
  await expect(groupNode).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="h-b-alt"]')).toHaveCount(0);
  await expect(groupNode.locator('.derivation-diamond.is-stack-layer')).toHaveCount(1);
  await expect(groupNode.locator('.derivation-weight')).toHaveText('3.0');
  const pathCount = groupNode.getByRole('button', { name: '该推导路径有 2 种方式实现' });
  await expect(pathCount).toBeVisible();

  await groupNode.click();
  await expect(page.getByText('该推导路径有 2 种方式实现', { exact: true })).toBeVisible();
  await page.getByLabel('成本权重').fill('9.25');
  await expect(page.getByLabel('成本权重')).toHaveValue('9.3');
  await expect(groupNode.locator('.derivation-weight')).toHaveText('9.3');
  await expect.poll(() => page.evaluate(() => {
    const manifest = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest;
    return manifest.graph.hyperedges.find((edge: { id: string }) => edge.id === 'h-b').weight;
  })).toBe(9.3);
  await page.getByLabel('成本权重').fill('3');
  await page.getByLabel('查看推导方式').selectOption('h-b-alt');
  await expect(page.locator('.inspector-heading strong')).toHaveText('h-b-alt');
  await expect(groupNode.locator('.derivation-weight')).toHaveText('8.0');

  await page.getByRole('button', { name: '编辑文档' }).click();
  const markdownBody = page.getByLabel('Markdown 正文');
  await expect(markdownBody).toContainText('使用另一套推导过程从 A 得到 B。');
  await markdownBody.click();
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+a`);
  await page.keyboard.type('# ');
  await page.keyboard.type('Alternative derivation');
  await expect(markdownBody.locator('h1')).toHaveText('Alternative derivation');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).files['docs/derivation-h-b-alt/document.md'])).toContain('# Alternative derivation');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).files['docs/derivation-h-b-alt/index.html'])).toContain('<h1>Alternative derivation</h1>');
  const editor = await page.locator('.document-editor-main').boundingBox();
  const workspace = await page.locator('.document-workspace').boundingBox();
  expect(editor).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect(editor!.width / workspace!.width).toBeGreaterThan(0.76);
  await page.screenshot({ path: '/tmp/derivon-markdown-editor.png', fullPage: true });
  await page.getByTitle('返回画布').first().click();

  await pathCount.click();
  await expect(page.locator('.inspector-heading strong')).toHaveText('h-b');
  await expect(groupNode.locator('.derivation-weight')).toHaveText('3.0');

  const beforePosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions['h-b']);
  const box = await groupNode.boundingBox();
  if (!box) throw new Error('parallel derivation group is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 24, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions['h-b-alt'])).not.toEqual(beforePosition);
  const groupPositions = await page.evaluate(() => {
    const positions = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions;
    return { primary: positions['h-b'], alternative: positions['h-b-alt'] };
  });
  expect(groupPositions.alternative).toEqual(groupPositions.primary);
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

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest);
  expect(saved.graph.points.map((concept: { id: string }) => concept.id)).toEqual(['A', 'B', 'C', 'D', 'X']);
  expect(saved.graph.hyperedges).toHaveLength(8);
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest);
  expect(saved.view.replacements).toEqual([{
    points: ['A', 'B'],
    replaceWith: 'X',
    show: 'points',
  }]);
});

test('confirms cascading concept deletion and supports undo and redo', async ({ page }) => {
  const conceptA = page.locator('.react-flow__node-concept[data-id="A"]');
  const undo = page.getByRole('button', { name: '撤回' });
  const redo = page.getByRole('button', { name: '重做' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await conceptA.click();
  await page.locator('.inspector').getByTitle('删除概念').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('删除概念');
  await expect(dialog).toContainText('将删除 A 概念以及相关的 3 个推导。');

  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(conceptA).toBeVisible();

  await page.locator('.inspector').getByTitle('删除概念').click();
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(conceptA).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest;
    return { points: saved.graph.points.length, hyperedges: saved.graph.hyperedges.length };
  })).toEqual({ points: 4, hyperedges: 5 });

  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(conceptA).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest;
    return { points: saved.graph.points.length, hyperedges: saved.graph.hyperedges.length };
  })).toEqual({ points: 5, hyperedges: 8 });

  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(conceptA).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest;
    return { points: saved.graph.points.length, hyperedges: saved.graph.hyperedges.length };
  })).toEqual({ points: 4, hyperedges: 5 });
});

test('confirms derivation deletion and allows it to be undone', async ({ page }) => {
  const derivation = page.locator('.react-flow__node-derivation[data-id="h-a"]');
  await derivation.click();
  await page.locator('.inspector').getByTitle('删除推导').click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('删除推导');
  await expect(dialog).toContainText('将删除 h-a 推导。');
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(derivation).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest;
    return saved.graph.hyperedges.map((item: { id: string }) => item.id);
  })).not.toContain('h-a');

  await page.getByRole('button', { name: '撤回' }).click();
  await expect(derivation).toBeVisible();
});

test('keeps malformed workspace errors open and copyable until dismissed', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(text: string) {
          (window as unknown as { __copiedWorkspaceError: string }).__copiedWorkspaceError = text;
        },
      },
    });
    const derivonDirectory = {
      kind: 'directory',
      name: '.derivon',
      async getFileHandle(filename: string) {
        return {
          kind: 'file',
          name: filename,
          async getFile() { return new File(['{"schema":'], filename); },
        } as FileSystemFileHandle;
      },
    } as FileSystemDirectoryHandle;
    window.showDirectoryPicker = async () => ({
      kind: 'directory',
      name: 'broken-workspace',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async getDirectoryHandle(name: string) {
        if (name === '.derivon') return derivonDirectory;
        throw new DOMException(`Missing directory ${name}`, 'NotFoundError');
      },
    }) as FileSystemDirectoryHandle;
  });

  await page.getByTitle('连接工作区文件夹').click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('打开项目文件夹失败');
  await expect(dialog).toContainText('.derivon/workspace.json 无效');
  await expect(dialog.locator('pre')).toContainText('SyntaxError');
  await page.waitForTimeout(2600);
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '/tmp/derivon-workspace-error-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '/tmp/derivon-workspace-error-mobile.png', fullPage: true });

  await dialog.getByRole('button', { name: '复制错误' }).click();
  await expect(dialog.getByRole('button', { name: '已复制' })).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { __copiedWorkspaceError: string }).__copiedWorkspaceError);
  expect(copied).toContain('操作: 打开项目文件夹');
  expect(copied).toContain('工作区清单: .derivon/workspace.json');
  expect(copied).toContain('Caused by: SyntaxError');

  await dialog.getByTitle('关闭').click();
  await expect(dialog).toHaveCount(0);
});

test('detects workspace changes outside the WebUI and resolves both choices', async ({ page }) => {
  await expect(page.locator('.workspace-directory-name')).toHaveText('未打开项目文件夹');

  await page.evaluate(() => {
    const local = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!);
    const files = new Map<string, string>([
      ['.derivon/workspace.json', `${JSON.stringify(local.manifest, null, 2)}\n`],
      ...Object.entries(local.files) as [string, string][],
    ]);
    const directories = new Set<string>(['']);
    for (const path of files.keys()) {
      const parts = path.split('/');
      parts.pop();
      while (parts.length) {
        directories.add(parts.join('/'));
        parts.pop();
      }
    }
    const directoryHandle = (prefix: string, name: string): FileSystemDirectoryHandle => ({
      kind: 'directory',
      name,
      async getDirectoryHandle(child: string, options?: { create?: boolean }) {
        const childPath = [prefix, child].filter(Boolean).join('/');
        if (!directories.has(childPath)) {
          if (!options?.create) throw new DOMException(`Missing directory ${childPath}`, 'NotFoundError');
          directories.add(childPath);
        }
        return directoryHandle(childPath, child);
      },
      async getFileHandle(filename: string, options?: { create?: boolean }) {
        const path = [prefix, filename].filter(Boolean).join('/');
        if (!files.has(path) && !options?.create) throw new DOMException(`Missing file ${path}`, 'NotFoundError');
        return {
          kind: 'file',
          name: filename,
          async getFile() { return new File([files.get(path) ?? ''], filename, { lastModified: 0 }); },
          async createWritable() {
            let content = '';
            return {
              async write(data: string | BufferSource | Blob) {
                if (typeof data !== 'string') throw new TypeError('Expected text content');
                content = data;
              },
              async close() { files.set(path, content); },
            } as FileSystemWritableFileStream;
          },
        } as FileSystemFileHandle;
      },
    });
    (window as unknown as { __workspaceFiles: Map<string, string> }).__workspaceFiles = files;
    window.showDirectoryPicker = async () => directoryHandle('', 'agent-project');
  });

  await page.getByTitle('连接工作区文件夹').click();
  await expect(page.locator('.inspector-heading')).toContainText('Graph');
  await expect(page.locator('.workspace-directory-name')).toHaveText('agent-project/');

  await page.evaluate(() => {
    const files = (window as unknown as { __workspaceFiles: Map<string, string> }).__workspaceFiles;
    const manifest = JSON.parse(files.get('.derivon/workspace.json')!);
    manifest.document.description = 'Agent 写入的说明';
    files.set('.derivon/workspace.json', `${JSON.stringify(manifest, null, 2)}\n`);
  });

  const conflict = page.getByRole('alertdialog');
  await expect(conflict).toBeVisible({ timeout: 5000 });
  await conflict.getByRole('button', { name: '采用文件夹更改' }).click();
  await expect(page.locator('.inspector textarea')).toHaveValue('Agent 写入的说明');

  await page.locator('.inspector textarea').fill('WebUI 写入的说明');
  await expect.poll(() => page.evaluate(() => {
    const files = (window as unknown as { __workspaceFiles: Map<string, string> }).__workspaceFiles;
    return JSON.parse(files.get('.derivon/workspace.json')!).document.description;
  })).toBe('WebUI 写入的说明');

  await page.evaluate(() => {
    const files = (window as unknown as { __workspaceFiles: Map<string, string> }).__workspaceFiles;
    const manifest = JSON.parse(files.get('.derivon/workspace.json')!);
    manifest.document.description = 'Agent 的第二次写入';
    files.set('.derivon/workspace.json', `${JSON.stringify(manifest, null, 2)}\n`);
  });

  await expect(conflict).toBeVisible({ timeout: 5000 });
  await conflict.getByRole('button', { name: '忽视文件夹更改，保留 WebUI 版本' }).click();
  await expect(conflict).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const files = (window as unknown as { __workspaceFiles: Map<string, string> }).__workspaceFiles;
    return JSON.parse(files.get('.derivon/workspace.json')!).document.description;
  })).toBe('WebUI 写入的说明');
});

test('creates a new empty project with the folder-plus action', async ({ page }) => {
  await expect(page.locator('.react-flow__node')).not.toHaveCount(0);
  await page.evaluate(() => {
    const files = new Map<string, string>();
    const directories = new Set<string>(['']);
    const directoryHandle = (prefix: string, name: string): FileSystemDirectoryHandle => ({
      kind: 'directory',
      name,
      async queryPermission() {
        localStorage.setItem('derivon.test.permission-queried', 'true');
        return 'prompt';
      },
      async requestPermission() {
        localStorage.setItem('derivon.test.permission-requested', 'true');
        return 'granted';
      },
      async getDirectoryHandle(child: string, options?: { create?: boolean }) {
        const childPath = [prefix, child].filter(Boolean).join('/');
        if (!directories.has(childPath)) {
          if (!options?.create) throw new DOMException(`Missing directory ${childPath}`, 'NotFoundError');
          directories.add(childPath);
        }
        return directoryHandle(childPath, child);
      },
      async getFileHandle(filename: string, options?: { create?: boolean }) {
        const path = [prefix, filename].filter(Boolean).join('/');
        if (!files.has(path) && !options?.create) throw new DOMException(`Missing file ${path}`, 'NotFoundError');
        return {
          kind: 'file',
          name: filename,
          async getFile() { return new File([files.get(path) ?? ''], filename, { lastModified: 0 }); },
          async createWritable() {
            let content = '';
            return {
              async write(data: string | BufferSource | Blob) {
                if (typeof data !== 'string') throw new TypeError('Expected text content');
                content = data;
              },
              async close() { files.set(path, content); },
            } as FileSystemWritableFileStream;
          },
        } as FileSystemFileHandle;
      },
    });
    (window as unknown as { __newWorkspaceFiles: Map<string, string> }).__newWorkspaceFiles = files;
    window.showDirectoryPicker = async () => directoryHandle('', 'empty-project');
  });

  await page.getByTitle('在新文件夹创建空项目').click();

  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByLabel('文档标题')).toHaveValue('未命名项目');
  await expect(page.locator('.workspace-directory-name')).toHaveText('empty-project/');
  expect(await page.evaluate(() => ({
    queried: localStorage.getItem('derivon.test.permission-queried'),
    requested: localStorage.getItem('derivon.test.permission-requested'),
  }))).toEqual({ queried: 'true', requested: 'true' });
  await expect.poll(() => page.evaluate(() => {
    const files = (window as unknown as { __newWorkspaceFiles: Map<string, string> }).__newWorkspaceFiles;
    const manifest = JSON.parse(files.get('.derivon/workspace.json') ?? '{}');
    return { points: manifest.graph?.points?.length, hyperedges: manifest.graph?.hyperedges?.length };
  })).toEqual({ points: 0, hyperedges: 0 });
});

test('offers saving the current project to a new folder', async ({ page }) => {
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => {
      localStorage.setItem('derivon.test.save-as-picker', 'called');
      throw new DOMException('Cancelled', 'AbortError');
    };
  });

  await page.getByRole('button', { name: '另存到新文件夹' }).click();

  expect(await page.evaluate(() => localStorage.getItem('derivon.test.save-as-picker'))).toBe('called');
});

test('links to the GitHub repository beside search', async ({ page }) => {
  const repositoryLink = page.getByRole('link', { name: '查看 GitHub 仓库' });
  await expect(repositoryLink).toHaveAttribute('href', 'https://github.com/derivon-research/derivon-mindmap');
  await expect(repositoryLink).toHaveAttribute('target', '_blank');
  await expect(repositoryLink).toHaveAttribute('rel', 'noreferrer');
});

test('selects multiple route starts and targets with fuzzy search and canvas buttons', async ({ page }) => {
  await page.evaluate(() => {
    const key = 'derivon.authoring.workspace/v0.2.0';
    const workspace = JSON.parse(localStorage.getItem(key)!);
    const labels: Record<string, string> = {
      A: 'Linear Algebra',
      B: 'Basis',
      C: 'Coordinates',
      D: 'Dimension',
      X: 'Vector Space',
    };
    workspace.manifest.graph.points.forEach((point: { id: string; data: { label: string } }) => {
      point.data.label = labels[point.id];
    });
    localStorage.setItem(key, JSON.stringify(workspace));
  });
  await page.reload();
  await page.getByTitle('打开路线模式').click();

  const targetSearch = page.getByRole('combobox', { name: '目标概念', exact: true });
  await targetSearch.fill('Lnear Algera');
  const targetResults = page.getByRole('listbox', { name: '目标概念搜索结果' });
  await expect(targetResults.getByText('Linear Algebra')).toBeVisible();
  await targetResults.getByText('Linear Algebra').click();
  await expect(targetResults).toBeVisible();
  await expect(page.getByLabel('已选择的目标概念', { exact: true })).toContainText('Linear Algebra');

  const startSearch = page.getByRole('combobox', { name: '已经掌握', exact: true });
  await startSearch.fill('Bais');
  const startResults = page.getByRole('listbox', { name: '已经掌握搜索结果' });
  await expect(startResults.getByText('Basis')).toBeVisible();
  await startResults.getByRole('checkbox').check();
  await expect(page.getByLabel('已选择的已经掌握', { exact: true })).toContainText('Basis');

  await page.getByRole('button', { name: '移除 Linear Algebra' }).click();
  await expect(page.getByLabel('已选择的目标概念', { exact: true })).not.toContainText('Linear Algebra');
  await targetSearch.fill('Vetor Spce');
  await expect(targetResults.getByText('Vector Space')).toBeVisible();
  await targetResults.getByRole('checkbox').check();

  const dimension = page.locator('.react-flow__node[data-id="D"]');
  await dimension.click();
  await dimension.click({ button: 'right' });
  await expect(dimension).toHaveClass(/is-route-start/);
  await expect(dimension).toHaveClass(/is-route-target/);
  const selectedStyle = await dimension.locator('.concept-node').evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderColor: style.borderColor, boxShadow: style.boxShadow };
  });
  expect(selectedStyle.borderColor).toBe('rgb(164, 79, 63)');
  expect(selectedStyle.boxShadow).toContain('rgb(47, 112, 135)');
  await expect(page.getByLabel('已选择的已经掌握', { exact: true })).toContainText('Dimension');
  await expect(page.getByLabel('已选择的目标概念', { exact: true })).toContainText('Dimension');
  await expect(page.getByLabel('已选择的目标概念', { exact: true })).toContainText('Vector Space');
  await page.screenshot({ path: '/tmp/derivon-multi-target-route.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary', { name: '路线', exact: true })).toBeVisible();
  await expect(page.getByLabel('已选择的目标概念', { exact: true })).toContainText('Dimension');
  await page.getByRole('button', { name: '开始求解' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '开始求解' })).toBeVisible();
  await page.screenshot({ path: '/tmp/derivon-multi-target-route-mobile.png', fullPage: true });
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

  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  const documentWorkspace = await page.locator('.document-workspace').boundingBox();
  const documentEditor = await page.locator('.document-editor-main').boundingBox();
  const markdownToolbar = await page.locator('.markdown-toolbar').boundingBox();
  expect(documentWorkspace).not.toBeNull();
  expect(documentEditor).not.toBeNull();
  expect(markdownToolbar).not.toBeNull();
  expect(documentEditor!.height / documentWorkspace!.height).toBeGreaterThan(0.74);
  expect(markdownToolbar!.x + markdownToolbar!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/derivon-markdown-mobile.png', fullPage: true });
});
