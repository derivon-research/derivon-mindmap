import { expect, test, type Page } from '@playwright/test';

async function graphPort(page: Page, id: string, side: 'left' | 'right'): Promise<{ x: number; y: number }> {
  const surface = page.locator('.g6-graph-surface');
  await expect.poll(async () => await surface.getAttribute('data-port-sample')).toContain(`${id}:`);
  const sample = await surface.getAttribute('data-port-sample') ?? '';
  const entry = sample.split('|').find((item) => item.startsWith(`${id}:`));
  if (!entry) throw new Error(`missing port sample for ${id}`);
  let values = entry.slice(id.length + 1).split(',').map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`invalid port sample for ${id}`);
  const viewport = page.viewportSize();
  if (viewport && (values[0] < 0 || values[2] > viewport.width || values[1] < 50 || values[1] > viewport.height)) {
    await surface.getByRole('button', { name: '适应视图' }).click();
    await page.waitForTimeout(320);
    const fitted = await surface.getAttribute('data-port-sample') ?? '';
    const fittedEntry = fitted.split('|').find((item) => item.startsWith(`${id}:`));
    if (!fittedEntry) throw new Error(`missing fitted port sample for ${id}`);
    values = fittedEntry.slice(id.length + 1).split(',').map(Number);
  }
  return side === 'left' ? { x: values[0], y: values[1] } : { x: values[2], y: values[3] };
}

async function dragConnection(page: Page, sourceId: string, targetId: string) {
  await expect(page.locator('main')).toHaveAttribute('data-layout-running', 'false', { timeout: 30_000 });
  const canvas = page.locator('.canvas-wrap');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const source = await graphPort(page, sourceId, 'right');
    const target = await graphPort(page, targetId, 'left');
    await page.mouse.move(source.x, source.y);
    await page.waitForTimeout(40);
    await page.mouse.down();
    await page.mouse.move((source.x + target.x) / 2, (source.y + target.y) / 2, { steps: 6 });
    if (await canvas.evaluate((element) => element.classList.contains('is-interacting'))) {
      await page.mouse.move(target.x, target.y, { steps: 6 });
      await page.mouse.up();
      return;
    }
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  await expect(canvas).toHaveClass(/is-interacting/, { timeout: 500 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?example=replace-with');
  await page.evaluate(() => localStorage.clear());
});

test('loads G6 as the default renderer without an XYFlow surface', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem(
    'derivon.layout-cache/v0.1.0',
    JSON.stringify({ entries: { stale: { positions: { A: { x: 1, y: 2 } } } } }),
  ));
  await page.goto('/?example=replace-with');
  const surface = page.locator('.g6-graph-surface');

  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem('derivon.layout-cache/v0.1.0'))).toBeNull();
  const browserWorkspace = await page.evaluate(() => localStorage.getItem('derivon.authoring.workspace/v0.3.0'));
  expect(browserWorkspace).not.toContain('"positions"');
  await expect(surface).toHaveAttribute('data-renderer', 'g6');
  await expect(page.locator('.react-flow')).toHaveCount(0);
  await expect(surface).toHaveAttribute('data-overview-lod', 'false');
  expect(Number(await surface.getAttribute('data-rendered-nodes'))).toBeGreaterThan(0);
  expect(Number(await surface.getAttribute('data-rendered-edges'))).toBeGreaterThan(0);
  await expect(surface.locator('canvas').first()).toBeVisible();

  const pixelCoverage = await surface.locator('canvas').evaluateAll((canvases) => canvases.reduce((painted, canvas) => {
    const context = canvas.getContext('2d');
    if (!context) return painted;
    const { width, height } = canvas;
    for (let row = 1; row < 20; row += 1) {
      for (let column = 1; column < 28; column += 1) {
        const pixel = context.getImageData(
          Math.floor((width * column) / 28),
          Math.floor((height * row) / 20),
          1,
          1,
        ).data;
        if (pixel[3] > 0) painted += 1;
      }
    }
    return painted;
  }, 0));
  expect(pixelCoverage).toBeGreaterThan(0);

  await surface.getByRole('button', { name: '放大' }).click();
  await surface.getByRole('button', { name: '缩小' }).click();
  await surface.getByRole('button', { name: '适应视图' }).click();
});

test('creates a compound derivation by dragging a blue concept port to a red concept port', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await dragConnection(page, 'A', 'B');

  await expect.poll(async () => page.evaluate(() => JSON.parse(
    localStorage.getItem('derivon.authoring.workspace/v0.3.0') ?? '{"manifest":{"graph":{"hyperedges":[]}}}',
  ).manifest.graph.hyperedges.length)).toBe(9);
  await expect(page.locator('.inspector-heading strong')).toHaveText(/^h-/);
  await expect(page.locator('.canvas-wrap')).not.toHaveClass(/is-interacting/);
});

test('edits the active derivation with same-color port gestures', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });

  const sampleBefore = await surface.getAttribute('data-port-sample');
  await dragConnection(page, 'C', 'h-b');
  await expect.poll(async () => page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.3.0') ?? '{}');
    return workspace.manifest.graph.hyperedges.find((edge: { id: string }) => edge.id === 'h-b')?.tails;
  })).toContain('C');
  await expect.poll(async () => surface.getAttribute('data-port-sample'), { timeout: 30_000 }).not.toBe(sampleBefore);
  await page.waitForTimeout(600);
  await expect(page.locator('main')).toHaveAttribute('data-layout-running', 'false');

  await dragConnection(page, 'h-b', 'D');
  await expect.poll(async () => page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.3.0') ?? '{}');
    return workspace.manifest.graph.hyperedges.find((edge: { id: string }) => edge.id === 'h-b')?.head;
  })).toBe('D');
});

test('highlights the whole incident hyperedge on overview hover', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const left = await graphPort(page, 'A', 'left');
  const right = await graphPort(page, 'A', 'right');
  await page.mouse.move((left.x + right.x) / 2, left.y);

  await expect.poll(async () => surface.getAttribute('data-emphasized-edges')).toContain('premise:h-b:A');
  await expect(surface).toHaveAttribute('data-emphasized-edges', /head:h-b/);
});

test('uses right click for route targets without allowing the native WebView menu', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await page.getByTitle('打开路线模式').click();

  const nativeMenuAllowed = await page.locator('.g6-graph-canvas').evaluate((element) => element.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
  ));
  expect(nativeMenuAllowed).toBe(false);

  const left = await graphPort(page, 'D', 'left');
  const right = await graphPort(page, 'D', 'right');
  await page.mouse.click((left.x + right.x) / 2, left.y, { button: 'right' });
  await expect(surface).toHaveAttribute('data-route-nodes', /D/);
  await expect(page.locator('.route-concept-selector.is-target')).toContainText('D');

  await page.mouse.click((left.x + right.x) / 2, left.y, { button: 'right' });
  await expect(surface).not.toHaveAttribute('data-route-nodes', /D/);
});

test('teaches concept drag before the toolbar derivation form', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
    version: 2,
    completedTours: [],
    progress: { graph: 8 },
  })));
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /理解 Derivon 的基本图模型/ }).click();
  await expect(page.getByLabel('操作引导：拖拽概念创建推导')).toBeVisible();
  const surface = page.locator('.g6-graph-surface');
  const fitRequestsBefore = Number(await surface.getAttribute('data-fit-requests'));

  await dragConnection(page, 'injective-surjective', 'invertible');
  await expect(page.getByLabel('操作引导：从右上角创建推导')).toBeVisible({ timeout: 5_000 });
  await expect.poll(async () => Number(await surface.getAttribute('data-fit-requests')), { timeout: 30_000 })
    .toBeGreaterThan(fitRequestsBefore);
  await page.getByTitle('编辑工作区 JSON').click();
  const manifest = JSON.parse(await page.locator('.json-modal textarea').inputValue());
  expect(manifest.graph.hyperedges.some((edge: { tails: string[]; head: string }) =>
    edge.head === 'invertible'
    && edge.tails.length === 1
    && edge.tails[0] === 'injective-surjective',
  )).toBe(true);
});

test('restores the original graph after the final tutorial step without stale G6 elements', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.evaluate(() => localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
    version: 2,
    completedTours: [],
    progress: { graph: 24 },
  })));
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /理解 Derivon 的基本图模型/ }).click();
  await expect(page.getByLabel('操作引导：对照整体与细分概念')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('main')).toHaveAttribute('data-layout-running', 'false', { timeout: 30_000 });

  await page.getByRole('button', { name: '对照', exact: true }).click();
  await page.getByRole('button', { name: '完成教程' }).hover();
  await page.getByRole('button', { name: '完成教程' }).click();
  await page.mouse.move(600, 400, { steps: 8 });

  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('main')).toHaveAttribute('data-layout-running', 'false', { timeout: 30_000 });
  await expect(surface).toHaveAttribute('data-layout-sample', /A:/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('keeps the replacement control open while moving from a hovered card into the HTML overlay', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const left = await graphPort(page, 'A', 'left');
  const right = await graphPort(page, 'A', 'right');
  await page.mouse.move((left.x + right.x) / 2, left.y);
  const trigger = page.getByRole('button', { name: /打开显示方式/ });
  await expect(trigger).toBeVisible();
  await trigger.hover();
  await page.waitForTimeout(180);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('radiogroup', { name: 'X 显示方式' })).toBeVisible();
});

test('opens runtime-only replacement compare from inspector and the attached card control', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill('A');
  await page.getByRole('option', { name: /^A/ }).click();
  await page.waitForTimeout(350);
  const initialNodes = Number(await surface.getAttribute('data-rendered-nodes'));
  const layoutRequestsBefore = await page.locator('main').getAttribute('data-layout-requests');
  const layoutSampleBefore = await surface.getAttribute('data-layout-sample') ?? '';
  const viewportBefore = await surface.getAttribute('data-viewport-sample');
  const originalConceptPositions = new Map(layoutSampleBefore.split('|').slice(0, 4).map((entry) => {
    const [id, position] = entry.split(':');
    return [id, position];
  }));

  await page.getByRole('button', { name: '对照', exact: true }).click();
  await expect(surface).toHaveAttribute('data-replacement-assists', '1');
  await expect(surface).toHaveAttribute('data-replacement-assist-arrow', 'true');
  await expect(surface).toHaveAttribute('data-replacement-assist-path', /replacement-assist:X:/);
  await expect.poll(async () => Number(await surface.getAttribute('data-rendered-nodes'))).toBeGreaterThan(initialNodes);
  await page.waitForTimeout(650);
  await expect(page.locator('main')).toHaveAttribute('data-layout-requests', layoutRequestsBefore ?? '0');
  await expect(surface).toHaveAttribute('data-viewport-sample', viewportBefore ?? '');
  const layoutSampleAfter = await surface.getAttribute('data-layout-sample') ?? '';
  const currentPositions = new Map(layoutSampleAfter.split('|').map((entry) => {
    const [id, position] = entry.split(':');
    return [id, position];
  }));
  originalConceptPositions.forEach((position, id) => expect(currentPositions.get(id)).toBe(position));

  const trigger = page.getByRole('button', { name: /打开显示方式/ });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('radiogroup', { name: 'X 显示方式' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '对照' })).toHaveAttribute('aria-checked', 'true');
  await surface.getByRole('button', { name: '放大' }).click();
  await expect(page.getByRole('radiogroup', { name: 'X 显示方式' })).toHaveCount(0);
  await expect(trigger).toBeVisible();

  await page.getByTitle('编辑工作区 JSON').click();
  const manifest = JSON.parse(await page.locator('.json-modal textarea').inputValue());
  expect(manifest.view.replacements).toEqual([{ points: ['A', 'B'], replaceWith: 'X', show: 'points' }]);
  await page.getByTitle('关闭').click();
  await page.reload();
  await expect(surface).toHaveAttribute('data-replacement-assists', '0', { timeout: 30_000 });
  await search.fill('A');
  await page.getByRole('option', { name: /^A/ }).click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: '对照', exact: true }).click();
  const compareLayoutRequests = await page.locator('main').getAttribute('data-layout-requests');
  const compareViewport = await surface.getAttribute('data-viewport-sample');
  await page.getByRole('button', { name: /打开显示方式/ }).click();
  await page.getByRole('radio', { name: '替换概念' }).click();
  await expect(surface).toHaveAttribute('data-replacement-assists', '0');
  await page.waitForTimeout(650);
  await expect(page.locator('main')).toHaveAttribute('data-layout-requests', compareLayoutRequests ?? '0');
  await expect(surface).toHaveAttribute('data-viewport-sample', compareViewport ?? '');
});

test('opens a derivation focused view without a render-effect loop', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const left = await graphPort(page, 'h-a', 'left');
  const right = await graphPort(page, 'h-a', 'right');
  await page.mouse.click((left.x + right.x) / 2, left.y);
  await expect(surface).toHaveAttribute('data-selected-nodes', 'h-a');

  await page.getByTitle('开启局部视图').click();
  await expect(page.getByTitle('关闭局部视图')).toBeVisible();
  await expect(surface).toHaveAttribute('data-dimmed-nodes', /D/);
  await expect.poll(() => page.evaluate(() => new Promise<string>((resolve) => {
    window.setTimeout(() => resolve('alive'), 50);
  }))).toBe('alive');
  await page.waitForTimeout(300);
  await page.getByTitle('关闭局部视图').click();
  await expect(surface).toHaveAttribute('data-dimmed-nodes', '');
  await expect(surface).toHaveAttribute('data-render-style-sample', /(?:^|\|)D:1:/);
  expect(errors.filter((message) => message.includes('Maximum update depth exceeded'))).toEqual([]);
});

test('uses partial-overlap Shift marquee without selecting dimmed nodes', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const aLeft = await graphPort(page, 'A', 'left');
  const aRight = await graphPort(page, 'A', 'right');
  await page.keyboard.down('Shift');
  await page.mouse.move(700, 650);
  await page.mouse.down();
  await page.mouse.move(aLeft.x + 3, aLeft.y + 6, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(surface).toHaveAttribute('data-selected-nodes', /A/);
  expect(aRight.x).toBeGreaterThan(aLeft.x);
});

test('keeps dimmed nodes passive and treats their click as a pane click', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill('A');
  await page.getByRole('option', { name: /^A/ }).click();
  await page.getByTitle('开启局部视图').click();
  await expect(surface).toHaveAttribute('data-dimmed-nodes', /D/);
  await expect(surface).toHaveAttribute('data-render-style-sample', /(?:^|\|)D:0\.16:/);
  await page.getByRole('button', { name: '适应视图' }).click();
  await page.waitForTimeout(1000);

  const dLeft = await graphPort(page, 'D', 'left');
  const dRight = await graphPort(page, 'D', 'right');
  await page.mouse.click((dLeft.x + dRight.x) / 2, dLeft.y);
  await expect(surface).toHaveAttribute('data-dimmed-nodes', '');
  await expect(surface).toHaveAttribute('data-render-style-sample', /(?:^|\|)D:1:/);
  await expect(page.locator('.inspector-heading .eyebrow')).toHaveText('Graph');
});

test('moves every selected node in one session-only group drag', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const aLeft = await graphPort(page, 'A', 'left');
  const aRight = await graphPort(page, 'A', 'right');
  const bLeft = await graphPort(page, 'B', 'left');
  const bRight = await graphPort(page, 'B', 'right');
  const cLeft = await graphPort(page, 'C', 'left');
  await page.keyboard.down('Shift');
  await page.mouse.click((aLeft.x + aRight.x) / 2, aLeft.y);
  await page.mouse.click((bLeft.x + bRight.x) / 2, bLeft.y);
  await page.keyboard.up('Shift');
  await expect(surface).toHaveAttribute('data-selected-nodes', /A/);
  await expect(surface).toHaveAttribute('data-selected-nodes', /B/);

  await page.mouse.move((aLeft.x + aRight.x) / 2, aLeft.y);
  await page.mouse.down();
  await page.mouse.move((aLeft.x + aRight.x) / 2 + 36, aLeft.y + 22, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    const movedA = await graphPort(page, 'A', 'left');
    const movedB = await graphPort(page, 'B', 'left');
    const stationaryC = await graphPort(page, 'C', 'left');
    return {
      a: [movedA.x - aLeft.x, movedA.y - aLeft.y],
      b: [movedB.x - bLeft.x, movedB.y - bLeft.y],
      c: [stationaryC.x - cLeft.x, stationaryC.y - cLeft.y],
    };
  }).toEqual({ a: [36, 22], b: [36, 22], c: [0, 0] });
  const workspace = await page.evaluate(() => localStorage.getItem('derivon.authoring.workspace/v0.3.0'));
  expect(workspace ?? '').not.toContain('positions');
});

test('shows typed port help and cancels an incomplete derivation draft with Escape', async ({ page }) => {
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const source = await graphPort(page, 'A', 'right');
  await page.mouse.move(source.x, source.y);
  await expect(page.getByRole('tooltip')).toHaveText('作为前提开始推导', { timeout: 2_000 });

  await page.getByRole('button', { name: '新建推导' }).click();
  const premiseSearch = page.getByRole('combobox', { name: '前提集合', exact: true });
  await premiseSearch.fill('A');
  await page.getByRole('listbox', { name: '前提集合搜索结果' }).getByRole('checkbox').check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '新建推导' })).toBeEnabled();
  await expect(page.getByRole('complementary', { name: '新建推导' })).toHaveCount(0);
});

test('creates a self-dependent derivation through canonical search selectors', async ({ page }) => {
  await page.getByRole('button', { name: '新建推导' }).click();
  const premiseSearch = page.getByRole('combobox', { name: '前提集合', exact: true });
  await premiseSearch.fill('A');
  await page.getByRole('listbox', { name: '前提集合搜索结果' }).getByRole('checkbox').check();
  const conclusionSearch = page.getByRole('combobox', { name: '结论', exact: true });
  await conclusionSearch.fill('A');
  await page.getByRole('listbox', { name: '结论搜索结果' }).getByRole('option').click();
  await page.getByRole('button', { name: '创建推导' }).click();

  const derivationId = await page.locator('.inspector-heading strong').textContent();
  const created = await page.evaluate((id) => {
    const workspace = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.3.0') ?? '{}');
    return workspace.manifest.graph.hyperedges.find((edge: { id: string }) => edge.id === id);
  }, derivationId);
  expect(created).toMatchObject({ tails: ['A'], head: 'A', weight: 1 });
});

test('uses concept-only overview LOD above the production detail threshold', async ({ page }) => {
  await page.addInitScript(() => {
    const concepts = 301;
    const points = Array.from({ length: concepts }, (_, index) => ({
      id: `p-${index}`,
      data: { label: `Concept ${index}`, document: `docs/p-${index}`, format: 'markdown' },
    }));
    const hyperedges = Array.from({ length: concepts }, (_, index) => ({
      id: `h-${index}`,
      weight: 1,
      tails: [`p-${index}`],
      head: `p-${(index + 1) % concepts}`,
      data: { document: `docs/h-${index}`, format: 'markdown' },
    }));
    const files = Object.fromEntries([
      ...points.map((point) => point.data.document),
      ...hyperedges.map((edge) => edge.data.document),
    ].flatMap((directory) => [
      [`${directory}/document.md`, '# Fixture'],
      [`${directory}/index.html`, '<!doctype html><title>Fixture</title>'],
    ]));
    localStorage.setItem('derivon.authoring.workspace/v0.3.0', JSON.stringify({
      manifest: {
        schema: 'derivon.authoring/v0.3.0',
        document: { title: 'G6 LOD', description: '' },
        graph: { points, hyperedges },
        view: { replacements: [] },
      },
      files,
    }));
  });
  await page.goto('/');
  const surface = page.locator('.g6-graph-surface');

  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(surface).toHaveAttribute('data-overview-lod', 'true');
  await expect(surface).toHaveAttribute('data-rendered-nodes', '301');
  await expect(surface).toHaveAttribute('data-rendered-edges', '0');
  await expect(surface.locator('canvas').first()).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  const search = page.getByRole('combobox', { name: '搜索概念' });
  await search.fill('p-0');
  await page.getByRole('option', { name: /p-0/ }).first().click();
  await page.getByTitle('开启局部视图').click();
  await expect.poll(async () => Number(await surface.getAttribute('data-rendered-nodes'))).toBeGreaterThan(301);
  await expect.poll(async () => Number(await surface.getAttribute('data-rendered-edges'))).toBeGreaterThan(0);
});

test('renders an empty workspace and incrementally adds its first concept', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('derivon.onboarding/v2', '{}');
  });
  await page.goto('/');
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(surface).toHaveAttribute('data-rendered-nodes', '0');
  await expect(surface).toHaveAttribute('data-rendered-edges', '0');

  await page.getByTitle('新建概念').click();
  await expect(surface).toHaveAttribute('data-rendered-nodes', '1');
  await expect(page.locator('.inspector .eyebrow')).toHaveText('概念');
  await expect(page.locator('.inspector-heading strong')).toHaveText('c-1');
});

test('creates and edits a derivation through the G6 authoring workflow', async ({ page }) => {
  await page.goto('/?example=replace-with');
  const surface = page.locator('.g6-graph-surface');
  await expect(surface).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });

  await page.getByRole('button', { name: '新建推导' }).click();
  const premiseSearch = page.getByRole('combobox', { name: '前提集合', exact: true });
  await premiseSearch.fill('A');
  await page.getByRole('listbox', { name: '前提集合搜索结果' }).getByRole('checkbox').check();
  const conclusionSearch = page.getByRole('combobox', { name: '结论', exact: true });
  await conclusionSearch.fill('B');
  await page.getByRole('listbox', { name: '结论搜索结果' }).getByRole('option').click();
  await page.getByRole('button', { name: '创建推导' }).click();

  await expect(page.locator('.inspector .eyebrow')).toHaveText('推导步骤');
  const derivationId = await page.locator('.inspector-heading strong').textContent();
  expect(derivationId).toMatch(/^h-/);

  await page.getByRole('button', { name: '编辑前提与结论' }).click();
  const editPremises = page.getByRole('combobox', { name: '前提集合', exact: true });
  await editPremises.fill('C');
  await page.getByRole('listbox', { name: '前提集合搜索结果' }).getByRole('checkbox').check();
  const editConclusion = page.getByRole('combobox', { name: '结论', exact: true });
  await editConclusion.fill('D');
  await page.getByRole('listbox', { name: '结论搜索结果' }).getByRole('option').click();
  await page.getByRole('button', { name: '保存更改' }).click();
  await expect(page.locator('.inspector .chips')).toContainText('C');
  await expect(page.locator('.conclusion-label')).toContainText('D');

  const layoutBefore = await surface.getAttribute('data-layout-sample');
  await page.getByRole('button', { name: '自动布局' }).click();
  await expect(page.getByRole('button', { name: '正在自动布局' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '自动布局' })).toBeEnabled();
  await expect(surface).not.toHaveAttribute('data-layout-sample', layoutBefore ?? '');

  await page.getByRole('button', { name: '撤回' }).click();
  await page.getByTitle('编辑工作区 JSON').click();
  const manifest = JSON.parse(await page.locator('.json-modal textarea').inputValue());
  expect(manifest.graph.hyperedges.find((edge: { id: string }) => edge.id === derivationId)?.head).toBe('B');
});
