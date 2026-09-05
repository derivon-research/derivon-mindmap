import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { RECENT_WORKSPACES_KEY } from '../src/hosts/desktop/recentWorkspaces';
import { parseDocument } from '../src/domain';
import { findCanvasPixel } from '../src/testing/canvasPixels';
import { collectHooks, collectedHooks } from './hookProbe';

let directory: string;
let commits: number;
let holdWrites: Promise<void> | undefined;
let releaseWrites: (() => void) | undefined;
let writesInFlight: Promise<void>[];
const manifestPath = '.derivon/workspace.json';
const emptyGraph = JSON.stringify({
  schema: 'derivon.authoring/v0.3.0', document: { title: 'GUI fixture', description: '' },
  graph: { points: [], hyperedges: [] }, view: { replacements: [] },
});

test.beforeEach(async ({ page }) => {
  directory = await mkdtemp(path.join(tmpdir(), 'derivon-gui-'));
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
    if (command === 'choose_workspace_source_directory') return { path: directory, name: path.basename(directory) };
    if (args?.rootPath !== directory) throw new Error('Unexpected fixture root');
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
      })();
      writesInFlight.push(write);
      return write;
    }
    throw new Error(`Unexpected native command: ${command}`);
  });
  await page.addInitScript(() => {
    const runtime = window as unknown as { __nativeWorkspaceInvoke: (command: string, args?: unknown) => Promise<unknown> };
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: runtime.__nativeWorkspaceInvoke } });
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
  await page.getByLabel('名称', { exact: true }).fill('Unfinished');
  await page.getByRole('button', { name: '学习', exact: true }).click();
  await expect(page.locator('[data-derivon-mode="authoring"]')).toBeHidden();
  await expect(page.locator('[data-derivon-mode="learning"]')).toContainText('0 个概念');
  await expect(page.getByLabel('保存状态')).toContainText('未提交草稿');
  await page.waitForTimeout(1100);
  expect(commits).toBe(0);
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('Unfinished');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
});

for (const width of [1440, 390, 320]) {
  test(`creates and reopens a first concept with consistent unsaved learning preview at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: '新建工作区', exact: true }).click();
    await expect(page.locator('[data-derivon-mode="authoring"]')).toBeVisible();
    holdWrites = new Promise<void>((resolve) => { releaseWrites = resolve; });
    await page.getByLabel('名称', { exact: true }).fill('Vector space');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vector space', exact: true })).toBeVisible();
    expect(parseDocument(await readFile(path.join(directory, manifestPath), 'utf8')).graph.points).toEqual([]);
    const titleBounds = await page.getByRole('heading', { name: 'Vector space', exact: true }).boundingBox();
    expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath('first-concept.png') });
    await page.getByRole('button', { name: '学习', exact: true }).click();
    const learning = page.locator('[data-derivon-mode="learning"]');
    await expect(learning).toContainText('1 个概念');
    await expect(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');
    expect(await page.evaluate(findCanvasPixel, { clientCoordinates: true })).toBeDefined();
    await expect(learning.locator('iframe[title="Vector space 文档"]')).toBeVisible();
    await learning.getByRole('button', { name: '取消目标', exact: true }).click();
    expect(commits).toBe(1); // Empty workspace initialization only.
    releaseWrites!();
    await expect(page.getByLabel('保存状态')).toHaveText('已保存');
    expect(commits).toBe(2);
    const manifest = parseDocument(await readFile(path.join(directory, manifestPath), 'utf8'));
    expect(manifest.graph.points[0].data.label).toBe('Vector space');
    expect(await readFile(path.join(directory, manifest.graph.points[0].data.document, 'document.md'), 'utf8')).toBe('');
    expect(await readFile(path.join(directory, manifest.graph.points[0].data.document, 'index.html'), 'utf8')).toContain('<title>Vector space</title>');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '打开文件夹…', exact: true }).click();
    await page.getByLabel('搜索概念与推导文档').fill('Vector');
    await page.getByRole('option', { name: /Vector space/ }).click();
    await expect(page.getByRole('heading', { name: 'Vector space', exact: true })).toBeVisible();
    await expect(page.getByLabel('Markdown 正文', { exact: true })).toBeVisible();
    expect(commits).toBe(2);
  });
}

test('warns before closing a protected draft and does not restore an explicitly discarded session', async ({ page }) => {
  await openWorkspace(page);
  await page.getByLabel('名称', { exact: true }).fill('Discard this draft');
  page.once('dialog', (dialog) => { void dialog.dismiss(); });
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('Discard this draft');
  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await page.getByRole('button', { name: '打开文件夹…', exact: true }).click();
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('');
  expect(commits).toBe(0);
});

test('edits rich documents with protected drafts, atomic images, effective preview and reopen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openWorkspace(page);
  await page.getByLabel('名称', { exact: true }).fill('Vector space');
  await page.getByRole('button', { name: '创建', exact: true }).click();
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
  await expect(page.getByRole('log', { name: 'Agent 对话' })).toContainText('模拟计划');
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
  await expect(page.frameLocator('iframe[title="Vector space 文档"]').locator('body')).not.toContainText('Draft body');
  await expect(page.getByLabel('保存状态')).toContainText('未提交草稿');
  expect(commits).toBe(1);
  await page.getByRole('button', { name: '创作', exact: true }).click();
  await expect(editor.locator('img[src^="blob:"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rich-editor.png') });
  holdWrites = new Promise<void>((resolve) => { releaseWrites = resolve; });
  await page.getByRole('button', { name: '应用修改', exact: true }).click();
  await page.getByRole('button', { name: '学习', exact: true }).click();
  const preview = page.frameLocator('iframe[title="Vector space 文档"]');
  await expect(preview.locator('body')).toContainText('Draft body');
  await expect(preview.locator('img[src^="data:image/"]')).toBeVisible();
  await expect.poll(() => preview.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 80)).toBe(true);
  expect(commits).toBe(1);
  releaseWrites!();
  await expect(page.getByLabel('保存状态')).toHaveText('已保存');
  const manifest = parseDocument(await readFile(path.join(directory, manifestPath), 'utf8'));
  const documentDirectory = manifest.graph.points[0].data.document;
  const markdown = await readFile(path.join(directory, documentDirectory, 'document.md'), 'utf8');
  expect(markdown).toContain('**Draft body**');
  expect(markdown).toContain('E = mc^2');
  const imageName = markdown.match(/assets\/(\S+\.png)/)![1];
  expect((await readFile(path.join(directory, documentDirectory, 'assets', imageName))).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '打开文件夹…', exact: true }).click();
  await page.getByLabel('搜索概念与推导文档').fill('Draft body');
  await page.getByRole('option', { name: /Vector space/ }).click();
  await expect(editor.locator('p > strong').first()).toHaveText('Draft body');
  await expect(editor.locator('table')).toBeVisible();
  await expect(editor.locator('img[src^="blob:"]')).toBeVisible();
  expect(commits).toBe(2);
});

test('retains object references, HTML source editing and interactive Markdown widgets', async ({ page }) => {
  await seedRecentWorkspace(page);
  const graph = JSON.parse(emptyGraph);
  graph.graph.points = [
    { id: 'markdown', data: { label: 'Markdown concept', document: 'docs/markdown', format: 'markdown' } },
    { id: 'html', data: { label: 'HTML concept', document: 'docs/html', format: 'html' } },
  ];
  await writeFile(path.join(directory, manifestPath), JSON.stringify(graph));
  await mkdir(path.join(directory, 'docs/markdown'), { recursive: true });
  await mkdir(path.join(directory, 'docs/html'), { recursive: true });
  await writeFile(path.join(directory, 'docs/markdown/document.md'), 'Start');
  await writeFile(path.join(directory, 'docs/markdown/index.html'), '<p>Start</p>');
  await writeFile(path.join(directory, 'docs/html/index.html'), '<p>HTML entry</p>');
  await page.goto('/');
  await page.getByRole('button', { name: /GUI fixture/ }).click();
  await page.getByLabel('搜索概念与推导文档').fill('Markdown concept');
  await page.getByRole('option', { name: /Markdown concept/ }).click();
  const editor = page.getByLabel('Markdown 正文', { exact: true });
  await editor.click();
  await page.getByRole('button', { name: '引用对象', exact: true }).click();
  await page.getByLabel('搜索引用对象').fill('HTML concept');
  await page.getByRole('option', { name: /HTML concept/ }).click();
  const reference = editor.getByRole('link', { name: 'HTML concept', exact: true });
  await expect(reference).toHaveAttribute('href', '../html/index.html');
  await expect(editor).toBeFocused();
  await reference.click({ modifiers: ['ControlOrMeta'] });
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
  expect(await readFile(path.join(directory, 'docs/markdown/document.md'), 'utf8')).toContain('../html/index.html');
  expect(await readFile(path.join(directory, 'docs/markdown/document.md'), 'utf8')).toContain('demo-level');
  expect(await readFile(path.join(directory, 'docs/html/index.html'), 'utf8')).toContain('Edited HTML');
});

test('announces interactive on the desktop launch frame', async ({ page }) => {
  await collectHooks(page);
  await page.goto('/');
  await expect(page.getByLabel('打开工作区')).toBeVisible();
  await expect.poll(async () => (await collectedHooks(page)).filter((hook) => hook.kind === 'interactive').length).toBe(1);
});
