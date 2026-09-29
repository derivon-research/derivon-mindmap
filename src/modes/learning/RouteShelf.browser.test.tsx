import { act, lazy, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { WorkspaceHandle } from '../../app/host';
import {
  confirmLearningRoute, enterLearningView, initialAppState, selectLearningRoute, setLearningTargets, type AppState,
} from '../../app/appState';
import WorkspaceSurface from '../../app/WorkspaceSurface';
import { routeBasis } from '../../learner-records/basis';
import { createMemoryLearnerRecords, type MemoryLearnerRecords } from '../../testing/learnerRecordStore';
import { createMemoryWorkspaceSource, type MemoryWorkspace } from '../../testing/memoryWorkspaceSource';
import { fixtureRouteSolver } from '../../testing/routeSolver';
import { parseWorkspaceManifest, serializeRoute, WORKSPACE_SCHEMA, type Route } from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view }: GraphRendererProps) =>
  <span>{view.kind} 图 · {view.concepts.length} 个概念</span> }));

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

// Two ways to get B: `d1` is the one the author's route uses, `d1b` its parallel.
const graphText = JSON.stringify({
  schema: WORKSPACE_SCHEMA, id: 'test-workspace',
  document: { title: '路线工作区', description: '' },
  tags: [],
  graph: { points: [
    { id: 'a', data: { label: 'A', document: 'docs/a' } },
    { id: 'b', data: { label: 'B', document: 'docs/b' } },
    { id: 'c', data: { label: 'C', document: 'docs/c' } },
  ], hyperedges: [
    { id: 'd1', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
    { id: 'd1b', weight: 1, tails: ['a'], head: 'b', data: { document: 'docs/d1b' } },
    { id: 'd2', weight: 3, tails: ['b'], head: 'c', data: { document: 'docs/d2' } },
  ] },
});
const graph = parseWorkspaceManifest(graphText).manifest.graph;

const authorRoute: Route = {
  id: 'r-wwwwww', label: '作者的路线', description: '按教材的讲法走到 C',
  known: ['a'], targets: ['c'], steps: ['d1', 'd2'], ordered: false,
};
const brokenRoute: Route = { id: 'r-xxxxxx', label: '缺一步的路线', known: ['a'], targets: ['c'], steps: ['d2'], ordered: false };

const personal = async (over: Partial<Route> = {}): Promise<Route> => {
  const route: Route = { id: 'r-pppppp', label: '我自己的路线', known: ['a'], targets: ['c'], steps: ['d1b', 'd2'], ordered: true, ...over };
  return { ...route, basis: await routeBasis(graph, ['a', 'b', 'c', ...route.steps]) };
};

function memoryWorkspace(routes: readonly Route[]): MemoryWorkspace {
  return createMemoryWorkspaceSource(graphText, {
    documents: Object.fromEntries(['a', 'b', 'c', 'd1', 'd1b', 'd2'].map((id) => [`docs/${id}/document.md`, id])),
    companionMetadata: Object.fromEntries(routes.map((route) => [`.derivon/routes/${route.id}.json`, serializeRoute(route, 'workspace')])),
  });
}

const learning = lazy(async () => ({ default: (await import('./LearningMode')).LearningMode }));

/** The application around the learning mode: a real session over the workspace, and real app state. */
function App({ workspace }: { workspace: WorkspaceHandle }) {
  const [state, setState] = useState<AppState>(() => enterLearningView(
    initialAppState({ hostId: 'desktop', modes: ['learning'], workspace }), 'route'));
  return <WorkspaceSurface workspace={workspace} state={state} modes={{ authoring: null, learning }}
    routeSolver={fixtureRouteSolver()}
    onSelectConcept={() => {}} onChangeTargets={(ids) => setState((current) => setLearningTargets(current, ids))}
    onEnterLearningView={(view) => setState((current) => enterLearningView(current, view))}
    onConfirmRoute={(id) => setState((current) => confirmLearningRoute(current, id))}
    onSelectRoute={(id) => setState((current) => selectLearningRoute(current, id))}
    onProtectionChange={() => {}} />;
}

async function open(disk: MemoryWorkspace, records?: MemoryLearnerRecords) {
  const workspace: WorkspaceHandle = {
    id: '/workspaces/test', name: '路线工作区', source: disk.source, authoringSource: disk.source,
    learnerRecords: records?.store,
  };
  root = createRoot(container);
  await act(async () => root?.render(<App workspace={workspace} />));
  await expect.element(page.getByRole('heading', { name: '这个工作区带的' })).toBeVisible();
}

/** The picker's own list, as the route editor's test reaches it. */
const pick = async (picker: string, label: string) => {
  const choice = [...container.querySelectorAll(`ul[aria-label="${picker}"] button`)]
    .find((candidate) => candidate.textContent?.startsWith(label)) as HTMLButtonElement;
  await act(async () => choice.click());
};

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

it('shows the workspace routes and the learner\'s own as two groups, each with where it came from', async () => {
  const disk = memoryWorkspace([authorRoute]);
  const records = createMemoryLearnerRecords('test-workspace', { routes: [await personal({ basedOn: 'r-wwwwww' })] });
  await open(disk, records);

  const shipped = page.getByRole('region', { name: '这个工作区带的' });
  const own = page.getByRole('region', { name: '我的' });
  await expect.element(shipped.getByRole('button', { name: /作者的路线/ })).toBeVisible();
  await expect.element(own.getByRole('button', { name: /我自己的路线/ })).toBeVisible();
  expect(shipped.getByRole('button', { name: /我自己的路线/ }).elements()).toHaveLength(0);

  // The author's route: its description, what it reaches, and read-only here.
  await expect.element(page.getByRole('heading', { name: '作者的路线', level: 2 })).toBeVisible();
  expect(container.textContent).toContain('按教材的讲法走到 C');
  expect(container.textContent).toContain('走到 C · 2 步 · 成本 5');
  expect(page.getByRole('button', { name: '修改', exact: true }).elements()).toHaveLength(0);
  expect(page.getByRole('textbox', { name: '路线名称' }).elements()).toHaveLength(0);

  await own.getByRole('button', { name: /我自己的路线/ }).click();
  await expect.element(page.getByText(/改自这个工作区带的「作者的路线」/)).toBeVisible();
  await expect.element(page.getByRole('button', { name: '修改', exact: true })).toBeVisible();
});

it('copies an author\'s route into a new personal file on save, and never writes the workspace', async () => {
  const disk = memoryWorkspace([authorRoute]);
  const before = new Map(disk.files);
  const records = createMemoryLearnerRecords('test-workspace');
  await open(disk, records);

  await page.getByRole('button', { name: '另存为我的路线并修改' }).click();
  // Not saved yet: a copy is a draft until the learner saves it.
  expect(records.routeFileNames()).toEqual([]);
  await page.getByRole('combobox', { name: '换掉第 1 步的推导' }).selectOptions('d1b');
  await page.getByRole('textbox', { name: '路线名称' }).fill('我的讲法');
  await page.getByRole('button', { name: '保存' }).click();
  await settle();

  const [copy] = records.routes();
  expect(records.routeFileNames()).toEqual([`${copy.id}.json`]);
  expect(copy).toEqual({
    id: expect.stringMatching(/^r-/), label: '我的讲法', description: '按教材的讲法走到 C',
    known: ['a'], targets: ['c'], steps: ['d1b', 'd2'], ordered: false, basedOn: 'r-wwwwww',
    basis: await routeBasis(graph, ['a', 'b', 'c', 'd1b', 'd2']),
  });
  expect(copy.id).not.toBe('r-wwwwww');
  // The workspace is as it was: no commit, no file touched, the author's route unchanged.
  expect(disk.commits).toEqual([]);
  expect(disk.files).toEqual(before);

  // The copy is on the shelf, selected, and names the route it came from.
  await expect.element(page.getByRole('region', { name: '我的' }).getByRole('button', { name: /我的讲法/ })).toBeVisible();
  await expect.element(page.getByRole('heading', { name: '我的讲法', level: 2 })).toBeVisible();
  expect(container.textContent).toContain('改自这个工作区带的「作者的路线」');
});

it('edits a personal route in place, recomputing its basis, and keeps the draft when the save loses', async () => {
  const disk = memoryWorkspace([]);
  const saved = await personal({ steps: ['d1b', 'd2'] });
  const records = createMemoryLearnerRecords('test-workspace', { routes: [saved] });
  await open(disk, records);

  await page.getByRole('button', { name: '修改', exact: true }).click();
  await page.getByRole('combobox', { name: '换掉第 1 步的推导' }).selectOptions('d1');
  await page.getByRole('button', { name: '保存' }).click();
  await settle();

  expect(records.routeFileNames()).toEqual(['r-pppppp.json']);
  expect(records.routes()[0]).toEqual({
    ...saved, steps: ['d1', 'd2'], basis: await routeBasis(graph, ['a', 'b', 'c', 'd1', 'd2']),
  });
  expect(disk.commits).toEqual([]);
});

it('says why a save was refused and keeps the draft', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { routes: [await personal()], failWrites: true });
  await open(memoryWorkspace([]), records);

  await page.getByRole('button', { name: '修改', exact: true }).click();
  await page.getByRole('textbox', { name: '路线名称' }).fill('改了名字');
  await page.getByRole('button', { name: '保存' }).click();
  await expect.element(page.getByRole('alert').getByText(/学习者记录已被其他写入方更新/)).toBeVisible();
  expect((page.getByRole('textbox', { name: '路线名称' }).element() as HTMLInputElement).value).toBe('改了名字');
  expect(records.routes()[0].label).toBe('我自己的路线');
});

it('creates a personal route from blank: a solver draft, then a save', async () => {
  const records = createMemoryLearnerRecords('test-workspace');
  await open(memoryWorkspace([]), records);

  await page.getByRole('button', { name: '创建我的路线' }).click();
  // Nothing to save until it has a name and a target it reaches.
  expect((page.getByRole('button', { name: '保存' }).element() as HTMLButtonElement).disabled).toBe(true);
  await page.getByRole('textbox', { name: '路线名称' }).fill('从零到 C');
  await pick('目标', 'C');
  await pick('已知', 'A');
  await page.getByRole('button', { name: '按目标与已知重新求初稿' }).click();
  await expect.element(page.getByRole('listitem', { name: '第 2 步：C' })).toBeVisible();
  await page.getByRole('button', { name: '保存' }).click();
  await settle();

  const [created] = records.routes();
  expect(created).toMatchObject({ label: '从零到 C', known: ['a'], targets: ['c'], ordered: false });
  expect(created.steps).toHaveLength(2);
  expect(created.basis).toMatch(/^[0-9a-f]{64}$/);
  expect(created.basedOn).toBeUndefined();
});

it('marks an invalid workspace route and does not let it start', async () => {
  await open(memoryWorkspace([authorRoute, brokenRoute]), createMemoryLearnerRecords('test-workspace'));

  const shipped = page.getByRole('region', { name: '这个工作区带的' });
  await shipped.getByRole('button', { name: /缺一步的路线/ }).click();
  await expect.element(page.getByRole('heading', { name: '缺一步的路线', level: 2 })).toBeVisible();
  expect(shipped.element().textContent).toContain('与当前图不符');
  expect(container.textContent).toContain('不能开始学');
  expect((page.getByRole('button', { name: '开始学' }).element() as HTMLButtonElement).disabled).toBe(true);
});

it('counts steps the way the editor does: a derivation the graph lacks is not a step', async () => {
  const dangling: Route = { ...authorRoute, id: 'r-yyyyyy', label: '引用悬空的路线', steps: ['d1', 'gone', 'd2'] };
  await open(memoryWorkspace([dangling]), createMemoryLearnerRecords('test-workspace'));

  const shipped = page.getByRole('region', { name: '这个工作区带的' });
  await expect.element(shipped.getByRole('button', { name: /引用悬空的路线/ })).toHaveTextContent('走到 C · 2 步 · 成本 5');
  expect(container.textContent).not.toContain('3 步');
});

it('walks a workspace route like any other, from the shelf', async () => {
  await open(memoryWorkspace([authorRoute]), createMemoryLearnerRecords('test-workspace'));

  await page.getByRole('button', { name: '开始学' }).click();
  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();
  expect(container.querySelector('[data-derivon-mode="learning"]')?.getAttribute('data-learning-active-route')).toBe('r-wwwwww');
});

it('offers no personal route anywhere on a host with no learner records', async () => {
  await open(memoryWorkspace([authorRoute]));

  await expect.element(page.getByRole('heading', { name: '作者的路线', level: 2 })).toBeVisible();
  expect(page.getByRole('button', { name: '另存为我的路线并修改' }).elements()).toHaveLength(0);
  expect(page.getByRole('button', { name: '创建我的路线' }).elements()).toHaveLength(0);
  expect(page.getByRole('button', { name: '修改', exact: true }).elements()).toHaveLength(0);
  expect(container.textContent).toContain('存不了自己的路线');
  // The author's route can still be walked.
  expect((page.getByRole('button', { name: '开始学' }).element() as HTMLButtonElement).disabled).toBe(false);
});
