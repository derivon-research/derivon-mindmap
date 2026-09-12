import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { RouteRecord } from '../../learner-records';
import { routeBasis } from '../../learner-records/basis';
import { createMemoryLearnerRecords, type MemoryLearnerRecords } from '../../testing/learnerRecordStore';
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
    tags: [],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a' } },
      { id: 'b', data: { label: 'B', document: 'docs/b' } },
      { id: 'c', data: { label: 'C', document: 'docs/c' } },
    ], hyperedges: [
      { id: 'd1', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
      { id: 'd2', weight: 3, tails: ['b'], head: 'c', data: { document: 'docs/d2' } },
    ] },
  }), documents: {} });
}

const content = workspace();
const basis = await routeBasis(content.graph, ['a', 'b', 'c', 'd1', 'd2']);

const record = (id: string, description: string, over: Partial<RouteRecord> = {}): RouteRecord => ({
  id, description, targets: ['c'], known: ['a'], basis,
  conceptIds: ['a', 'b', 'c'], derivationIds: ['d1', 'd2'], order: ['d1', 'd2'], cost: 5,
  ...over,
});


function Harness({
  records, view = 'route', activeRouteId = null, onConfirmRoute = vi.fn(), onSelectRoute = vi.fn(), onEnterView = vi.fn(),
}: {
  records?: MemoryLearnerRecords;
  view?: 'orientation' | 'preview' | 'route' | 'browse';
  activeRouteId?: string | null;
  onConfirmRoute?: (routeId: string) => void;
  onSelectRoute?: (routeId: string | null) => void;
  onEnterView?: (view: 'orientation' | 'preview' | 'route' | 'browse') => void;
}) {
  const [targets, setTargets] = useState<readonly string[]>(['c']);
  const [known, setKnown] = useState<readonly string[]>(['a']);
  return <LearningMode workspace={{ id: 'test-workspace', name: '路线工作区' }} content={content} active
    learnerRecords={records?.store} targetIds={targets} knownIds={known} routeSolver={fixtureRouteSolver()}
    view={view} onEnterView={onEnterView} activeRouteId={activeRouteId}
    onConfirmRoute={onConfirmRoute} onSelectRoute={onSelectRoute}
    onChangeTargets={setTargets} onChangeKnown={setKnown} />;
}

async function render(over: Parameters<typeof Harness>[0] = {}) {
  root = createRoot(container);
  await act(async () => root?.render(<Harness {...over} />));
  await act(async () => { await Promise.resolve(); });
}

it('leaves no record behind while the learner is only looking at the preview', async () => {
  const records = createMemoryLearnerRecords();
  await render({ records, view: 'preview' });
  await expect.element(page.getByText('这是算出来的路线')).toBeVisible();
  expect(records.routes()).toEqual([]);

  await page.getByRole('button', { name: '开始学' }).click();
  await act(async () => { await Promise.resolve(); });
  expect(records.routes().map((route) => route.description)).toEqual(['走到 C']);
  expect(records.routes()[0]).toMatchObject({ targets: ['c'], known: ['a'], order: ['d1', 'd2'], cost: 5 });
});

it('shows every confirmed route when none is active, and starts the one the learner picks', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [record('r-aaaaaa', '第一条'), record('r-bbbbbb', '第二条')] });
  const onSelectRoute = vi.fn();
  await render({ records, onSelectRoute });

  await expect.element(page.getByText('我的路线')).toBeVisible();
  expect(container.textContent).toContain('第一条');
  expect(container.textContent).toContain('第二条');
  await page.getByRole('button', { name: /第一条/ }).click();
  await page.getByRole('button', { name: '开始学' }).click();
  expect(onSelectRoute).toHaveBeenCalledWith('r-aaaaaa');
});

it('deletes a route on an explicit action, leaving mastery alone', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routes: [record('r-aaaaaa', '第一条')],
    state: { concepts: { a: { status: 'complete', basis, data: { selfReported: true } } }, derivations: {} },
  });
  const masteryBefore = records.stateText();
  await render({ records });

  await expect.element(page.getByRole('heading', { name: '第一条' })).toBeVisible();
  await page.getByRole('button', { name: '删除这条路线' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await act(async () => { await Promise.resolve(); });
  expect(records.routes()).toEqual([]);
  expect(records.stateText()).toBe(masteryBefore);
});

it('reports a route solved against a different graph without re-solving or deleting it', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [record('r-aaaaaa', '旧图上的路线', { basis: 'f'.repeat(64) })] });
  await render({ records });

  await expect.element(page.getByText('与当前图不一致', { exact: true })).toBeVisible();
  expect(records.routes().map((route) => route.id)).toEqual(['r-aaaaaa']);
  expect(container.textContent).toContain('旧图上的路线');
});

it('has a way back to orientation from the route stage, and no way to edit a route', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [record('r-aaaaaa', '第一条')] });
  const onEnterView = vi.fn();
  await render({ records, onEnterView });

  await page.getByRole('button', { name: '新建路线' }).click();
  expect(onEnterView).toHaveBeenCalledWith('orientation');
  expect(container.textContent).not.toContain('改目标后再算一条');
});
