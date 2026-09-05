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
const manifestPath = '.derivon/workspace.json';
const emptyGraph = JSON.stringify({
  schema: 'derivon.authoring/v0.3.0', document: { title: 'GUI fixture', description: '' },
  graph: { points: [], hyperedges: [] }, view: { replacements: [] },
});

test.beforeEach(async ({ page }) => {
  directory = await mkdtemp(path.join(tmpdir(), 'derivon-gui-'));
  commits = 0;
  holdWrites = undefined;
  releaseWrites = undefined;
  // Only the native IPC boundary is substituted. The real desktop host, content module,
  // synchronization and both modes run unchanged; persistence survives a browser reload.
  await page.exposeFunction('__nativeWorkspaceInvoke', async (command: string, args?: {
    rootPath: string; relativePath?: string;
    changes?: { graph?: string; createOnly?: boolean; documents: Array<{ path: string; content: string | null }> };
  }) => {
    if (command === 'choose_workspace_source_directory') return { path: directory, name: path.basename(directory) };
    if (args?.rootPath !== directory) throw new Error('Unexpected fixture root');
    if (command === 'read_workspace_source_graph') return readFile(path.join(directory, manifestPath), 'utf8');
    if (command === 'read_workspace_source_document') return readFile(path.join(directory, args.relativePath!), 'utf8');
    if (command === 'read_workspace_source_companion_metadata') {
      try { return await readFile(path.join(directory, args.relativePath!), 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    }
    if (command === 'commit_workspace_source_changes') {
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
      commits++;
      return;
    }
    throw new Error(`Unexpected native command: ${command}`);
  });
  await page.addInitScript(() => {
    const runtime = window as unknown as { __nativeWorkspaceInvoke: (command: string, args?: unknown) => Promise<unknown> };
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { invoke: runtime.__nativeWorkspaceInvoke } });
  });
});

test.afterEach(async () => {
  releaseWrites?.();
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
    await page.getByLabel('搜索概念').fill('Vector');
    await page.getByRole('option', { name: /Vector space/ }).click();
    await expect(page.getByRole('heading', { name: 'Vector space', exact: true })).toBeVisible();
    await expect(page.locator('iframe[title="Vector space 文档"]')).toBeVisible();
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

test('announces interactive on the desktop launch frame', async ({ page }) => {
  await collectHooks(page);
  await page.goto('/');
  await expect(page.getByLabel('打开工作区')).toBeVisible();
  await expect.poll(async () => (await collectedHooks(page)).filter((hook) => hook.kind === 'interactive').length).toBe(1);
});
