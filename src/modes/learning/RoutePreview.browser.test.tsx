import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { RouteSolver } from '../../ports/RouteSolver';
import { createMemoryLearnerRecords } from '../../testing/learnerRecordStore';
import { fixtureRouteSolver } from '../../testing/routeSolver';
import { WORKSPACE_SCHEMA, parseWorkspaceContent, type WorkspaceContent } from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view }: GraphRendererProps) =>
  <span>{view.kind} 图 · {view.concepts.length} 个概念</span> }));
import { LearningMode } from './LearningMode';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

function workspace(): WorkspaceContent {
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA, id: 'test-workspace',
    document: { title: '路线工作区', description: '' },
    tags: [{ id: 'basics', label: '基础' }, { id: 'advanced', label: '进阶' }],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b', tags: ['basics'] } },
      { id: 'c', data: { label: 'C', document: 'docs/c', tags: ['advanced'] } },
    ], hyperedges: [
      { id: 'd1', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
      { id: 'd2', weight: 3, tails: ['b'], head: 'c', data: { document: 'docs/d2' } },
    ] },
  }), documents: {} });
}

function Harness({ routeSolver, onConfirmRoute = vi.fn(), onEnterView = vi.fn(), knownIds = ['a'] }: {
  routeSolver?: RouteSolver;
  onConfirmRoute?: () => void;
  onEnterView?: (view: 'orientation' | 'preview' | 'route' | 'browse') => void;
  knownIds?: readonly string[];
}) {
  const [content] = useState(workspace);
  const [targets, setTargets] = useState<readonly string[]>(['c']);
  const [known, setKnown] = useState<readonly string[]>(knownIds);
  const [records] = useState(() => createMemoryLearnerRecords());
  return <LearningMode workspace={{ id: 'w', name: '路线工作区' }} content={content} active
    learnerRecords={records.store} targetIds={targets} knownIds={known} routeSolver={routeSolver}
    view="preview" onEnterView={onEnterView} onConfirmRoute={onConfirmRoute} activeRouteId={null}
    onSelectRoute={vi.fn()}
    onChangeTargets={setTargets} onChangeKnown={setKnown} />;
}

async function render(over: Parameters<typeof Harness>[0] = {}) {
  root = createRoot(container);
  await act(async () => root?.render(<Harness {...over} />));
  await act(async () => { await Promise.resolve(); });
}

it('shows the computed route as a reading order, with the reason each step is there', async () => {
  await render({ routeSolver: fixtureRouteSolver() });
  await expect.element(page.getByText('这是算出来的路线')).toBeVisible();

  const steps = [...container.querySelectorAll('.learning-preview-list li')].map((item) => item.textContent);
  expect(steps).toHaveLength(2);
  expect(steps[0]).toContain('需要 A');
  expect(steps[1]).toContain('需要 B');
  expect(container.textContent).toContain('已按你说会的 1 个概念削过');
});

it('says an unproven route is unproven rather than calling it the best one', async () => {
  await render({ routeSolver: fixtureRouteSolver() });
  expect(container.textContent).toContain('预算内的上界，未证明最优');
});

it('draws only the route, not the whole graph', async () => {
  await render({ routeSolver: fixtureRouteSolver() });
  await expect.element(page.getByText('route 图 · 3 个概念')).toBeVisible();
});

it('refuses to start on a host that cannot solve, and says so instead of inventing an order', async () => {
  await render({});
  await expect.element(page.getByText('还没有可以走的路线')).toBeVisible();
  expect(container.textContent).toContain('这个宿主还不能求解路线');
  expect((page.getByRole('button', { name: '开始学' }).element() as HTMLButtonElement).disabled).toBe(true);
});

it('reports an unreachable target with what is missing, rather than a shorter route', async () => {
  await render({ routeSolver: fixtureRouteSolver(), knownIds: [] });
  await expect.element(page.getByRole('alert')).toBeVisible();
  expect(container.textContent).toContain('目前无法从已知走到全部目标');
});

it('only enters the route when the learner accepts it', async () => {
  const onConfirmRoute = vi.fn();
  const onEnterView = vi.fn();
  await render({ routeSolver: fixtureRouteSolver(), onConfirmRoute, onEnterView });

  await page.getByRole('button', { name: '不对，回去改目标' }).click();
  expect(onEnterView).toHaveBeenLastCalledWith('orientation');
  expect(onConfirmRoute).not.toHaveBeenCalled();

  await page.getByRole('button', { name: '开始学' }).click();
  expect(onConfirmRoute).toHaveBeenCalledTimes(1);
});
