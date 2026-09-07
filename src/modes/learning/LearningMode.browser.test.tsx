import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { LearningModeProps } from '../../app/host';
import { WORKSPACE_SCHEMA, parseWorkspaceContent, type WorkspaceContent } from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view, onEvent }: GraphRendererProps) =>
  <button type="button" onClick={() => onEvent({ type: 'select', object: { kind: 'concept', id: view.concepts[0].id } })}>
    select graph concept
  </button> }));
import { LearningMode } from './LearningMode';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

function props(over: Partial<LearningModeProps> & Pick<LearningModeProps, 'content'>): LearningModeProps {
  return {
    workspace: { id: 'fixture', name: 'Fixture' }, targetIds: [], knownIds: [],
    onChangeTargets: vi.fn(), onChangeKnown: vi.fn(),
    view: 'orientation', onEnterView: vi.fn(), onConfirmRoute: vi.fn(), active: true,
    ...over,
  };
}

it('retains an unchanged hidden overview and invalidates changed topology until return', async () => {
  const first: WorkspaceContent = { graphText: '', title: 'First', graph: { points: [{ id: 'first', data: { label: 'First', document: 'docs/first' } }], hyperedges: [] },
    documents: {}, companionMetadata: {}, tags: [], orientation: { status: 'absent' }, diagnostics: [] };
  const latest: WorkspaceContent = { ...first, graph: { points: [{ id: 'latest', data: { label: 'Latest', document: 'docs/latest' } }], hyperedges: [] } };
  root = createRoot(container);
  act(() => root?.render(<LearningMode {...props({ content: first, targetIds: ['first'] })} />));
  await expect.element(page.getByRole('button', { name: 'select graph concept' })).toBeVisible();
  act(() => root?.render(<LearningMode {...props({ content: first, targetIds: ['first'], active: false })} />));
  expect(container.textContent).toContain('select graph concept');
  act(() => root?.render(<LearningMode {...props({ content: latest, targetIds: ['first'], active: false })} />));
  expect(container.textContent).not.toContain('select graph concept');
  act(() => root?.render(<LearningMode {...props({ content: latest, targetIds: ['first'] })} />));
  await expect.element(page.getByRole('button', { name: 'select graph concept' })).toBeVisible();
  await page.getByRole('button', { name: 'select graph concept' }).click();
  // Returning rebuilds from the latest content: the page opened is `latest`, not the retained `first`.
  expect(container.querySelector('.learning-reader')?.getAttribute('aria-label')).toBe('Latest 文档');
});

function content(): WorkspaceContent {
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA,
    document: { title: '工作区', description: '' },
    tags: [],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a' } },
      { id: 'b', data: { label: 'B', document: 'docs/b' } },
    ], hyperedges: [{ id: 'd1', weight: 1, tails: ['a'], head: 'b', data: { document: 'docs/d1' } }] },
  }), documents: { 'docs/b/document.md': { status: 'ready', text: '<main>B body</main>' } } });
}

it('shows the view the application asked for, and only that one', async () => {
  root = createRoot(container);
  act(() => root?.render(<LearningMode {...props({ content: content(), targetIds: ['b'], view: 'browse' })} />));
  await expect.element(page.getByText('大图浏览')).toBeVisible();
  expect(container.querySelector('[data-derivon-mode="learning"]')?.getAttribute('data-learning-view')).toBe('browse');
  expect(container.textContent).not.toContain('这是算出来的路线');

  act(() => root?.render(<LearningMode {...props({ content: content(), targetIds: ['b'], view: 'preview' })} />));
  await expect.element(page.getByText('还没有可以走的路线')).toBeVisible();
});

it('refuses to walk a route the host never produced, rather than inventing an order', async () => {
  root = createRoot(container);
  act(() => root?.render(<LearningMode {...props({ content: content(), targetIds: ['b'], view: 'route' })} />));
  await expect.element(page.getByRole('status')).toBeVisible();
  expect(container.textContent).toContain('得重新算一次');
});

it('leaves the application state that came from a mode switch alone', async () => {
  const onChangeTargets = vi.fn();
  root = createRoot(container);
  act(() => root?.render(<LearningMode {...props({ content: content(), targetIds: ['b'], onChangeTargets })} />));
  // A target carried in from the authoring side is the run; the generic entry adds nothing.
  expect(onChangeTargets).not.toHaveBeenCalled();
  expect(container.textContent).toContain('你的目标');
});
