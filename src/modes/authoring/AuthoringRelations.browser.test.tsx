import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import type { GraphView } from '../../rendering';
import type { WorkspaceContent } from '../../workspace/index';
import { AuthoringMode } from './AuthoringMode';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view }: { view: GraphView }) => <output aria-label="Rendered edges">{view.hyperedges.map(({ id }) => id).join(' ')}</output> }));
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); });

it('shows selected derivation endpoints and limits concept neighbourhoods to incident edges', async () => {
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
  await act(async () => root!.render(<AuthoringMode workspace={{ id: 'test', name: 'Relations' }} content={content} selectedConceptId="Focus" onSelectConcept={vi.fn()} />));
  await page.getByRole('button', { name: '图浏览', exact: true }).click();
  await page.getByRole('button', { name: '关联布局', exact: true }).click();
  await expect.element(page.getByLabelText('Rendered edges')).toHaveTextContent('incoming outgoing');
  expect(page.getByLabelText('Rendered edges').element().textContent).not.toContain('unrelated');
  await page.getByRole('button', { name: '推导 incoming', exact: true }).click();
  await expect.element(page.getByRole('heading', { name: '联合前提 1', exact: true })).toBeVisible();
  await expect.element(page.getByRole('heading', { name: '结果概念 1', exact: true })).toBeVisible();
  const relations = container.querySelector('.authoring-context-body')!;
  expect([...relations.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['A', 'Focus']);
});
