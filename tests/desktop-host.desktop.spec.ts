import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { RECENT_WORKSPACES_KEY } from '../src/hosts/desktop/recentWorkspaces';
import { parseWorkspaceManifest } from '../src/workspace/manifest';
import { findCanvasPixel } from '../src/testing/canvasPixels';
import { collectHooks, collectedHooks } from './hookProbe';

const parseManifest = (text: string) => parseWorkspaceManifest(text).manifest;

const CONVERSATION_CATALOG = {
  models: [
    { providerId: 'anthropic', modelId: 'claude-opus-5', name: 'Claude Opus 5' },
    { providerId: 'openai', modelId: 'gpt-5', name: 'GPT-5' },
    // The catalog names neither of these; the picker shows them by id.
    { providerId: 'openai', modelId: 'gpt-5-codex' },
    { providerId: 'deepseek', modelId: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' },
  ],
};

let directory: string;
let conversationCommands: { command: string; args?: unknown }[];
let commits: number;
let holdWrites: Promise<void> | undefined;
let releaseWrites: (() => void) | undefined;
let writesInFlight: Promise<unknown>[];
const manifestPath = '.derivon/workspace.json';
const emptyGraph = JSON.stringify({
  schema: 'derivon.workspace/v1', document: { title: 'GUI fixture', description: '' },
  graph: { points: [], hyperedges: [] },
});

test.beforeEach(async ({ page }) => {
  directory = await mkdtemp(path.join(tmpdir(), 'derivon-gui-'));
  conversationCommands = [];
  commits = 0;
  writesInFlight = [];
  holdWrites = undefined;
  releaseWrites = undefined;
  // Only the native IPC boundary is substituted. The real desktop host, content module,
  // synchronization and both modes run unchanged; persistence survives a browser reload.
  await page.exposeFunction('__nativeWorkspaceInvoke', async (command: string, args?: {
    rootPath: string; relativePath?: string;
    changes?: { graph?: string; createOnly?: boolean; documents: Array<{ path: string; content: string | null }>; assets?: Array<{ path: string; content: number[] | null }> };
  }) => {
    if (command.startsWith('plugin:event|')) return 0;
    // The Pi companion is a separate process behind the same IPC boundary; only its
    // catalog is substituted, so the shared conversation pane runs unchanged.
    if (command.startsWith('conversation_')) {
      conversationCommands.push({ command, args });
      return command === 'conversation_list_models' ? CONVERSATION_CATALOG : null;
    }
    if (command === 'choose_workspace_source_directory') return { path: directory, name: path.basename(directory) };
    if (args?.rootPath !== directory) throw new Error('Unexpected fixture root');
    if (command === 'workspace_source_revision') return String(commits);
    if (command === 'read_workspace_source_graph') return readFile(path.join(directory, manifestPath), 'utf8');
    if (command === 'read_workspace_source_document') return readFile(path.join(directory, args.relativePath!), 'utf8');
    if (command === 'read_workspace_source_asset') return [...await readFile(path.join(directory, args.relativePath!))];
    if (command === 'read_workspace_source_companion_metadata') {
      try { return await readFile(path.join(directory, args.relativePath!), 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    }
    if (command === 'commit_workspace_source_changes') {
      const write = (async () => {
      await holdWrites;
      const changes = args.changes!;
      const files = [...changes.documents];
      if (changes.graph !== undefined) files.unshift({ path: manifestPath, content: changes.graph });
      for (const file of files) {
        const target = path.join(directory, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        if (file.content === null) await rm(target, { force: true });
        else await writeFile(target, file.content, { flag: changes.createOnly ? 'wx' : 'w' });
      }
      for (const asset of changes.assets ?? []) {
        const target = path.join(directory, asset.path);
        await mkdir(path.dirname(target), { recursive: true });
        if (asset.content === null) await rm(target, { force: true });
        else await writeFile(target, new Uint8Array(asset.content));
      }
      commits++;
      return String(commits);
      })();
      writesInFlight.push(write);
      return write;
    }
    throw new Error(`Unexpected native command: ${command}`);
  });
  await page.addInitScript(() => {
    const runtime = window as unknown as { __nativeWorkspaceInvoke: (command: string, args?: unknown) => Promise<unknown> };
    Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', { value: { unregisterListener() {} } });
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {
      invoke: runtime.__nativeWorkspaceInvoke,
      metadata: { currentWindow: { label: 'main' } },
      transformCallback: () => 0,
    } });
  });
});

test.afterEach(async ({ page }) => {
  await page.close();
  releaseWrites?.();
  await Promise.allSettled(writesInFlight);
  await rm(directory, { recursive: true, force: true });
});

async function seedRecentWorkspace(page: Page): Promise<void> {
  await mkdir(path.join(directory, '.derivon'));
  await writeFile(path.join(directory, manifestPath), emptyGraph);
  await page.addInitScript(({ key, value }) => { localStorage.setItem(key, value); }, {
    key: RECENT_WORKSPACES_KEY,
    value: JSON.stringify({ version: 1, workspaces: [{ path: directory, name: 'GUI fixture', openedAtMs: 1 }] }),
  });
}

async function openWorkspace(page: Page): Promise<void> {
  await seedRecentWorkspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: /GUI fixture/ }).click();
  await expect(page.locator('[data-derivon-mode="authoring"]')).toBeVisible();
  await expect(page.getByText('原生关闭保护未能启用', { exact: false })).toHaveCount(0);
}

/** The workbench opens on graph browsing; object editing is a different view. */
async function openObjects(page: Page): Promise<void> {
  await page.getByRole('button', { name: '对象', exact: true }).click();
  await expect(page.getByRole('button', { name: '对象', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Open the concept form. Creation is one entry — the workbar's 新建 — which asks for the
 * kind first; the empty objects view offers a shortcut straight to the concept step.
 */
async function openConceptForm(page: Page): Promise<void> {
  const shortcut = page.getByRole('button', { name: '新建概念', exact: true });
  if (await shortcut.count()) await shortcut.click();
  else {
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await page.getByRole('button', { name: /^概念/ }).click();
  }
  await expect(page.getByRole('textbox', { name: '概念名称' })).toBeVisible();
}

async function createConcept(page: Page, label: string): Promise<void> {
  await openConceptForm(page);
  await page.getByRole('textbox', { name: '概念名称' }).fill(label);
  await page.getByRole('textbox', { name: '概念名称' }).press('Enter');
  await expect(page.getByRole('dialog', { name: '新建对象' })).toHaveCount(0);
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue(label);
}

/**
 * Open the carried-over concept's document on the learning side.
 *
 * A whole-window mode switch brings the authoring selection along as the learner's
 * target, so the concept is painted in the target colour rather than the unmarked grey
 * of a concept nobody has decided about.
 */
const TARGET_FILL = [185, 28, 28];

async function openCarriedConceptDocument(page: Page, title: string): Promise<void> {
  const learning = page.locator('[data-derivon-mode="learning"]');
  await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
  const point = await page.evaluate(findCanvasPixel, { clientCoordinates: true, color: TARGET_FILL });
  expect(point, 'the carried-over target is not painted on the learning graph').toBeDefined();
  await page.mouse.click(point!.x, point!.y);
  await expect(learning.locator(`iframe[title="${title} 文档"]`)).toBeVisible();
}

test('opens on recent workspaces with native open/create commands, not a mode chooser', async ({ page }) => {
  await seedRecentWorkspace(page);
  await page.goto('/');
  const launch = page.getByLabel('打开工作区');
  await expect(launch).toBeVisible();
  await expect(launch.getByRole('button', { name: /GUI fixture/ })).toBeVisible();
  await expect(launch.getByRole('button', { name: '新建工作区' })).toBeEnabled();
  await expect(launch.getByRole('button', { name: '打开文件夹…' })).toBeEnabled();
  await expect(page.getByRole('group', { name: '模式' })).toHaveCount(0);
  await expect(page.locator('[data-derivon-mode]')).toHaveCount(0);
});

test('preserves an unfinished draft across whole-window mode switches without saving it', async ({ page }) => {
  await openWorkspace(page);
  await openObjects(page);
  await createConcept(page, 'Vector space');
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
  const committed = commits;

  // The creation dialog is modal, so an unfinished draft that can outlive a mode switch
  // is a document draft: typed, not yet applied.
  const editor = page.getByLabel('Markdown 正文', { exact: true });
  await editor.fill('Unfinished');
  await page.getByRole('button', { name: '学习', exact: true }).click();
  await expect(page.locator('[data-derivon-mode="authoring"]')).toBeHidden();
  await expect(page.locator('[data-derivon-mode="learning"]')).toContainText('1 个概念');
  await expect(page.getByLabel('保存状态')).toContainText('未提交草稿');
  await page.waitForTimeout(1100);
  expect(commits).toBe(committed);
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await expect(editor).toContainText('Unfinished');
  await page.getByRole('button', { name: '放弃草稿', exact: true }).click();
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
});

for (const width of [1440, 390, 320]) {
  test(`creates and reopens a first concept with consistent unsaved learning preview at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '新建工作区', exact: true }).click();
    await expect(page.locator('[data-derivon-mode="authoring"]')).toBeVisible();
    if (width <= 700) {
      const relationHeight = () => page.locator('.authoring-context-pane').evaluate((element) => element.getBoundingClientRect().height);
      const agentHeight = () => page.locator('.authoring-agent-pane').evaluate((element) => element.getBoundingClientRect().height);
      await expect.poll(relationHeight).toBe(38);
      await expect.poll(agentHeight).toBe(38);
      await page.getByRole('button', { name: '展开上下文区', exact: true }).click();
      await expect.poll(relationHeight).toBe(118);
      await page.getByRole('button', { name: '收起上下文区', exact: true }).click();
      await expect.poll(relationHeight).toBe(38);
      await page.getByRole('button', { name: '展开 Agent', exact: true }).click();
      await expect.poll(agentHeight).toBe(260);
      await page.getByRole('button', { name: '收起 Agent', exact: true }).click();
      await expect.poll(agentHeight).toBe(38);
    }
    holdWrites = new Promise<void>((resolve) => { releaseWrites = resolve; });
    await openObjects(page);
    await createConcept(page, 'Vector space');
    expect(parseManifest(await readFile(path.join(directory, manifestPath), 'utf8')).graph.points).toEqual([]);
    const titleBounds = await page.getByLabel('名称', { exact: true }).boundingBox();
    expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(width);
    await expect(page.getByLabel('Markdown 正文', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('first-concept.png') });
    await page.getByRole('button', { name: '学习', exact: true }).click();
    const learning = page.locator('[data-derivon-mode="learning"]');
    await expect(learning).toContainText('1 个概念');
    // The learning side reads what authoring has in hand, still unsaved: pointing at the new
    // concept opens its document without anything having been committed.
    await openCarriedConceptDocument(page, 'Vector space');
    await learning.getByRole('button', { name: '这个我会', exact: true }).click();
    expect(commits).toBe(1); // Empty workspace initialization only.
    releaseWrites!();
    await expect(page.getByLabel('保存状态')).toHaveText('已保存');
    expect(commits).toBe(2);
    const manifest = parseManifest(await readFile(path.join(directory, manifestPath), 'utf8'));
    expect(manifest.graph.points[0].data.label).toBe('Vector space');
    expect(await readFile(path.join(directory, manifest.graph.points[0].data.document, 'document.md'), 'utf8')).toBe('');
    await expect(readFile(path.join(directory, manifest.graph.points[0].data.document, 'index.html'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '打开文件夹…', exact: true }).click();
    await expect(page.getByRole('button', { name: '图浏览', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
    const overviewPoint = await page.evaluate(findCanvasPixel, { clientCoordinates: true });
    expect(overviewPoint).toBeDefined();
    await page.mouse.click(overviewPoint!.x, overviewPoint!.y);
    await expect(page.getByRole('button', { name: '关联布局', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
    const selectedPoint = await page.evaluate(findCanvasPixel, { clientCoordinates: true, color: [147, 51, 234], center: true });
    const headPort = await page.evaluate(findCanvasPixel, { clientCoordinates: true, color: [164, 79, 63], center: true });
    const tailPort = await page.evaluate(findCanvasPixel, { clientCoordinates: true, color: [47, 112, 135], center: true });
    expect(headPort!.x).toBeLessThan(selectedPoint!.x);
    expect(tailPort!.x).toBeGreaterThan(selectedPoint!.x);
    await page.screenshot({ path: testInfo.outputPath('neighbourhood-card.png') });
    await page.mouse.click(selectedPoint!.x, selectedPoint!.y);
    await expect(page.getByRole('button', { name: '对象', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('搜索概念与推导文档').fill('Vector');
    await page.getByRole('option', { name: /Vector space/ }).click();
    await expect(page.getByLabel('名称', { exact: true })).toHaveValue('Vector space');
    await expect(page.getByLabel('Markdown 正文', { exact: true })).toBeVisible();
    expect(commits).toBe(2);
  });
}

test('warns before closing a protected draft and does not restore an explicitly discarded session', async ({ page }) => {
  await openWorkspace(page);
  await openObjects(page);
  await createConcept(page, 'Vector space');
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
  // The creation dialog is modal and covers the top bar, so the draft that reaches the
  // close guard is a document draft. Everything after this point must not commit.
  const committed = commits;
  const editor = page.getByLabel('Markdown 正文', { exact: true });
  await editor.fill('Discard this draft');

  page.once('dialog', (dialog) => { void dialog.dismiss(); });
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await expect(editor).toContainText('Discard this draft');

  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await page.getByRole('button', { name: '打开文件夹…', exact: true }).click();
  await openObjects(page);
  await page.getByLabel('搜索概念与推导文档').fill('Vector');
  await page.getByRole('option', { name: /Vector space/ }).click();
  await expect(page.getByLabel('Markdown 正文', { exact: true })).not.toContainText('Discard this draft');
  expect(commits).toBe(committed);
});

test('edits rich documents with protected drafts, atomic images, effective preview and reopen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openWorkspace(page);
  await openObjects(page);
  await createConcept(page, 'Vector space');
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
  const editor = page.getByLabel('Markdown 正文', { exact: true });
  await editor.fill('Draft body');
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: '粗体', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Draft body');
  await page.getByRole('button', { name: '编辑器撤回', exact: true }).click();
  await expect(editor.locator('strong')).toHaveCount(0);
  await page.getByRole('button', { name: '编辑器重做', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Draft body');
  await expect(editor).toBeFocused();
  await page.getByLabel('Agent 消息').fill('检查文档的前提');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Agent 对话' })).toContainText('检查文档的前提');
  await page.getByRole('button', { name: '图浏览', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '收起 Agent', exact: true }).click();
  await page.getByRole('button', { name: '对象', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Draft body');
  await page.getByRole('button', { name: '展开 Agent', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Agent 对话' })).toContainText('检查文档的前提');
  for (const name of ['斜体', '删除线', '行内代码', '代码块', '插入链接', '引用对象', '插入图片', '引用', '无序列表', '有序列表', '任务清单', '分隔线', '插入表格', '插入行内公式', '插入块级公式', '插入 HTML 交互示例']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await editor.click();
  await editor.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await editor.press('Enter');
  await page.getByRole('button', { name: '插入行内公式', exact: true }).click();
  await expect(editor.locator('.katex').first()).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor.locator('strong')).toHaveText('Draft body');
  await editor.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await editor.press('Enter');
  await page.getByRole('button', { name: '插入表格', exact: true }).click();
  await expect(editor.locator('table')).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor.locator('strong')).toHaveText('Draft body');
  await editor.press('ArrowRight');
  await editor.press('ArrowDown');
  await editor.press('Enter');
  await editor.evaluate(async (element) => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40;
    const context = canvas.getContext('2d')!; context.fillStyle = '#18705e'; context.fillRect(0, 0, 80, 40);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'));
    const data = new DataTransfer(); data.items.add(new File([blob], 'green.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });
  await expect(editor.locator('img[src^="blob:"]')).toBeVisible();
  await page.getByRole('button', { name: '学习', exact: true }).click();
  await openCarriedConceptDocument(page, 'Vector space');
  await expect(page.frameLocator('iframe[title="Vector space 文档"]').locator('body')).not.toContainText('Draft body');
  await expect(page.getByLabel('保存状态')).toContainText('未提交草稿');
  expect(commits).toBe(1);
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await expect(editor.locator('img[src^="blob:"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rich-editor.png') });
  holdWrites = new Promise<void>((resolve) => { releaseWrites = resolve; });
  await page.getByRole('button', { name: '应用修改', exact: true }).click();
  await page.getByRole('button', { name: '学习', exact: true }).click();
  await openCarriedConceptDocument(page, 'Vector space');
  const preview = page.frameLocator('iframe[title="Vector space 文档"]');
  await expect(preview.locator('body')).toContainText('Draft body');
  await expect(preview.locator('img[src^="data:image/"]')).toBeVisible();
  await expect.poll(() => preview.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 80)).toBe(true);
  expect(commits).toBe(1);
  releaseWrites!();
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
  const manifest = parseManifest(await readFile(path.join(directory, manifestPath), 'utf8'));
  const documentDirectory = manifest.graph.points[0].data.document;
  const markdown = await readFile(path.join(directory, documentDirectory, 'document.md'), 'utf8');
  expect(markdown).toContain('**Draft body**');
  expect(markdown).toContain('E = mc^2');
  const imageName = markdown.match(/assets\/(\S+\.png)/)![1];
  expect((await readFile(path.join(directory, documentDirectory, 'assets', imageName))).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '打开文件夹…', exact: true }).click();
  await page.getByRole('button', { name: '对象', exact: true }).click();
  await page.getByLabel('搜索概念与推导文档').fill('Draft body');
  await page.getByRole('option', { name: /Vector space/ }).click();
  await expect(editor.locator('p > strong').first()).toHaveText('Draft body');
  await expect(editor.locator('table')).toBeVisible();
  await expect(editor.locator('img[src^="blob:"]')).toBeVisible();
  expect(commits).toBe(2);
});

test('retains Markdown object references and renders inline HTML without persisting HTML files', async ({ page }) => {
  await seedRecentWorkspace(page);
  const graph = JSON.parse(emptyGraph);
  graph.graph.points = [
    { id: 'markdown', data: { label: 'Markdown concept', document: 'docs/markdown' } },
    { id: 'html', data: { label: 'HTML concept', document: 'docs/html' } },
  ];
  await writeFile(path.join(directory, manifestPath), JSON.stringify(graph));
  await mkdir(path.join(directory, 'docs/markdown'), { recursive: true });
  await mkdir(path.join(directory, 'docs/html'), { recursive: true });
  await writeFile(path.join(directory, 'docs/markdown/document.md'), 'Start');
  await writeFile(path.join(directory, 'docs/html/document.md'), '<p>HTML entry</p>');
  await page.goto('/');
  await page.getByRole('button', { name: /GUI fixture/ }).click();
  await page.getByRole('button', { name: '对象', exact: true }).click();
  await page.getByLabel('搜索概念与推导文档').fill('Markdown concept');
  await page.getByRole('option', { name: /Markdown concept/ }).click();
  const editor = page.getByLabel('Markdown 正文', { exact: true });
  await editor.click();
  await page.getByRole('button', { name: '引用对象', exact: true }).click();
  await page.getByLabel('搜索引用对象').fill('HTML concept');
  await page.getByRole('option', { name: /HTML concept/ }).click();
  const reference = editor.getByRole('link', { name: 'HTML concept', exact: true });
  await expect(reference).toHaveAttribute('href', '../html/document.md');
  await expect(editor).toBeFocused();
  await reference.click({ modifiers: ['ControlOrMeta'] });
  await page.getByRole('button', { name: '源文档', exact: true }).click();
  await expect(page.getByLabel('文档源码')).toHaveValue('<p>HTML entry</p>');
  await page.getByLabel('文档源码').fill('<h1>Edited HTML</h1><button id="count">0</button><script>document.querySelector("button").onclick = e => e.target.textContent = "1"</script>');
  await page.getByRole('button', { name: '预览文档', exact: true }).click();
  const preview = page.frameLocator('iframe[title="HTML concept 文档预览"]');
  await preview.getByRole('button', { name: '0', exact: true }).click();
  await expect(preview.getByRole('button', { name: '1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '应用修改', exact: true }).click();
  await page.getByLabel('搜索概念与推导文档').fill('Markdown concept');
  await page.getByRole('option', { name: /Markdown concept/ }).click();
  await expect(reference).toBeVisible();
  await editor.click();
  await editor.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
  await editor.press('Enter');
  await page.getByRole('button', { name: '插入 HTML 交互示例', exact: true }).click();
  const widget = page.frameLocator('.raw-html-block iframe');
  await expect(widget.getByLabel('变化强度')).toHaveValue('64');
  await widget.getByLabel('变化强度').evaluate((element: HTMLInputElement) => { element.value = '20'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(widget.locator('#demo-output')).toHaveText('20');
  await page.getByRole('button', { name: '应用修改', exact: true }).click();
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
  expect(await readFile(path.join(directory, 'docs/markdown/document.md'), 'utf8')).toContain('../html/document.md');
  expect(await readFile(path.join(directory, 'docs/markdown/document.md'), 'utf8')).toContain('demo-level');
  expect(await readFile(path.join(directory, 'docs/html/document.md'), 'utf8')).toContain('Edited HTML');
  await expect(readFile(path.join(directory, 'docs/html/index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(readFile(path.join(directory, 'docs/markdown/index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('announces interactive on the desktop launch frame', async ({ page }) => {
  await collectHooks(page);
  await page.goto('/');
  await expect(page.getByLabel('打开工作区')).toBeVisible();
  await expect.poll(async () => (await collectedHooks(page)).filter((hook) => hook.kind === 'interactive').length).toBe(1);
});

test('opens the model menu without covering or restyling the rest of the window', async ({ page }) => {
  // Regression: the menu used to lay a full-window <button> over the application to catch
  // the dismissing click. The authoring mode blanket-styles its own buttons, so that
  // overlay was painted as one window-sized button — white, then green on hover — and it
  // also made every other control inert while the menu was open.
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedRecentWorkspace(page);
  await page.goto('/');
  await page.getByRole('button', { name: /GUI fixture/ }).click();
  await expect(page.locator('[data-derivon-mode="authoring"]')).toBeVisible();
  const modelButton = page.getByRole('button', { name: /Claude Opus 5/ });
  await expect(modelButton).toBeVisible();

  const topBar = { x: 0, y: 0, width: 700, height: 110 };
  const before = await page.screenshot({ clip: topBar });
  await modelButton.click();
  await expect(page.getByRole('textbox', { name: '搜索模型' })).toBeVisible();

  expect(await page.screenshot({ clip: topBar })).toEqual(before);
  const atTopBar = await page.evaluate(() =>
    document.elementFromPoint(120, 27)?.closest('[data-shared-pane]') !== null);
  expect(atTopBar, 'the agent pane reaches outside itself while the menu is open').toBe(false);

  // The mode's control skin stops at the shared pane: its list entries stay flat.
  const listEntry = await page.getByRole('button', { name: /GPT-5/ }).evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderTopWidth, background: style.backgroundColor };
  });
  expect(listEntry).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)' });

  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: '搜索模型' })).toHaveCount(0);
});

test('roots the agent at the workspace the application has open', async ({ page }) => {
  await openWorkspace(page);
  await expect
    .poll(() => conversationCommands.filter((entry) => entry.command === 'conversation_set_workspace'))
    .toContainEqual({ command: 'conversation_set_workspace', args: { path: directory } });

  // Closing the workspace leaves the agent rooted nowhere rather than at a folder the
  // user has just left.
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await expect
    .poll(() => conversationCommands.filter((entry) => entry.command === 'conversation_set_workspace'))
    .toContainEqual({ command: 'conversation_set_workspace', args: { path: null } });
});
