import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringCommands, DeletionPreview } from '../../synchronization';
import {
  ORIENTATION_SCHEMA, WORKSPACE_SCHEMA, parseWorkspaceContent, referenceImpact,
  type TextResource, type WorkspaceContent,
} from '../../workspace/index';
import { DeleteObject } from './DeleteObject';
import { fakeAuthoringCommands } from '../../testing/authoringCommands';

const graph = JSON.stringify({
  schema: WORKSPACE_SCHEMA, document: { title: 'T', description: '' }, tags: [],
  graph: {
    points: [
      { id: 'c-a', data: { label: '数域', document: 'docs/concept-a' } },
      { id: 'c-b', data: { label: '向量空间', document: 'docs/concept-b' } },
    ],
    hyperedges: [{ id: 'h-1', weight: 2, tails: ['c-a'], head: 'c-b', data: { document: 'docs/derivation-1' } }],
  },
});
const bodyA = ['[看向量空间](../concept-b/document.md)', '![共享图](../concept-b/assets/shared.png)'].join('\n\n');
const content = (documents: Record<string, TextResource>, companion?: Record<string, TextResource | null>): WorkspaceContent =>
  parseWorkspaceContent({ graph, documents, companionMetadata: companion });
const linked = (companion?: Record<string, TextResource | null>) => content({
  'docs/concept-a/document.md': { status: 'ready', text: bodyA },
  'docs/concept-b/document.md': { status: 'ready', text: '# 向量空间' },
  'docs/derivation-1/document.md': { status: 'ready', text: '# 推导' },
}, companion);

/** The host inventory, including an asset the document text no longer mentions. */
const ownedFiles = {
  'docs/concept-b': ['docs/concept-b/assets/never-mentioned.png', 'docs/concept-b/assets/shared.png', 'docs/concept-b/document.md'],
  'docs/derivation-1': ['docs/derivation-1/document.md'],
};

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(async () => {
  await page.viewport(900, 1000);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(workspace: WorkspaceContent, authoring: AuthoringCommands, onDeleted = vi.fn(), blocked?: string) {
  root = createRoot(container);
  act(() => root?.render(<DeleteObject content={workspace} object={{ kind: 'concept', id: 'c-b' }}
    authoring={authoring} open onOpen={vi.fn()} onClose={vi.fn()} onDeleted={onDeleted} blocked={blocked} />));
  return onDeleted;
}

function commands(preview: () => DeletionPreview, overrides: Partial<AuthoringCommands> = {}): AuthoringCommands {
  return fakeAuthoringCommands({ deletionPreview: vi.fn(async () => preview()), ...overrides });
}

it('names the derivations, the owned documents and the assets no body mentions', async () => {
  const workspace = linked();
  render(workspace, commands(() => ({ impact: referenceImpact(workspace, { conceptIds: ['c-b'] }), ownedFiles })));

  await expect.element(page.getByRole('region', { name: '会被删除的对象' })).toBeInTheDocument();
  const removed = page.getByRole('region', { name: '会被删除的对象' });
  await expect.element(removed.getByText('数域 → 向量空间')).toBeInTheDocument();
  expect(container.textContent).toContain('少了这个端点就不成立');

  const files = page.getByRole('region', { name: '连同删除的文件' });
  await expect.element(files.getByText('docs/concept-b/assets/never-mentioned.png')).toBeInTheDocument();
  await expect.element(files.getByText('docs/derivation-1/document.md')).toBeInTheDocument();
  expect(container.textContent).toContain('这份清单来自宿主，不是正文扫描');
  expect(container.textContent).toContain('别的对象目录、工作区里其它文件和外部地址都不在这份清单里');
});

it('will not delete until every incoming reference has a chosen repair, then sends them as one plan', async () => {
  const workspace = linked();
  const impact = referenceImpact(workspace, { conceptIds: ['c-b'] });
  const authoring = commands(() => ({ impact, ownedFiles }));
  const onDeleted = render(workspace, authoring);

  await expect.element(page.getByRole('region', { name: '指向它的引用' })).toBeInTheDocument();
  expect(container.textContent).toContain('还有 2 处引用指向要删的内容');
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeDisabled();

  await page.getByRole('button', { name: '取消链接 ../concept-b/document.md' }).click();
  await page.getByRole('button', { name: '纳入方案' }).click();
  expect(container.textContent).toContain('已纳入方案：取消链接');
  expect(authoring.repairReferences).not.toHaveBeenCalled();

  await page.getByRole('button', { name: '删除引用 ../concept-b/assets/shared.png' }).click();
  await page.getByRole('button', { name: '纳入方案' }).click();
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeEnabled();

  await page.getByRole('button', { name: '执行完整删除方案' }).click();
  expect(container.textContent).toContain('不留孤儿文件');
  await page.getByRole('button', { name: '确认删除「向量空间」' }).click();

  expect(authoring.deleteObjects).toHaveBeenCalledWith({
    plan: { conceptIds: ['c-b'] },
    repairs: [{ object: { kind: 'concept', id: 'c-a' }, repairs: [
      { at: impact.incoming[0].reference.at, action: 'unlink' },
      { at: impact.incoming[1].reference.at, action: 'remove' },
    ] }],
  });
  expect(onDeleted).toHaveBeenCalled();
});

it('refuses to call a deletion safe when a reference source could not be read', async () => {
  const workspace = content({
    'docs/concept-a/document.md': { status: 'error', message: 'Permission denied' },
    'docs/concept-b/document.md': { status: 'ready', text: '' },
    'docs/derivation-1/document.md': { status: 'ready', text: '' },
  });
  const authoring = commands(() => ({ impact: referenceImpact(workspace, { conceptIds: ['c-b'] }), ownedFiles }));
  render(workspace, authoring);

  await expect.element(page.getByRole('region', { name: '无法分析的引用来源' })).toBeInTheDocument();
  expect(container.textContent).toContain('读不出来不等于没有引用');
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeDisabled();
  expect(authoring.deleteObjects).not.toHaveBeenCalled();
});

it('takes the concept out of the orientation configuration only as a confirmed part of the plan', async () => {
  const workspace = linked({ '.derivon/orientation.json': { status: 'ready', text: JSON.stringify({
    schema: ORIENTATION_SCHEMA, seed: { targets: ['c-b'], known: [] }, questions: [] }) } });
  const impact = referenceImpact(workspace, { conceptIds: ['c-b'] });
  const authoring = commands(() => ({ impact: { ...impact, incoming: [] }, ownedFiles }));
  render(workspace, authoring);

  await expect.element(page.getByRole('region', { name: '开局配置引用' })).toBeInTheDocument();
  expect(container.textContent).toContain('默认目标');
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeDisabled();

  await page.getByRole('button', { name: '一并从开局配置里去掉' }).click();
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeEnabled();
  await page.getByRole('button', { name: '执行完整删除方案' }).click();
  await page.getByRole('button', { name: '确认删除「向量空间」' }).click();
  expect(authoring.deleteObjects).toHaveBeenCalledWith({
    plan: { conceptIds: ['c-b'] }, repairs: [], repairOrientation: true,
  });
});

it('keeps the object and its management entry when the deletion fails', async () => {
  const workspace = content({
    'docs/concept-a/document.md': { status: 'ready', text: '' },
    'docs/concept-b/document.md': { status: 'ready', text: '' },
    'docs/derivation-1/document.md': { status: 'ready', text: '' },
  });
  const authoring = commands(() => ({ impact: referenceImpact(workspace, { conceptIds: ['c-b'] }), ownedFiles }),
    { deleteObjects: vi.fn(async () => { throw new Error('还没有取得「docs/derivation-1」的所属文件清单'); }) });
  const onDeleted = render(workspace, authoring);

  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeEnabled();
  await page.getByRole('button', { name: '执行完整删除方案' }).click();
  await page.getByRole('button', { name: '确认删除「向量空间」' }).click();
  await expect.element(page.getByRole('alert')).toBeInTheDocument();
  expect(container.textContent).toContain('所属文件清单');
  expect(onDeleted).not.toHaveBeenCalled();
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeInTheDocument();
});

it('does not repair or delete while an unapplied document draft would be overwritten', async () => {
  const workspace = linked();
  const authoring = commands(() => ({ impact: referenceImpact(workspace, { conceptIds: ['c-b'] }), ownedFiles }));
  render(workspace, authoring, vi.fn(), '先应用或放弃草稿');

  expect(container.textContent).toContain('先应用或放弃草稿');
  await expect.element(page.getByRole('button', { name: '取消链接 ../concept-b/document.md' })).not.toBeInTheDocument();
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeDisabled();
});
