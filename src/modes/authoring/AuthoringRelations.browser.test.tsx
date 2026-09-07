import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { AuthoringCommands } from '../../synchronization';
import type { WorkspaceContent } from '../../workspace/index';
import { AuthoringMode } from './AuthoringMode';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view, onEvent }: GraphRendererProps) => <div>
  <output aria-label="Rendered edges">{view.hyperedges.map(({ id }) => id).join(' ')}</output>
  <output aria-label="Selected graph objects">{[...view.concepts, ...view.hyperedges].filter(({ marks }) => marks.includes('selected')).map(({ id }) => id).join(' ')}</output>
  {view.concepts.map(({ id }) => <span key={`concept:${id}`}><button onClick={() => onEvent({ type: 'select', object: { kind: 'concept', id } })}>画布概念 {id}</button><button onClick={() => onEvent({ type: 'activate', object: { kind: 'concept', id } })}>激活概念 {id}</button></span>)}
  {view.kind !== 'overview' && view.hyperedges.map(({ id }) => <span key={`derivation:${id}`}><button onClick={() => onEvent({ type: 'select', object: { kind: 'derivation', id } })}>画布推导 {id}</button><button onClick={() => onEvent({ type: 'activate', object: { kind: 'derivation', id } })}>激活推导 {id}</button></span>)}
</div> }));
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); });

it('opens the overview, selects neighbourhood objects, and opens the selected object on a repeated click', async () => {
  await page.viewport(1100, 800);
  const points = ['A', 'Focus', 'B'].map((id) => ({ id, data: { label: id, document: `docs/${id}` } }));
  const hyperedges = [
    { id: 'incoming', tails: ['A'], head: 'Focus' },
    { id: 'outgoing', tails: ['Focus'], head: 'B' },
    { id: 'unrelated', tails: ['A'], head: 'B' },
  ].map((edge) => ({ ...edge, weight: 1, data: { document: `docs/${edge.id}`, label: `推导 ${edge.id}` } }));
  const content: WorkspaceContent = { title: 'Relations', graphText: '', graph: { points, hyperedges },
    documents: Object.fromEntries([...points, ...hyperedges].flatMap((item) => [
      [`${item.data.document}/document.md`, { status: 'ready' as const, text: 'Body' }],
      [`${item.data.document}/index.html`, { status: 'ready' as const, text: '<p>Body</p>' }],
    ])),
    companionMetadata: {}, tags: [], orientation: { status: 'absent' }, diagnostics: [] };
  container = document.createElement('div'); container.style.cssText = 'width:1100px;height:700px'; document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<AuthoringMode workspace={{ id: 'test', name: 'Relations' }} content={content} selectedConceptId={null} onSelectConcept={vi.fn()} />));
  await expect.element(page.getByRole('button', { name: '图浏览', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '对象', exact: true }).click();
  await expect.element(page.getByRole('button', { name: '创建第一个概念', exact: true })).not.toBeInTheDocument();
  await page.getByRole('button', { name: '浏览全图', exact: true }).click();
  await page.getByRole('button', { name: '画布概念 Focus', exact: true }).click();
  await expect.element(page.getByRole('button', { name: '关联布局', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('iframe')).toBeNull();
  await expect.element(page.getByLabelText('Rendered edges')).toHaveTextContent('incoming outgoing');
  expect(page.getByLabelText('Rendered edges').element().textContent).not.toContain('unrelated');
  await page.getByRole('button', { name: '画布推导 outgoing', exact: true }).click();
  await expect.element(page.getByLabelText('Selected graph objects')).toHaveTextContent('outgoing');
  expect(container.querySelector('iframe')).toBeNull();
  expect(page.getByLabelText('Rendered edges').element().textContent).not.toContain('unrelated');
  await expect.element(page.getByRole('button', { name: '图浏览', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '画布推导 outgoing', exact: true }).click();
  expect(container.querySelector('.authoring-title-line')?.textContent).toBe('推导 outgoing');
  await expect.element(page.getByRole('heading', { name: '联合前提 1', exact: true })).toBeVisible();
  await expect.element(page.getByRole('heading', { name: '结果概念 1', exact: true })).toBeVisible();
  const relations = container.querySelector('.authoring-context-body')!;
  expect([...relations.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Focus', 'B']);
  const openedDocument = container.querySelector('iframe');
  expect(openedDocument?.title).toBe('推导 outgoing 文档');
  await page.getByRole('button', { name: '图浏览', exact: true }).click();
  await page.getByRole('button', { name: '画布概念 A', exact: true }).click();
  expect(container.querySelector('iframe')).toBe(openedDocument);
  expect(openedDocument?.title).toBe('推导 outgoing 文档');
  await expect.element(page.getByLabelText('Selected graph objects')).toHaveTextContent('A');
  await expect.element(page.getByRole('button', { name: '图浏览', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '画布概念 A', exact: true }).click();
  await expect.poll(() => container.querySelector('.authoring-title-line')?.textContent).toBe('A');
  await page.getByRole('button', { name: '图浏览', exact: true }).click();
  await page.getByRole('button', { name: '推导 unrelated', exact: true }).click();
  await expect.poll(() => container.querySelector('.authoring-title-line')?.textContent).toBe('推导 unrelated');
  await page.getByRole('button', { name: '图浏览', exact: true }).click();
  await expect.element(page.getByLabelText('Rendered edges')).toHaveTextContent('incoming unrelated');
  expect(page.getByLabelText('Rendered edges').element().textContent).not.toContain('outgoing');
  await page.getByRole('button', { name: '全图', exact: true }).click();
  await page.getByRole('button', { name: '激活概念 B', exact: true }).click();
  await expect.poll(() => container.querySelector('.authoring-title-line')?.textContent).toBe('B');
  await page.getByRole('button', { name: '图浏览', exact: true }).click();
  await page.getByRole('button', { name: '画布概念 Focus', exact: true }).click();
  await page.getByRole('button', { name: '激活推导 incoming', exact: true }).click();
  await expect.poll(() => container.querySelector('.authoring-title-line')?.textContent).toBe('推导 incoming');
});

// --------------------------------------------------------------- structure editing

/** A + B → C, so a premise can be dropped, added and swapped from one fixture. */
function structureContent(): WorkspaceContent {
  const points = ['A', 'B', 'C'].map((id) => ({ id, data: { label: id, document: `docs/${id}` } }));
  const hyperedges = [{ id: 'edge', tails: ['A', 'B'], head: 'C', weight: 2, data: { document: 'docs/edge' } }];
  return { title: 'Structure', graphText: '', graph: { points, hyperedges },
    documents: Object.fromEntries([...points, ...hyperedges].map((item) =>
      [`${item.data.document}/document.md`, { status: 'ready' as const, text: 'Body' }])),
    companionMetadata: {}, tags: [], orientation: { status: 'absent' }, diagnostics: [] };
}

function commands(overrides: Partial<AuthoringCommands> = {}): AuthoringCommands {
  return {
    createConcept: vi.fn(() => ''), createDerivation: vi.fn(() => ''), updateDocument: vi.fn(),
    repairReferences: vi.fn(), restoreDocument: vi.fn(), referenceImpact: vi.fn(),
    updateObjectMetadata: vi.fn(), updateDerivationStructure: vi.fn(), updateConceptTags: vi.fn(),
    updateTagDeclarations: vi.fn(), updateOrientation: vi.fn(), protectDraft: vi.fn(), ...overrides,
  };
}

async function renderStructure(authoring?: AuthoringCommands) {
  await page.viewport(1100, 800);
  container = document.createElement('div'); container.style.cssText = 'width:1100px;height:700px'; document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<AuthoringMode workspace={{ id: 'test', name: 'Structure' }}
    content={structureContent()} authoring={authoring} selectedConceptId={null} onSelectConcept={vi.fn()} />));
  // Overview draws points only; the neighbourhood of C is where its derivation is selectable.
  await page.getByRole('button', { name: '画布概念 C', exact: true }).click();
  await page.getByRole('button', { name: '画布推导 edge', exact: true }).click();
}

it('edits the selected derivation from the relations pane and commits it as one change', async () => {
  const authoring = commands();
  await renderStructure(authoring);

  await expect.element(page.getByRole('button', { name: '保存更改', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '移除前提 B', exact: true }).click();
  await expect.element(page.getByText('有未保存的修改')).toBeVisible();
  await page.getByRole('button', { name: '保存更改', exact: true }).click();

  expect(authoring.updateDerivationStructure).toHaveBeenCalledExactlyOnceWith({
    derivationId: 'edge', tails: ['A'], head: 'C', weight: 2,
  });
});

it('adds a premise, replaces the result and re-costs the derivation in the same change', async () => {
  const authoring = commands();
  await renderStructure(authoring);

  await page.getByRole('button', { name: '移除前提 A', exact: true }).click();
  await page.getByRole('button', { name: '添加前提概念', exact: true }).click();
  await page.getByRole('searchbox', { name: '添加前提概念搜索' }).fill('C');
  await page.getByRole('option', { name: /^C/ }).click();
  // A self-loop: C is now both a premise and the result. derivon-core allows it.
  await expect.element(page.getByText('C → C', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: '更换结果概念', exact: true }).click();
  await page.getByRole('option', { name: /^A/ }).click();
  await page.getByRole('spinbutton', { name: '学习成本' }).fill('0.5');
  await page.getByRole('button', { name: '保存更改', exact: true }).click();

  expect(authoring.updateDerivationStructure).toHaveBeenCalledExactlyOnceWith({
    derivationId: 'edge', tails: ['B', 'C'], head: 'A', weight: 0.5,
  });
});

it('discards a structure draft on demand and when another object is selected', async () => {
  const authoring = commands();
  await renderStructure(authoring);
  const draftKey = 'test:derivation-structure:edge';

  await page.getByRole('button', { name: '移除前提 B', exact: true }).click();
  expect(authoring.protectDraft).toHaveBeenCalledWith(draftKey, true);
  await page.getByRole('button', { name: '放弃更改', exact: true }).click();
  await expect.element(page.getByText('与有效内容一致')).toBeVisible();
  await expect.element(page.getByRole('button', { name: '移除前提 B', exact: true })).toBeVisible();

  // Selecting away is leaving this derivation: the draft goes, and so does its protection.
  await page.getByRole('button', { name: '移除前提 B', exact: true }).click();
  await page.getByRole('button', { name: '画布概念 A', exact: true }).click();
  await expect.element(page.getByRole('heading', { name: '前提推导 0', exact: true })).toBeVisible();
  expect(authoring.protectDraft).toHaveBeenLastCalledWith(draftKey, false);
  expect(authoring.updateDerivationStructure).not.toHaveBeenCalled();
});

it('keeps the relations pane read-only without authoring authority', async () => {
  await renderStructure(undefined);
  await expect.element(page.getByRole('heading', { name: '联合前提 2', exact: true })).toBeVisible();
  await expect.element(page.getByRole('button', { name: '保存更改', exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByRole('button', { name: '移除前提 B', exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByRole('button', { name: '添加前提概念', exact: true })).not.toBeInTheDocument();
});
