import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { WorkspaceContent } from '../../workspace/index';
import { AuthoringMode } from './AuthoringMode';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view, onEvent }: GraphRendererProps) => <div>
  <output aria-label="Rendered edges">{view.hyperedges.map(({ id }) => id).join(' ')}</output>
  <output aria-label="Selected graph objects">{[...view.concepts, ...view.hyperedges].filter(({ marks }) => marks.includes('selected')).map(({ id }) => id).join(' ')}</output>
  {view.concepts.map(({ id }) => <button key={`concept:${id}`} onClick={() => onEvent({ type: 'select', object: { kind: 'concept', id } })}>画布概念 {id}</button>)}
  {view.kind !== 'overview' && view.hyperedges.map(({ id }) => <button key={`derivation:${id}`} onClick={() => onEvent({ type: 'select', object: { kind: 'derivation', id } })}>画布推导 {id}</button>)}
</div> }));
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); });

it('opens the overview, selects neighbourhood objects, and opens the selected object on a repeated click', async () => {
  await page.viewport(1100, 800);
  const points = ['A', 'Focus', 'B'].map((id) => ({ id, data: { label: id, document: `docs/${id}`, format: 'html' as const } }));
  const hyperedges = [
    { id: 'incoming', tails: ['A'], head: 'Focus' },
    { id: 'outgoing', tails: ['Focus'], head: 'B' },
    { id: 'unrelated', tails: ['A'], head: 'B' },
  ].map((edge) => ({ ...edge, weight: 1, data: { document: `docs/${edge.id}`, format: 'html' as const } }));
  const content: WorkspaceContent = { title: 'Relations', graphText: '', graph: { points, hyperedges },
    documents: Object.fromEntries([...points, ...hyperedges].map((item) => [`${item.data.document}/index.html`, { status: 'ready', text: '<p>Body</p>' }])),
    companionMetadata: {}, diagnostics: [], requiresMigrationConsent: false };
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
  await expect.element(page.getByRole('heading', { name: '推导 outgoing', exact: true })).toBeVisible();
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
  await expect.element(page.getByRole('heading', { name: 'A', exact: true })).toBeVisible();
});
