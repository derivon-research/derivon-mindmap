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

async function installNativeWorkspace(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let workspace: { manifest: unknown; files: Record<string, string> } | null = null;
    (window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
    }).__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === 'save_workspace_as') {
          workspace = { manifest: args?.manifest, files: args?.files as Record<string, string> };
          return { path: '/tmp/derivon-tour-workspace', name: 'derivon-tour-workspace' };
        }
        if (command === 'workspace_revision') return 'native-tour-revision';
        if (command === 'write_workspace') {
          workspace = {
            manifest: args?.manifest,
            files: { ...(workspace?.files ?? {}), ...(args?.files as Record<string, string>) },
          };
          return null;
        }
        if (command === 'read_workspace') {
          if (!workspace) throw new Error('Native workspace was not created');
          return { workspace, revision: 'native-tour-revision' };
        }
        if (command === 'read_crash_report') return null;
        if (command === 'solve_route') {
          return {
            reachable: true,
            hyperedgeIds: ['injective-def', 'surjective-def', 'invertible-bijection'],
            executableOrder: ['injective-def', 'surjective-def', 'invertible-bijection'],
            pointIds: ['linear-map', 'injective-surjective', 'surjective', 'invertible'],
            cost: 3,
            lower: 3,
            upper: 3,
            provenOptimal: true,
            nodes: 4,
            millis: 1,
            targetDiagnoses: [],
          };
        }
        throw new Error(`Unexpected command: ${command}`);
      },
    };
  });
}

async function expectTourWithinViewport(page: import('@playwright/test').Page) {
  const metrics = await page.locator('.tour-popover').evaluate((popover) => {
    const rect = popover.getBoundingClientRect();
    const buttons = [...popover.querySelectorAll('footer button')].map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    });
    const overlaps = buttons.some((first, index) => buttons.slice(index + 1).some((second) => (
      Math.min(first.right, second.right) > Math.max(first.left, second.left)
      && Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top)
    )));
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      popover: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      buttons,
      overlaps,
    };
  });

  expect(metrics.popover.left).toBeGreaterThanOrEqual(0);
  expect(metrics.popover.top).toBeGreaterThanOrEqual(0);
  expect(metrics.popover.right).toBeLessThanOrEqual(metrics.viewport.width);
  expect(metrics.popover.bottom).toBeLessThanOrEqual(metrics.viewport.height);
  expect(metrics.overlaps).toBe(false);
  metrics.buttons.forEach((button) => {
    expect(button.left).toBeGreaterThanOrEqual(metrics.popover.left);
    expect(button.top).toBeGreaterThanOrEqual(metrics.popover.top);
    expect(button.right).toBeLessThanOrEqual(metrics.popover.right);
    expect(button.bottom).toBeLessThanOrEqual(metrics.popover.bottom);
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?example=replace-with');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('starts the eight-step basics tour and opens the modular tutorial menu', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  const tour = page.getByLabel('操作引导：创建第一个项目');
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(tour).toBeVisible();
  await expect(tour).toContainText('1 / 8');
  await expect(page.getByTitle('在新文件夹创建空项目')).toHaveAttribute('data-tour-feature', 'new-workspace');
  await expect(tour.getByRole('button', { name: '请完成当前操作' })).toBeDisabled();

  await tour.getByRole('button', { name: '退出并保留进度' }).click();
  const menu = page.getByRole('dialog', { name: '选择一个小教程' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('.onboarding-tour-list > button')).toHaveCount(6);
  await expect(menu).toContainText('理解 Derivon 的基本图模型');
  await expect(menu).not.toContainText('Replace With');
  await expect(menu).toContainText('下载 Derivon 本地版');
  await expect(menu).not.toContainText('JSON');
});

test('only auto-advances explicit creation actions', async ({ page }) => {
  await installNativeWorkspace(page);
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');

  await page.getByTitle('在新文件夹创建空项目').click();
  const titleTour = page.getByLabel('操作引导：给项目起一个名字');
  await expect(titleTour).toContainText('2 / 8');
  await page.getByLabel('文档标题').fill('A、B 与 X');
  await expect(titleTour).toBeVisible();
  await expect(titleTour.getByRole('button', { name: '下一步' })).toBeEnabled();
  await page.getByLabel('文档标题').blur();
  await expect(titleTour).toBeVisible();
  await titleTour.getByRole('button', { name: '下一步' }).click();

  const descriptionTour = page.getByLabel('操作引导：说明这个项目研究什么');
  const description = page.locator('.inspector textarea');
  await description.fill('学习概念和推导模型。');
  await expect(descriptionTour).toBeVisible();
  await descriptionTour.getByRole('button', { name: '下一步' }).click();

  await page.getByTitle('新建概念').click();
  const nameTour = page.getByLabel('操作引导：命名概念 A');
  await expect(nameTour).toContainText('5 / 8');
  const name = page.locator('.inspector label').filter({ hasText: '名称' }).locator('input');
  await name.fill('A');
  await expect(nameTour).toBeVisible();
  await name.blur();
  await expect(nameTour).toBeVisible();
});

test('loads a bundled linear algebra case for the graph-model tutorial', async ({ page }) => {
  await page.evaluate(() => {
    const workspaceKey = 'derivon.authoring.workspace/v0.2.0';
    const workspace = JSON.parse(localStorage.getItem(workspaceKey)!);
    workspace.manifest.graph.points = [];
    workspace.manifest.graph.hyperedges = [];
    workspace.manifest.view.positions = {};
    workspace.manifest.view.replacements = [];
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: { graph: 0 } }));
  });
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: '理解 Derivon 的基本图模型' }).click();

  const intro = page.getByLabel('操作引导：进入线性代数案例');
  await expect(intro).toContainText('1 / 20');
  await expect(page.getByLabel('文档标题')).toHaveValue('线性映射：零空间与可逆性');
  await expect(page.locator('.react-flow__node[data-id="linear-map"]')).toContainText('线性映射');
  await expect(page.locator('.react-flow__node[data-id="null-range"]')).toContainText('零空间');
  await expect(page.locator('.react-flow__node[data-id="invertible"]')).toContainText('可逆线性映射');
  await expect(page.getByLabel('该推导路径有 2 种方式实现')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="A"], .react-flow__node[data-id="B"], .react-flow__node[data-id="X"]')).toHaveCount(0);
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
});

test('guides the user back to the canvas after leaving a canvas tutorial step', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
      version: 2,
      completedTours: [],
      progress: { graph: 1 },
    }));
  });
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: '理解 Derivon 的基本图模型' }).click();

  await expect(page.getByLabel('操作引导：概念是需要理解的对象')).toBeVisible();
  await page.locator('.react-flow__node[data-id="linear-map"]').dblclick();

  const recovery = page.getByLabel('操作引导：返回知识图继续');
  await expect(recovery).toBeVisible();
  await expect(recovery.getByRole('button', { name: '请返回教学区域' })).toBeDisabled();
  await page.locator('[data-tour-feature="return-canvas"]').click();

  await expect(page.getByLabel('操作引导：概念是需要理解的对象')).toBeVisible();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('derivon.onboarding/v2')!).progress.graph
  ))).toBe(1);
});

test('guides the user back to the editor after leaving an editor tutorial step', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
      version: 2,
      completedTours: [],
      progress: { documents: 1 },
    }));
  });
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /文档工具/ }).click();

  await expect(page.getByLabel('操作引导：体验排版工具')).toBeVisible();
  await page.locator('[data-tour-feature="return-canvas"]').click();

  const recovery = page.getByLabel('操作引导：返回文档继续');
  await expect(recovery).toBeVisible();
  await expect(recovery.getByRole('button', { name: '请返回教学区域' })).toBeDisabled();
  await page.getByRole('button', { name: '编辑文档' }).click();

  await expect(page.getByLabel('操作引导：体验排版工具')).toBeVisible();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('derivon.onboarding/v2')!).progress.documents
  ))).toBe(1);
});

test('accepts natural editor shortcuts and typed formula syntax in document tutorials', async ({ page }) => {
  const primaryModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  const startDocumentStep = async (index: number, title: string) => {
    await page.evaluate((stepIndex) => {
      localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
        version: 2,
        completedTours: [],
        progress: { documents: stepIndex },
      }));
    }, index);
    await page.reload();
    await page.getByRole('button', { name: '操作引导' }).click();
    await page.getByRole('button', { name: /文档工具/ }).click();
    return page.getByLabel(`操作引导：${title}`);
  };

  let tour = await startDocumentStep(1, '体验排版工具');
  const body = page.getByLabel('Markdown 正文');
  await body.click();
  await page.keyboard.press(`${primaryModifier}+a`);
  await page.keyboard.press(`${primaryModifier}+i`);
  await expect(tour.getByRole('button', { name: '下一步' })).toBeEnabled();

  tour = await startDocumentStep(2, '插入 KaTeX 公式');
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' $x$');
  await expect(body.locator('.tiptap-mathematics-render[data-type="inline-math"]')).toBeVisible();
  await expect(tour.getByRole('button', { name: '下一步' })).toBeEnabled();

  tour = await startDocumentStep(5, '撤回一段临时输入');
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('临时修改');
  await page.keyboard.press(`${primaryModifier}+z`);
  await expect(tour.getByRole('button', { name: '完成教程' })).toBeEnabled();
});

test('persists incomplete progress and replays completed tours from the beginning', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: { basics: 2 } }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /第一次创建项目/ }).click();
  await expect(page.getByLabel('操作引导：说明这个项目研究什么')).toContainText('3 / 8');
  await page.getByRole('button', { name: '退出并保留进度' }).click();

  await page.evaluate(() => localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: ['basics'], progress: { basics: 0 } })));
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /第一次创建项目/ }).click();
  await expect(page.getByLabel('操作引导：创建第一个项目')).toContainText('1 / 8');
});

test('opens the concept document when resuming a document tutorial from the canvas', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: { documents: 4 } }));
  });
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /文档工具/ }).click();

  await expect(page.getByLabel('操作引导：插入 HTML 交互内容')).toBeVisible();
  await expect(page.getByLabel('Markdown 正文')).toBeVisible();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
});

test('opens a derivation document when resuming its authoring step from the canvas', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: { graph: 9 } }));
  });
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /图模型/ }).click();

  await expect(page.getByLabel('操作引导：推导文档回答“为什么”')).toBeVisible();
  await expect(page.getByLabel('Markdown 正文')).toBeVisible();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
});

test('selects a real parallel derivation group when resuming the comparison step', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: { graph: 12 } }));
  });
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /图模型/ }).click();

  await expect(page.getByLabel('操作引导：比较两种推导')).toBeVisible();
  const alternatives = page.getByLabel('查看推导方式');
  await expect(alternatives).toBeVisible();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
  await alternatives.selectOption('null-space-equations');
  const comparison = page.getByLabel('操作引导：比较两种推导');
  await expect(comparison.getByRole('button', { name: '下一步' })).toBeEnabled();
  await comparison.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByLabel('操作引导：调整当前实现的学习成本')).toBeVisible();
  await expect(page.locator('.inspector-heading strong')).toHaveText('null-space-equations');
});

test('rebuilds the graph example when resuming directly at the learning-cost step', async ({ page }) => {
  await page.evaluate(() => {
    const workspaceKey = 'derivon.authoring.workspace/v0.2.0';
    const workspace = JSON.parse(localStorage.getItem(workspaceKey)!);
    workspace.manifest.graph.points = [];
    workspace.manifest.graph.hyperedges = [];
    workspace.manifest.view.positions = {};
    workspace.manifest.view.replacements = [];
    localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
      version: 2,
      completedTours: [],
      progress: { graph: 13 },
    }));
  });
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /图模型/ }).click();

  const weightStep = page.getByLabel('操作引导：调整当前实现的学习成本');
  await expect(weightStep).toBeVisible();
  await expect(weightStep).toContainText('权重越大，学习成本越高');
  await expect(page.getByLabel('文档标题')).toHaveValue('线性映射：零空间与可逆性');
  await expect(page.getByLabel('查看推导方式').locator('option')).toHaveCount(2);
  await expect(page.locator('[data-tour-feature="derivation-weight"]')).toBeVisible();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
});

test('rebuilds replacement state when resuming the final graph-model steps', async ({ page }) => {
  const startGraphStep = async (step: number) => {
    await page.evaluate((index) => {
      localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
        version: 2,
        completedTours: [],
        progress: { graph: index },
      }));
    }, step);
    await page.reload();
    await page.getByRole('button', { name: '操作引导' }).click();
    await page.getByRole('button', { name: /图模型/ }).click();
  };

  await startGraphStep(16);
  const selectionStep = page.getByLabel('操作引导：选择单射和满射');
  const replaceButton = page.getByTitle('替换');
  await expect(selectionStep).toBeVisible();
  await expect(replaceButton).toBeDisabled();
  await page.locator('.react-flow__node[data-id="injective-surjective"]').click();
  await page.locator('.react-flow__node[data-id="surjective"]').click({ modifiers: ['Shift'] });

  const startReplacementStep = page.getByLabel('操作引导：开始建立替换');
  await expect(startReplacementStep).toBeVisible();
  await expect(replaceButton).toBeEnabled();
  await replaceButton.click();
  const autoAdvancedTargetStep = page.getByLabel('操作引导：选择整体概念');
  await expect(autoAdvancedTargetStep).toBeVisible();
  await page.locator('.react-flow__node[data-id="invertible"]').click();
  await expect(autoAdvancedTargetStep.getByRole('button', { name: '下一步' })).toBeEnabled();

  await startGraphStep(18);
  const targetStep = page.getByLabel('操作引导：选择整体概念');
  await expect(targetStep).toBeVisible();
  await page.locator('.react-flow__node[data-id="invertible"]').click();
  await expect(targetStep.getByRole('button', { name: '下一步' })).toBeEnabled();

  await startGraphStep(19);
  const toggleStep = page.getByLabel('操作引导：在整体和细分之间切换');
  await expect(toggleStep).toBeVisible();
  await page.getByRole('group', { name: 'invertible 显示方式' }).getByRole('button', { name: 'invertible' }).click();
  await expect(toggleStep.getByRole('button', { name: '完成教程' })).toBeEnabled();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
});

test('allows returning through completed graph steps after their targets disappear', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
    version: 2,
    completedTours: [],
    progress: { graph: 12 },
  })));
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /图模型/ }).click();

  let step = page.getByLabel('操作引导：比较两种推导');
  await page.getByLabel('查看推导方式').selectOption('null-space-equations');
  await step.getByRole('button', { name: '下一步' }).click();

  step = page.getByLabel('操作引导：调整当前实现的学习成本');
  await page.locator('[data-tour-feature="derivation-weight"]').fill('4.2');
  await step.getByRole('button', { name: '下一步' }).click();

  step = page.getByLabel('操作引导：为推导追加一个前提');
  const floater = page.locator('[data-testid="floater"]');
  await floater.evaluate((element) => { (element as HTMLElement).style.pointerEvents = 'none'; });
  await connect(page, 'subspace', 'null-space-def');
  await floater.evaluate((element) => { (element as HTMLElement).style.pointerEvents = 'auto'; });
  await expect(step.getByRole('button', { name: '下一步' })).toBeEnabled();
  await step.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByLabel('操作引导：在整体和细分视图间切换')).toBeVisible();

  await page.getByRole('button', { name: '上一步' }).click();
  await expect(page.getByLabel('操作引导：为推导追加一个前提').getByRole('button', { name: '下一步' })).toBeEnabled();
  await page.getByRole('button', { name: '上一步' }).click();
  await expect(page.getByLabel('操作引导：调整当前实现的学习成本').getByRole('button', { name: '下一步' })).toBeEnabled();
  await page.getByRole('button', { name: '上一步' }).click();

  const completedComparison = page.getByLabel('操作引导：比较两种推导');
  await expect(completedComparison).toContainText('这一步已经完成');
  await expect(completedComparison.getByRole('button', { name: '下一步' })).toBeEnabled();
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
});

test('returns to the project overview before resuming the project-description step', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: { basics: 2 } }));
  });
  await page.reload();
  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  await expect(page.getByLabel('Markdown 正文')).toBeVisible();

  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /第一次创建项目/ }).click();

  await expect(page.getByLabel('操作引导：说明这个项目研究什么')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '说明', exact: true })).toBeVisible();
  await expect(page.getByLabel('Markdown 正文')).toHaveCount(0);
  await expect(page.locator('.onboarding-target-error')).toHaveCount(0);
});

test('restores the user workspace after the large-project tutorial exits', async ({ page }) => {
  const title = page.getByLabel('文档标题');
  await expect(title).toHaveValue('A + B → X');
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /大型项目导航/ }).click();
  await expect(page.getByLabel('操作引导：进入大型示例项目')).toBeVisible();
  await expect(title).toHaveValue('线性代数应该这样学：概念与推导图');
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(64);

  await page.getByRole('button', { name: '退出并保留进度' }).click();
  await expect(title).toHaveValue('A + B → X');
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(4);
});

test('teaches direct navigation in the math-reforged example', async ({ page }) => {
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /大型项目导航/ }).click();

  const introStep = page.getByLabel('操作引导：进入大型示例项目');
  await expect(introStep).toContainText('这个大型 derivon 实例项目是 math-reforged');
  await expect(introStep.getByRole('link', { name: '查看 Math Reforged 的 GitHub 仓库' })).toHaveAttribute(
    'href',
    'https://github.com/derivon-research/math-reforged',
  );
  await introStep.getByRole('button', { name: '下一步' }).click();

  const zoomStep = page.getByLabel('操作引导：缩放和浏览大型知识图');
  await expect(zoomStep).toContainText('鼠标滚轮缩放');
  await expect(zoomStep).toContainText('MacBook 触控板上双指缩放');
  await zoomStep.getByRole('button', { name: '下一步' }).click();

  const focusStep = page.getByLabel('操作引导：打开概念或推导的关联视图');
  await expect(focusStep).toContainText('概念和推导都可以打开关联视图');
  await expect(page.locator('[data-tour-feature="focused-view"]')).toBeVisible();
  const derivation = page.locator('.react-flow__node-derivation').first();
  await derivation.click();
  await derivation.click();
  await expect(focusStep.getByRole('button', { name: '下一步' })).toBeEnabled();
  await focusStep.getByRole('button', { name: '下一步' }).click();

  const searchStep = page.getByLabel('操作引导：按名称定位概念');
  await expect(searchStep).toContainText('只输入“Hamilton”');
  await page.getByLabel('搜索概念').fill('Hamilton');
  const searchResults = page.getByRole('listbox', { name: '概念搜索结果' });
  await expect(searchResults).toBeVisible();
  const searchTargetBounds = await page.locator('[data-tour-feature="search"]').boundingBox();
  const searchResultsBounds = await searchResults.boundingBox();
  if (!searchTargetBounds || !searchResultsBounds) throw new Error('search tutorial target is not visible');
  expect(searchTargetBounds.y + searchTargetBounds.height).toBeGreaterThanOrEqual(
    searchResultsBounds.y + searchResultsBounds.height,
  );
  await searchResults.getByRole('option', { name: /Cayley-Hamilton 定理/ }).click();
  await expect(searchStep.getByRole('button', { name: '下一步' })).toBeEnabled();
  await expect(page.locator('.inspector').getByLabel('名称')).toHaveValue('Cayley-Hamilton 定理');
});

test('keeps the delete confirmation interactive above Joyride', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('derivon.onboarding/v2', JSON.stringify({ version: 2, completedTours: [], progress: { navigation: 5 } })));
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /大型项目导航/ }).click();
  await expect(page.getByLabel('操作引导：安全删除对象')).toBeVisible();
  await page.getByTitle('删除概念').click();

  const backdrop = page.locator('.delete-confirm-backdrop');
  await expect(backdrop).toBeVisible();
  expect(await backdrop.evaluate((element) => Number(getComputedStyle(element).zIndex))).toBeGreaterThan(90);
  await backdrop.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByLabel('操作引导：撤回画布修改')).toBeVisible();
});

test('links the browser tutorial to the latest desktop release', async ({ page }) => {
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /下载 Derivon 本地版/ }).click();
  const downloadStep = page.getByLabel('操作引导：下载 Derivon 本地版');
  await expect(downloadStep).toContainText('路线推导只在本地应用中提供');
  await expect(downloadStep.getByRole('link', { name: '下载最新本地版' })).toHaveAttribute(
    'href',
    'https://github.com/derivon-research/derivon-mindmap/releases/latest',
  );
});

test('runs the route tutorial inside the local application', async ({ page }) => {
  await installNativeWorkspace(page);
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();

  const menu = page.getByRole('dialog', { name: '选择一个小教程' });
  await expect(menu).toContainText('推导学习路线');
  await expect(menu).not.toContainText('下载 Derivon 本地版');
  await page.getByRole('button', { name: /推导学习路线/ }).click();

  const intro = page.getByLabel('操作引导：从已知概念推导学习路线');
  await expect(intro).toContainText('已经掌握的概念作为起点');
  await expect(page.getByLabel('文档标题')).toHaveValue('线性代数应该这样学：概念与推导图');
  await intro.getByRole('button', { name: '下一步' }).click();

  await page.getByTitle('打开路线模式').click();
  const startStep = page.getByLabel('操作引导：选择已经掌握的概念');
  await expect(startStep).toBeVisible();
  const startSearch = page.getByRole('combobox', { name: '已经掌握', exact: true });
  await startSearch.fill('线性映射');
  const startResults = page.getByRole('listbox', { name: '已经掌握搜索结果' });
  const startTargetBounds = await page.locator('[data-tour-feature="route-start"]').boundingBox();
  const startResultsBounds = await startResults.boundingBox();
  if (!startTargetBounds || !startResultsBounds) throw new Error('route start tutorial target is not visible');
  expect(startTargetBounds.y + startTargetBounds.height).toBeGreaterThanOrEqual(
    startResultsBounds.y + startResultsBounds.height,
  );
  await startResults.getByRole('checkbox', { name: '线性映射 linear-map', exact: true }).check();
  await expect(startStep.getByRole('button', { name: '下一步' })).toBeEnabled();
  await startStep.getByRole('button', { name: '下一步' }).click();

  const targetStep = page.getByLabel('操作引导：选择想学习的目标');
  const targetSearch = page.getByRole('combobox', { name: '目标概念', exact: true });
  await targetSearch.fill('可逆线性映射');
  await page.getByRole('listbox', { name: '目标概念搜索结果' })
    .getByRole('checkbox', { name: '可逆线性映射 invertible', exact: true }).check();
  await expect(targetStep.getByRole('button', { name: '下一步' })).toBeEnabled();
  await targetStep.getByRole('button', { name: '下一步' }).click();

  const solveStep = page.getByLabel('操作引导：计算学习路线');
  await page.getByRole('button', { name: '开始求解' }).click();
  await expect(solveStep).toBeVisible();
  await expect(solveStep.getByRole('button', { name: '下一步' })).toBeEnabled();
  await solveStep.getByRole('button', { name: '下一步' }).click();

  const resultStep = page.getByLabel('操作引导：阅读推导顺序和总成本');
  await expect(resultStep).toContainText('整条路线的总学习成本');
  await expect(page.getByRole('region', { name: '路线结果' })).toBeVisible();
  await expect(page.locator('.route-steps li')).toHaveCount(3);
});

test('keeps tutorial popovers and footer controls inside short and narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 360 });
  await page.evaluate(() => localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
    version: 2,
    completedTours: [],
    progress: { basics: 5 },
  })));
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /第一次创建项目/ }).click();
  await expect(page.getByLabel('操作引导：概念拥有独立文档')).toBeVisible();
  await expectTourWithinViewport(page);

  await page.setViewportSize({ width: 320, height: 480 });
  await expect.poll(async () => page.locator('.tour-popover').evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(320);
  await expectTourWithinViewport(page);

  await page.getByRole('button', { name: '退出并保留进度' }).click();
  await page.getByRole('button', { name: /下载 Derivon 本地版/ }).click();
  await expect(page.getByLabel('操作引导：下载 Derivon 本地版')).toBeVisible();
  await expectTourWithinViewport(page);

  await page.getByRole('button', { name: '退出并保留进度' }).click();
  await page.getByRole('button', { name: '关闭操作引导' }).click();
  await page.setViewportSize({ width: 900, height: 360 });
  await page.evaluate(() => localStorage.setItem('derivon.onboarding/v2', JSON.stringify({
    version: 2,
    completedTours: [],
    progress: { basics: 2 },
  })));
  await page.reload();
  await page.getByRole('button', { name: '操作引导' }).click();
  await page.getByRole('button', { name: /第一次创建项目/ }).click();
  await expect(page.getByLabel('操作引导：说明这个项目研究什么')).toBeVisible();
  await expectTourWithinViewport(page);
});

test('disables native text selection while drawing a connection', async ({ page }) => {
  const handle = page.locator('.react-flow__node[data-id="A"] .react-flow__handle-right');
  const box = await handle.boundingBox();
  if (!box) throw new Error('connection handle is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 20, { steps: 4 });
  const canvas = page.locator('.canvas-wrap');
  await expect(canvas).toHaveClass(/is-interacting/);
  await expect(canvas).toHaveCSS('user-select', 'none');
  await page.mouse.up();
  await expect(canvas).not.toHaveClass(/is-interacting/);
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

test('renders Chinese and Latin italic text visibly and preserves its Markdown mark', async ({ page }) => {
  await page.getByTitle('新建概念').click();
  await page.getByRole('button', { name: '编辑文档' }).click();

  const body = page.getByLabel('Markdown 正文');
  const primaryModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await body.click();
  await page.keyboard.press(`${primaryModifier}+a`);
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText('中文 Italic text');
  await page.keyboard.press(`${primaryModifier}+a`);
  await page.getByRole('button', { name: '斜体' }).click();

  const italic = body.locator('em');
  await expect(italic).toHaveText('中文 Italic text');
  expect(await italic.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontStyle: style.fontStyle, fontSynthesis: style.fontSynthesis };
  })).toEqual({ fontStyle: 'oblique 12deg', fontSynthesis: 'style' });
  await expect.poll(() => page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).files;
    return files['docs/concept-c-1/document.md'];
  })).toContain('*中文 Italic text*');
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

test('inserts HTML at the current selection, including inside a table cell', async ({ page }) => {
  await page.getByTitle('新建概念').click();
  await page.getByRole('button', { name: '编辑文档' }).click();
  const body = page.getByLabel('Markdown 正文');
  await body.click();
  await page.getByRole('button', { name: '插入表格' }).click();
  await body.locator('table td').first().click();
  await page.getByRole('button', { name: '插入 HTML 交互示例' }).click();
  await expect(body.locator('table .raw-html-block')).toHaveCount(1);
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
  const dimmedNode = page.locator('.react-flow__node[data-id="D"]');
  await expect(dimmedNode.locator('.concept-node')).toHaveClass(/is-dimmed/);
  await expect(dimmedNode).toHaveCSS('pointer-events', 'none');
  await expect(dimmedNode).not.toHaveClass(/selectable|draggable/);
  const stacking = await page.locator('.react-flow__node[data-id="A"], .react-flow__node[data-id="D"]').evaluateAll((elements) =>
    Object.fromEntries(elements.map((element) => [
      element.getAttribute('data-id'),
      Number(getComputedStyle(element).zIndex),
    ])),
  );
  expect(stacking.A).toBeGreaterThan(stacking.D);
  await expect(node.locator('.concept-node')).toHaveCSS('opacity', '1');
  await expect(node.locator('.concept-node')).toHaveCSS('background-color', 'rgb(250, 251, 249)');

  const viewport = page.locator('.react-flow__viewport');
  await expect.poll(() => viewport.getAttribute('style')).toContain('transform');
  await page.waitForTimeout(300);
  const focusedViewport = await viewport.getAttribute('style');
  await page.getByRole('button', { name: 'Zoom Out' }).click();
  await page.getByRole('button', { name: 'Zoom Out' }).click();
  await expect.poll(() => viewport.getAttribute('style')).not.toBe(focusedViewport);
  await page.getByRole('button', { name: 'Fit View' }).click();
  await expect.poll(() => viewport.getAttribute('style')).toBe(focusedViewport);

  const overviewPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.A);
  const box = await node.boundingBox();
  if (!box) throw new Error('focused A is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 25, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('derivon.authoring.workspace/v0.2.0')!).manifest.view.positions.A)).toEqual(overviewPosition);
});

test('opens documents with a modifier click and keeps double-click for the local view', async ({ page }) => {
  const concept = page.locator('.react-flow__node[data-id="A"]');
  await concept.click({ modifiers: ['Control'] });
  await expect(page.getByLabel('Markdown 正文')).toBeVisible();
  await expect(page.locator('.editor-context .eyebrow')).toHaveText('概念文档');
  await page.getByTitle('返回画布').first().click();

  const derivation = page.locator('.react-flow__node-derivation').first();
  await derivation.click({ modifiers: ['Meta'] });
  await expect(page.getByLabel('Markdown 正文')).toBeVisible();
  await expect(page.locator('.editor-context .eyebrow')).toHaveText('推导文档');
  await page.getByTitle('返回画布').first().click();

  await page.reload();
  const overviewConcept = page.locator('.react-flow__node[data-id="A"]');
  await overviewConcept.dblclick();
  await expect(page.getByLabel('Markdown 正文')).toHaveCount(0);
  await expect(page.locator('.concept-node.is-dimmed')).toHaveCount(1);
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

test('keeps the existing selection when Shift and pointer down happen in the same task', async ({ page }) => {
  const nodeA = page.locator('.react-flow__node[data-id="A"]');
  await nodeA.click();
  await expect(nodeA).toHaveClass(/selected/);

  await page.evaluate(() => {
    const nodeB = document.querySelector<HTMLElement>('.react-flow__node[data-id="B"]');
    if (!nodeB) throw new Error('B is not visible');
    nodeB.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Shift',
      code: 'ShiftLeft',
      bubbles: true,
      shiftKey: true,
    }));
    nodeB.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      shiftKey: true,
    }));
    nodeB.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      shiftKey: true,
    }));
    nodeB.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
      shiftKey: true,
    }));
    window.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'Shift',
      code: 'ShiftLeft',
      bubbles: true,
    }));
  });

  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await expect(nodeA).toHaveClass(/selected/);
  await expect(page.locator('.react-flow__node[data-id="B"]')).toHaveClass(/selected/);
});

test('keeps Shift-click on a node when the pointer moves slightly before release', async ({ page }) => {
  const nodeA = page.locator('.react-flow__node[data-id="A"]');
  const nodeB = page.locator('.react-flow__node[data-id="B"]');
  await nodeA.click();
  const bounds = await nodeB.boundingBox();
  if (!bounds) throw new Error('B is not visible');

  await page.keyboard.down('Shift');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 1, bounds.y + bounds.height / 2 + 1);
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect(nodeA).toHaveClass(/selected/);
  await expect(nodeB).toHaveClass(/selected/);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await expect(page.locator('.react-flow__selection')).toHaveCount(0);
});

test('writes opt-in selection diagnostics to the development server', async ({ page }) => {
  await page.goto('/?example=replace-with&debugSelection=1');
  const nodeA = page.locator('.react-flow__node[data-id="A"]');
  const nodeB = page.locator('.react-flow__node[data-id="B"]');
  await nodeA.click();
  await nodeB.click({ modifiers: ['Shift'] });

  await expect.poll(async () => {
    const response = await page.request.get('/__derivon_selection_debug');
    return response.text();
  }).toContain('pointer-down-capture');
  const log = await (await page.request.get('/__derivon_selection_debug')).text();
  expect(log).toContain('"event":"keydown"');
  expect(log).toContain('"event":"selection-change"');
  expect(log).toContain('"nodeId":"B"');
  expect(log).toContain('"storeMultiSelectionActive":true');
});

test('Shift-selects a derivation from the visible edge of its stacked diamond', async ({ page }) => {
  const concept = page.locator('.react-flow__node[data-id="A"]');
  const derivation = page.locator('.react-flow__node-derivation').filter({
    has: page.locator('.stack-layer-1'),
  });
  await concept.click();
  await expect(concept).toHaveClass(/selected/);

  const bounds = await derivation.boundingBox();
  if (!bounds) throw new Error('stacked derivation is not visible');
  await page.keyboard.down('Shift');
  await page.mouse.click(bounds.x + bounds.width + 2, bounds.y + bounds.height / 2 - 3);
  await page.keyboard.up('Shift');

  await expect(derivation).toHaveClass(/selected/);
  await expect(concept).toHaveClass(/selected/);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
});

test('shows a pointer and lift shadow when selectable graph objects are hovered', async ({ page }) => {
  const cases = [
    {
      node: page.locator('.react-flow__node-concept[data-id="A"]'),
      shadow: page.locator('.react-flow__node-concept[data-id="A"] .concept-node'),
      hitSlopBottom: '-3px',
    },
    {
      node: page.locator('.react-flow__node-derivation').first(),
      shadow: page.locator('.react-flow__node-derivation .derivation-diamond').first(),
      hitSlopBottom: '-8px',
    },
  ];

  for (const item of cases) {
    const restingBounds = await item.node.boundingBox();
    if (!restingBounds) throw new Error('graph object is not visible');
    const restingShadow = await item.shadow.evaluate((element) => getComputedStyle(element).boxShadow);
    await page.mouse.move(
      restingBounds.x + restingBounds.width / 2,
      restingBounds.y + restingBounds.height - 1,
    );
    await expect(item.node).toHaveCSS('cursor', 'pointer');
    await expect(item.node).toHaveCSS('translate', '0px -2px');
    await expect.poll(() => item.shadow.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(restingShadow);
    await expect.poll(() => item.node.evaluate((element) => getComputedStyle(element, '::before').bottom)).toBe(item.hitSlopBottom);
    await page.waitForTimeout(200);
    await expect(item.node).toHaveCSS('translate', '0px -2px');
  }
});

test('keeps edges passive and only emphasizes the hovered neighborhood', async ({ page }) => {
  const related = page.locator('.react-flow__edge[data-id="premise:h-b:A"]');
  const incoming = page.locator('.react-flow__edge[data-id="head:h-a"]');
  const unrelated = page.locator('.react-flow__edge[data-id="head:h-d-points"]');

  for (const edge of [related, incoming, unrelated]) {
    await expect(edge).toHaveCSS('pointer-events', 'none');
    await expect(edge).not.toHaveClass(/selectable/);
    await expect(edge.locator('.react-flow__edge-path')).toHaveCSS('opacity', '0.18');
  }

  await page.locator('.react-flow__node[data-id="A"]').hover();
  await expect(related.locator('.react-flow__edge-path')).toHaveCSS('opacity', '1');
  await expect(incoming.locator('.react-flow__edge-path')).toHaveCSS('opacity', '1');
  await expect(unrelated.locator('.react-flow__edge-path')).toHaveCSS('opacity', '0.18');
});

test('keeps background edges dimmed when a concept is hovered in the related view', async ({ page }) => {
  const anchor = page.locator('.react-flow__node[data-id="A"]');
  await anchor.click();
  await anchor.click();

  const activeEdge = page.locator('.react-flow__edge[data-id="premise:h-b:A"] .react-flow__edge-path');
  const backgroundEdge = page.locator('.react-flow__edge[data-id="premise:h-d-points:B"] .react-flow__edge-path');
  await expect(activeEdge).toHaveCSS('opacity', '1');
  await expect(backgroundEdge).toHaveCSS('opacity', '0.08');

  await page.locator('.react-flow__node[data-id="B"]').hover();
  await expect(activeEdge).toHaveCSS('opacity', '1');
  await expect(backgroundEdge).toHaveCSS('opacity', '0.08');
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

test('Shift marquee selects a node when the selection only overlaps its edge', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="A"]');
  const box = await node.boundingBox();
  if (!box) throw new Error('A is not visible');

  await page.keyboard.down('Shift');
  await page.mouse.move(box.x - 12, box.y + box.height / 2 - 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 3, box.y + box.height / 2 + 6, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await expect(node).toHaveClass(/selected/);
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

test('defines a replacement by selecting a point set and an existing target', async ({ page }) => {
  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.getByTitle('解除替换关系').click();
  await expect(page.locator('.react-flow__node-concept')).toHaveCount(5);

  await page.locator('.react-flow__node[data-id="A"]').click();
  await page.locator('.react-flow__node[data-id="B"]').click({ modifiers: ['Shift'] });
  await page.getByTitle('替换').click();
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

test('persists, copies, and clears an unhandled frontend crash report', async ({ page }) => {
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'ResizeObserver loop completed with undelivered notifications.',
    }));
  });
  await expect(page.getByRole('alertdialog', { name: '检测到应用异常' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('derivon.crash-report/v1'))).toBeNull();

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(text: string) {
          (window as unknown as { __copiedCrashReport: string }).__copiedCrashReport = text;
        },
      },
    });
    const error = new Error('simulated renderer crash');
    window.dispatchEvent(new ErrorEvent('error', { message: error.message, error }));
  });

  const dialog = page.getByRole('alertdialog', { name: '检测到应用异常' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('报告仅保存在本机，不会自动上传');
  await expect(dialog.locator('pre')).toContainText('来源: 前端未处理异常');
  await expect(dialog.locator('pre')).toContainText('Error: simulated renderer crash');
  expect(await page.evaluate(() => localStorage.getItem('derivon.crash-report/v1'))).toContain('simulated renderer crash');

  await dialog.getByRole('button', { name: '复制报告' }).click();
  await expect(dialog.getByRole('button', { name: '已复制' })).toBeVisible();
  expect(await page.evaluate(() => (
    window as unknown as { __copiedCrashReport: string }
  ).__copiedCrashReport)).toContain('simulated renderer crash');

  await dialog.getByRole('button', { name: '清除报告' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('derivon.crash-report/v1'))).toBeNull();
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

test('renders a long route across a large workspace without blocking the canvas', async ({ page }) => {
  const routeResult = {
    reachable: true,
    hyperedgeIds: Array.from({ length: 16 }, (_, index) => `h-${index}`),
    executableOrder: Array.from({ length: 16 }, (_, index) => `h-${index}`),
    pointIds: [...Array.from({ length: 17 }, (_, index) => `p-${index}`), 'p-63'],
    cost: 37,
    lower: 37,
    upper: 37,
    provenOptimal: true,
    nodes: 14,
    millis: 1,
    targetDiagnoses: [],
  };
  await page.addInitScript((result) => {
    (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string) => Promise<unknown> } }).__TAURI_INTERNALS__ = {
      invoke: async (command) => {
        if (command === 'solve_route') return result;
        throw new Error(`Unexpected command: ${command}`);
      },
    };
  }, routeResult);
  await page.evaluate(() => {
    const points = Array.from({ length: 64 }, (_, index) => ({
      id: `p-${index}`,
      data: { label: `P${index}`, document: `docs/p-${index}`, format: 'html' },
    }));
    const hyperedges = Array.from({ length: 68 }, (_, index) => {
      const tail = index < 63 ? index : index - 63;
      const head = index < 63 ? index + 1 : index - 61;
      return {
        id: `h-${index}`,
        weight: index === 15 ? 7 : 2,
        tails: [`p-${tail}`],
        head: `p-${head}`,
        data: { document: `docs/h-${index}`, format: 'html' },
      };
    });
    const positions = Object.fromEntries([
      ...points.map((point, index) => [point.id, { x: (index % 16) * 220, y: Math.floor(index / 16) * 180 }]),
      ...hyperedges.map((edge, index) => [edge.id, { x: (index % 16) * 220 + 150, y: Math.floor(index / 16) * 180 + 5 }]),
    ]);
    const files = Object.fromEntries([
      ...points.map((point) => [`${point.data.document}/index.html`, `<h1>${point.data.label}</h1>`]),
      ...hyperedges.map((edge) => [`${edge.data.document}/index.html`, `<h1>${edge.id}</h1>`]),
    ]);
    localStorage.setItem('derivon.authoring.workspace/v0.2.0', JSON.stringify({
      manifest: {
        schema: 'derivon.authoring/v0.2.0',
        document: { title: 'Large route regression', description: '', updatedAt: new Date().toISOString() },
        graph: { points, hyperedges },
        view: { positions, replacements: [] },
      },
      files,
    }));
  });
  await page.reload();
  await page.getByTitle('打开路线模式').click();

  const startSearch = page.getByRole('combobox', { name: '已经掌握', exact: true });
  const startResults = page.getByRole('listbox', { name: '已经掌握搜索结果' });
  await startSearch.fill('P0');
  await startResults.getByRole('checkbox', { name: /^P0\b/ }).check();
  await startSearch.fill('P63');
  await startResults.getByRole('checkbox', { name: /^P63\b/ }).check();
  const targetSearch = page.getByRole('combobox', { name: '目标概念', exact: true });
  await targetSearch.fill('P16');
  await page.getByRole('listbox', { name: '目标概念搜索结果' }).getByRole('checkbox', { name: /^P16\b/ }).check();
  await targetSearch.fill('');

  await page.getByRole('button', { name: '开始求解' }).click();
  const result = page.getByRole('region', { name: '路线结果' });
  await expect(result).toBeVisible({ timeout: 2000 });
  await expect(result.locator('.route-steps li')).toHaveCount(16);
  await page.getByRole('button', { name: 'Fit View' }).click();
  const active = page.locator('.react-flow__node[data-id="p-0"]');
  const dimmed = page.locator('.react-flow__node[data-id="p-62"]');
  await expect(active).toHaveCSS('pointer-events', 'auto');
  await expect(dimmed).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.react-flow__edge[data-id="premise:h-0:p-0"] .react-flow__edge-path')).toHaveCSS('opacity', '1');
  await expect(page.locator('.react-flow__edge[data-id="premise:h-61:p-61"] .react-flow__edge-path')).toHaveCSS('opacity', '0.08');
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
