import { act, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import { routeBasis } from '../../learner-records/basis';
import type { LearningView } from '../../app/host';
import { createMemoryLearnerRecords, type MemoryLearnerRecords } from '../../testing/learnerRecordStore';
import { createMemoryObjectFiles } from '../../testing/memoryObjectFiles';
import { fixtureRouteSolver } from '../../testing/routeSolver';
import { WORKSPACE_SCHEMA, parseWorkspaceContent, type Route, type WorkspaceContent } from '../../workspace/index';

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

const record = (id: string, label: string, over: Partial<Route> = {}): Route => ({
  id, label, known: ['a'], targets: ['c'], steps: ['d1', 'd2'], ordered: true, basis,
  ...over,
});


function Harness({
  records, view = 'route', activeRouteId = null, onConfirmRoute = vi.fn(), onSelectRoute = vi.fn(), onEnterView = vi.fn(),
}: {
  records?: MemoryLearnerRecords;
  view?: LearningView;
  activeRouteId?: string | null;
  onConfirmRoute?: (routeId: string) => void;
  onSelectRoute?: (routeId: string | null) => void;
  onEnterView?: (view: LearningView) => void;
}) {
  const [targets, setTargets] = useState<readonly string[]>(['c']);
  const files = useMemo(() => createMemoryObjectFiles({
    'docs/a/document.md': 'A', 'docs/b/document.md': 'B', 'docs/c/document.md': 'C',
    'docs/d1/document.md': '第一步', 'docs/d2/document.md': '第二步',
  }), []);
  return <LearningMode workspace={{ id: 'test-workspace', name: '路线工作区' }} content={content} active
    learnerRecords={records?.store} targetIds={targets} routeSolver={fixtureRouteSolver()}
    readOwnedFiles={files.listOwnedFiles} readDocuments={files.readDocuments} readAsset={files.readAsset}
    view={view} onEnterView={onEnterView} activeRouteId={activeRouteId}
    onConfirmRoute={onConfirmRoute} onSelectRoute={onSelectRoute}
    onChangeTargets={setTargets} />;
}

async function render(over: Parameters<typeof Harness>[0] = {}) {
  root = createRoot(container);
  await act(async () => root?.render(<Harness {...over} />));
  await act(async () => { await Promise.resolve(); });
}

it('leaves no record behind while the learner is only looking at the route it computed', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    state: { concepts: { a: { status: 'complete', basis: 'a'.repeat(64), data: { selfReported: true } } }, derivations: {} },
  });
  await render({ records, view: 'orientation' });
  await page.getByRole('button', { name: '去看路线' }).click();
  await expect.element(page.getByText('这是算出来的路线')).toBeVisible();
  expect(records.routes()).toEqual([]);

  await page.getByRole('button', { name: '开始学' }).click();
  await act(async () => { await Promise.resolve(); });
  // One new personal route file, its order written down, saved against this graph.
  const [route] = records.routes();
  expect(records.routeFileNames()).toEqual([`${route.id}.json`]);
  expect(route).toEqual({
    id: expect.stringMatching(/^r-/), label: '从 A 走到 C', known: ['a'], targets: ['c'], steps: ['d1', 'd2'], ordered: true, basis,
  });
});

it('writes a confirmed route beside the others without rewriting any of them', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routes: [record('r-aaaaaa', '第一条')],
    state: { concepts: { a: { status: 'complete', basis: 'a'.repeat(64), data: { selfReported: true } } }, derivations: {} },
  });
  const before = records.routeText('r-aaaaaa');
  const onConfirmRoute = vi.fn();
  await render({ records, view: 'orientation', onConfirmRoute });
  await page.getByRole('button', { name: '去看路线' }).click();
  await page.getByRole('button', { name: '开始学' }).click();
  await act(async () => { await Promise.resolve(); });

  expect(records.routeFileNames()).toHaveLength(2);
  expect(records.routeText('r-aaaaaa')).toBe(before);
  const confirmed = records.routes().find((route) => route.id !== 'r-aaaaaa')!;
  expect(onConfirmRoute).toHaveBeenCalledWith(confirmed.id);
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

it('marks a route that no longer fits the graph as invalid, and does not let it start', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routes: [record('r-aaaaaa', '丢了一步的路线', { basis: 'f'.repeat(64), steps: ['d1', 'd2', 'd-gone'] })],
  });
  const onSelectRoute = vi.fn();
  await render({ records, onSelectRoute });

  await expect.element(page.getByRole('heading', { name: '丢了一步的路线' })).toBeVisible();
  // The route is three steps as saved; the graph can only draw two of them, and it says so.
  expect(container.textContent).toContain('3 步');
  expect(container.textContent).toContain('路线里的 1 步已经不在当前图里');
  expect(container.textContent).toContain('与当前图不符');
  expect(container.textContent).toContain('d-gone');
  expect(container.querySelectorAll('.learning-preview-list li')).toHaveLength(2);
  const start = page.getByRole('button', { name: '开始学' }).element() as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  // Kept as it was: not repaired, not deleted.
  expect(records.routes()[0].steps).toEqual(['d1', 'd2', 'd-gone']);
});

it('does not walk an invalid route even when it is the active one', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routes: [record('r-aaaaaa', '走不通的路线', { steps: ['d2'] })],
  });
  await render({ records, activeRouteId: 'r-aaaaaa' });

  await expect.element(page.getByRole('heading', { name: '走不通的路线' })).toBeVisible();
  expect(container.querySelector('.learning-route')).toBeNull();
  expect(container.textContent).not.toContain('第 1 / 1 步');
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
  await render({ view: 'orientation' });
  await page.getByRole('button', { name: '去看路线' }).click();
  // No record store means no known concepts either, so this graph yields no route at all;
  // what matters here is that confirming is blocked with a reason rather than silently lost.
  await expect.element(page.getByText('还没有可以走的路线')).toBeVisible();
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

it('lists an unreadable route file as unreadable instead of dropping it or calling the shelf empty', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    routeTexts: { 'r-bbbbbb.json': '{"schema":"derivon.routes/v1","routes":[]}' },
  });
  await render({ records });

  await expect.element(page.getByRole('heading', { name: 'r-bbbbbb.json' })).toBeVisible();
  expect(container.textContent).toContain('读不出来');
  expect(container.textContent).toContain('schema 必须为 derivon.route/v1');
  expect(container.textContent).not.toContain('还没有确认过路线');
  expect(page.getByRole('button', { name: '开始学' }).elements()).toHaveLength(0);
  expect(records.routeText('r-bbbbbb')).toBe('{"schema":"derivon.routes/v1","routes":[]}');
});

it('has one way back to creating a route, and no way to edit an existing one', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [record('r-aaaaaa', '第一条')] });
  const onEnterView = vi.fn();
  await render({ records, onEnterView });

  await page.getByRole('button', { name: '创建路线' }).click();
  expect(onEnterView).toHaveBeenCalledWith('orientation');
  expect(container.textContent).not.toContain('改目标后再算一条');
});

it('keeps the computed route inside creating one, instead of giving it a screen of its own', async () => {
  const records = createMemoryLearnerRecords('test-workspace', {
    state: { concepts: { a: { status: 'complete', basis: 'a'.repeat(64), data: { selfReported: true } } }, derivations: {} },
  });
  await render({ records, view: 'orientation' });
  await page.getByRole('button', { name: '去看路线' }).click();
  await expect.element(page.getByText('这是算出来的路线')).toBeVisible();
  // The screen is still the one the top bar calls 创建路线 — the route it computed is a step in it.
  expect(container.querySelector('[data-derivon-mode="learning"]')?.getAttribute('data-learning-view')).toBe('orientation');

  await page.getByRole('button', { name: '不对，回去改目标' }).click();
  await expect.element(page.getByRole('button', { name: '去看路线' })).toBeVisible();
});

it('does not leave a route being walked on screen under another view', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [record('r-aaaaaa', '第一条')] });
  await render({ records, activeRouteId: 'r-aaaaaa' });
  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();

  await act(async () => root?.render(<Harness records={records} activeRouteId="r-aaaaaa" view="browse" />));
  expect(container.querySelector('.learning-route')).toBeNull();
  expect(container.querySelector('.learning-rail')).toBeNull();
});
