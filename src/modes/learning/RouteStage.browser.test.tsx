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
  expect(records.routes().map((route) => route.description)).toEqual(['从 A 走到 C']);
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
  const records = createMemoryLearnerRecords('test-workspace', {
    routes: [record('r-aaaaaa', '旧图上的路线', { basis: 'f'.repeat(64) })],
  });
  await render({ records });

  await expect.element(page.getByText('与当前图不一致', { exact: true })).toBeVisible();
  expect(records.routes().map((route) => route.id)).toEqual(['r-aaaaaa']);
  expect(container.textContent).toContain('旧图上的路线');
});

it('shows the record’s own step count beside the steps the graph can still draw', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routes: [record('r-aaaaaa', '丢了一步的路线', {
      basis: 'f'.repeat(64),
      derivationIds: ['d1', 'd2', 'd-gone'],
      order: ['d1', 'd2', 'd-gone'],
    })],
  });
  await render({ records });

  await expect.element(page.getByRole('heading', { name: '丢了一步的路线' })).toBeVisible();
  // The route is three steps as recorded; the graph can only draw two of them, and it says so.
  expect(container.textContent).toContain('3 步');
  expect(container.textContent).toContain('记录里的 1 步已经不在当前图里');
  expect(container.querySelectorAll('.learning-preview-list li')).toHaveLength(2);
});

it('puts the way into the route above the steps, not at the bottom of them', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [record('r-aaaaaa', '第一条')] });
  await render({ records });
  await expect.element(page.getByRole('button', { name: '开始学' })).toBeVisible();

  const start = page.getByRole('button', { name: '开始学' }).element();
  const steps = container.querySelector('.route-shelf-detail .learning-preview-list');
  expect(steps).not.toBeNull();
  // DOCUMENT_POSITION_FOLLOWING: the step list comes after the button, so the button is on top
  // and a long route never pushes the way in off the bottom of the screen.
  expect(start.compareDocumentPosition(steps!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector('.route-shelf-actions')).toBeNull();
});

it('offers no confirmation on a host with nowhere to keep the route', async () => {
  await render({ view: 'preview' });
  await expect.element(page.getByText('这是算出来的路线')).toBeVisible();
  expect((page.getByRole('button', { name: '开始学' }).element() as HTMLButtonElement).disabled).toBe(true);
  expect(container.textContent).toContain('这个宿主没有应用数据目录');
});

it('says a delete that never reached the file instead of quietly keeping the route', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routes: [record('r-aaaaaa', '第一条')],
    failWrites: true,
  });
  await render({ records });

  await page.getByRole('button', { name: '删除这条路线' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await act(async () => { await Promise.resolve(); });
  await expect.element(page.getByText(/这次修改没能落盘/)).toBeVisible();
  expect(records.routes().map((route) => route.id)).toEqual(['r-aaaaaa']);
});

it('does not report an unreadable routes.json as “no routes yet”', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routesText: '{"schema":"derivon.routes/v2","routes":[]}',
  });
  await render({ records });

  await expect.element(page.getByRole('alert')).toBeVisible();
  expect(container.textContent).toContain('路线记录读不出来');
  expect(container.textContent).not.toContain('还没有确认过路线');
});

it('has a way back to orientation from the route stage, and no way to edit a route', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [record('r-aaaaaa', '第一条')] });
  const onEnterView = vi.fn();
  await render({ records, onEnterView });

  await page.getByRole('button', { name: '新建路线' }).click();
  expect(onEnterView).toHaveBeenCalledWith('orientation');
  expect(container.textContent).not.toContain('改目标后再算一条');
});
