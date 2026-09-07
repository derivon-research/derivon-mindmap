import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringCommands } from '../../synchronization';
import {
  WORKSPACE_SCHEMA, parseWorkspaceContent, referenceImpact, type TextResource, type WorkspaceContent,
} from '../../workspace/index';
import { AuthoringDocumentEditor } from './AuthoringDocumentEditor';
import { DocumentReferences } from './DocumentIntegrity';

const graph = JSON.stringify({
  schema: WORKSPACE_SCHEMA, document: { title: 'T', description: '' }, tags: [],
  graph: {
    points: [
      { id: 'c-a', data: { label: '数域', document: 'docs/concept-a' } },
      { id: 'c-b', data: { label: '向量空间', document: 'docs/concept-b' } },
    ],
    hyperedges: [],
  },
});
const bodyA = ['[看向量空间](../concept-b/document.md)', '![共享图](../concept-b/assets/shared.png)'].join('\n\n');
const content = (documents: Record<string, TextResource>): WorkspaceContent => parseWorkspaceContent({ graph, documents });
const linked = (bodyOfA = bodyA) => content({
  'docs/concept-a/document.md': { status: 'ready', text: bodyOfA },
  'docs/concept-b/document.md': { status: 'ready', text: '# 向量空间' },
});

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(async () => {
  await page.viewport(900, 900);
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

function commands(overrides: Partial<AuthoringCommands> = {}): AuthoringCommands {
  return {
    createConcept: vi.fn(() => ''), createDerivation: vi.fn(() => ''), updateDocument: vi.fn(),
    repairReferences: vi.fn(), restoreDocument: vi.fn(), referenceImpact: vi.fn(async () => { throw new Error('未接入'); }),
    updateObjectMetadata: vi.fn(), updateDerivationStructure: vi.fn(), updateConceptTags: vi.fn(), updateTagDeclarations: vi.fn(),
    updateOrientation: vi.fn(), protectDraft: vi.fn(), ...overrides,
  };
}

function renderPanel(workspace: WorkspaceContent, authoring: AuthoringCommands, blocked?: string) {
  const source = workspace.documents['docs/concept-b/document.md'];
  root = createRoot(container);
  act(() => root?.render(<DocumentReferences content={workspace} object={{ kind: 'concept', id: 'c-b' }}
    sourcePath="docs/concept-b/document.md" source={source?.status === 'ready' ? source.text : ''}
    authoring={authoring} blocked={blocked} />));
}

it('reports the cross-document link and the shared image a deletion would break', async () => {
  const workspace = linked();
  const authoring = commands({ referenceImpact: vi.fn(async (plan) => referenceImpact(workspace, plan)) });
  renderPanel(workspace, authoring);
  await page.getByRole('button', { name: '引用影响' }).click();

  const incoming = page.getByRole('list', { name: '其它文档中的引用' });
  await expect.element(incoming.getByText('跨文档链接')).toBeInTheDocument();
  await expect.element(incoming.getByText('共享图片')).toBeInTheDocument();
  expect(container.textContent).toContain('已读取全部引用来源');
  expect(authoring.referenceImpact).toHaveBeenCalledWith({ conceptIds: ['c-b'] });
});

it('will not call a deletion safe when a reference source could not be read', async () => {
  const workspace = content({
    'docs/concept-a/document.md': { status: 'error', message: 'Permission denied' },
    'docs/concept-b/document.md': { status: 'ready', text: '# 向量空间' },
  });
  renderPanel(workspace, commands({ referenceImpact: vi.fn(async (plan) => referenceImpact(workspace, plan)) }));
  await page.getByRole('button', { name: '引用影响' }).click();

  await expect.element(page.getByRole('list', { name: '无法读取的引用来源' }).getByText('Permission denied')).toBeInTheDocument();
  expect(container.textContent).toContain('不能认定删除是安全的');
});

it('confirms a repair in the document that carries the reference, and cancels without writing', async () => {
  const workspace = linked();
  const impact = referenceImpact(workspace, { conceptIds: ['c-b'] });
  const authoring = commands({ referenceImpact: vi.fn(async () => impact) });
  renderPanel(workspace, authoring);
  await page.getByRole('button', { name: '引用影响' }).click();

  await page.getByRole('button', { name: '取消链接 ../concept-b/document.md' }).click();
  expect(container.textContent).toContain('链接会变成它原来的文字');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(authoring.repairReferences).not.toHaveBeenCalled();

  await page.getByRole('button', { name: '取消链接 ../concept-b/document.md' }).click();
  await page.getByRole('button', { name: '确认修正' }).click();
  expect(authoring.repairReferences).toHaveBeenCalledWith({
    object: { kind: 'concept', id: 'c-a' },
    repairs: [{ at: impact.incoming[0].reference.at, action: 'unlink' }],
  });
});

it('removes a shared image only as its own decision, never as part of the link repair', async () => {
  const workspace = linked();
  const impact = referenceImpact(workspace, { conceptIds: ['c-b'] });
  const authoring = commands({ referenceImpact: vi.fn(async () => impact) });
  renderPanel(workspace, authoring);
  await page.getByRole('button', { name: '引用影响' }).click();

  // An image has no text to fall back to, so it is not offered an unlink at all.
  await expect.element(page.getByRole('button', { name: '取消链接 ../concept-b/assets/shared.png' })).not.toBeInTheDocument();
  await page.getByRole('button', { name: '删除引用 ../concept-b/assets/shared.png' }).click();
  expect(container.textContent).toContain('这张图片会从这份文档里去掉');
  await page.getByRole('button', { name: '确认修正' }).click();
  expect(authoring.repairReferences).toHaveBeenCalledWith({
    object: { kind: 'concept', id: 'c-a' },
    repairs: [{ at: impact.incoming[1].reference.at, action: 'remove' }],
  });
});

it("lists a document's own broken links, and stops listing them once they are repaired", async () => {
  const broken = content({ 'docs/concept-b/document.md': { status: 'ready', text: '[没了](../concept-gone/document.md)' } });
  renderPanel(broken, commands());
  await expect.element(page.getByRole('list', { name: '无法解析的引用' })).toBeInTheDocument();
  expect(container.textContent).toContain('指向不存在的对象');

  const repaired = content({ 'docs/concept-b/document.md': { status: 'ready', text: '[没了](../concept-a/document.md)' } });
  await act(async () => root?.render(<DocumentReferences content={repaired} object={{ kind: 'concept', id: 'c-b' }}
    sourcePath="docs/concept-b/document.md" source="[没了](../concept-a/document.md)" authoring={commands()} />));
  await expect.element(page.getByRole('list', { name: '无法解析的引用' })).not.toBeInTheDocument();
});

it('reports a computed reference source as unanalysable rather than as no reference', async () => {
  const scripted = content({ 'docs/concept-b/document.md': { status: 'ready', text: '<img src="{{ page.image }}">' } });
  renderPanel(scripted, commands());
  await expect.element(page.getByRole('list', { name: '无法分析的引用来源' })).toBeInTheDocument();
  expect(container.textContent).toContain('模板占位');
});

it('does not offer to repair references while an unapplied draft would be overwritten', async () => {
  const broken = content({ 'docs/concept-b/document.md': { status: 'ready', text: '[没了](../concept-gone/document.md)' } });
  renderPanel(broken, commands(), '先应用或放弃草稿');
  expect(container.textContent).toContain('先应用或放弃草稿');
  await expect.element(page.getByRole('button', { name: '取消链接 ../concept-gone/document.md' })).not.toBeInTheDocument();
});

it('repairs a damaged object document only when asked, and never on opening it', async () => {
  const damaged = content({ 'docs/concept-b/document.md': { status: 'error', message: '文件不存在' } });
  const authoring = commands();
  root = createRoot(container);
  act(() => root?.render(<AuthoringDocumentEditor object={{ kind: 'concept', id: 'c-b' }} content={damaged}
    authoring={authoring} drafts={new Map()} onOpenObject={vi.fn()} />));

  await expect.element(page.getByRole('alert', { name: '对象文档修复' })).toBeInTheDocument();
  expect(container.textContent).toContain('文件不存在');
  expect(authoring.restoreDocument).not.toHaveBeenCalled();

  await page.getByRole('button', { name: '创建空文档' }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(authoring.restoreDocument).not.toHaveBeenCalled();

  await page.getByRole('button', { name: '创建空文档' }).click();
  await page.getByRole('button', { name: '确认创建空文档' }).click();
  expect(authoring.restoreDocument).toHaveBeenCalledWith({ object: { kind: 'concept', id: 'c-b' }, overwriteDamaged: false });
});

it('keeps overwriting an unreadable document a separate, confirmed decision', async () => {
  const damaged = content({ 'docs/concept-b/document.md': { status: 'error', message: 'Permission denied' } });
  const authoring = commands({ restoreDocument: vi.fn((intent) => { if (!intent.overwriteDamaged) throw new Error('文件已存在'); }) });
  root = createRoot(container);
  act(() => root?.render(<AuthoringDocumentEditor object={{ kind: 'concept', id: 'c-b' }} content={damaged}
    authoring={authoring} drafts={new Map()} onOpenObject={vi.fn()} />));

  await page.getByRole('button', { name: '创建空文档' }).click();
  await page.getByRole('button', { name: '确认创建空文档' }).click();
  expect(container.textContent).toContain('文件已存在');

  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '覆盖损坏的文档' }).click();
  expect(container.textContent).toContain('它当前的内容不会被找回');
  await page.getByRole('button', { name: '确认覆盖' }).click();
  expect(authoring.restoreDocument).toHaveBeenLastCalledWith({ object: { kind: 'concept', id: 'c-b' }, overwriteDamaged: true });
});
