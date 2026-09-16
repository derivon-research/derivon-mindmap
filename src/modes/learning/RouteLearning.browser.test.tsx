import { act, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { LearningModeProps } from '../../app/host';
import type { RouteRecord } from '../../learner-records';
import { routeBasis } from '../../learner-records/basis';
import type { ConversationProvider } from '../../ports/ConversationProvider';
import type { RouteSolver } from '../../ports/RouteSolver';
import { createMemoryLearnerRecords } from '../../testing/learnerRecordStore';
import { createMemoryObjectFiles } from '../../testing/memoryObjectFiles';
import { objectMasteryBasis } from './objectBasis';
import { fixtureRouteSolver } from '../../testing/routeSolver';
import { WORKSPACE_SCHEMA, parseWorkspaceContent, type WorkspaceContent } from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view, onEvent }: GraphRendererProps) => <div>
  <span>{view.kind} 图</span>
  {view.concepts.map((concept) => <button key={concept.id} type="button"
    onClick={() => onEvent({ type: 'select', object: { kind: 'concept', id: concept.id } })}>
    图：{concept.label}{concept.marks.length ? `（${concept.marks.join(',')}）` : ''}
  </button>)}
</div> }));
import { LearningMode } from './LearningMode';

let container: HTMLDivElement;
let root: Root | undefined;
/**
 * The store the walker writes to. It is rebuilt for every test: mastery now outlives a render, so
 * one test's judgement would otherwise be the next test's starting point.
 */
let walker: Awaited<ReturnType<typeof createWalker>>;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  walker = await createWalker();
});
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

function workspace(documents: WorkspaceContent['documents'] = {
  'docs/b/document.md': { status: 'ready', text: '<main>B 的定义正文</main>' },
  'docs/c/document.md': { status: 'ready', text: '<main>C 的定义正文</main>' },
  'docs/d1/document.md': { status: 'ready', text: '<main>第一步的推导正文</main>' },
  'docs/d2/document.md': { status: 'ready', text: '<main>第二步的推导正文</main>' },
}): WorkspaceContent {
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA, id: 'test-workspace',
    document: { title: '路线工作区', description: '' },
    tags: [{ id: 'basics', label: '基础' }],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b', tags: ['basics'] } },
      { id: 'c', data: { label: 'C', document: 'docs/c' } },
    ], hyperedges: [
      { id: 'd1', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
      { id: 'd2', weight: 3, tails: ['b'], head: 'c', data: { document: 'docs/d2' } },
    ] },
  }), documents });
}

function Harness({ content = workspace(), view = 'route' as const, onEnterView = vi.fn(), onConfirmRoute = vi.fn(), onSelectRoute = vi.fn(), conversation, drainPendingChanges, inventory = true }: {
  content?: WorkspaceContent;
  view?: LearningModeProps['view'];
  onEnterView?: LearningModeProps['onEnterView'];
  onConfirmRoute?: LearningModeProps['onConfirmRoute'];
  onSelectRoute?: LearningModeProps['onSelectRoute'];
  conversation?: LearningModeProps['conversation'];
  drainPendingChanges?: LearningModeProps['drainPendingChanges'];
  /** A host that cannot list an object's files, so no basis can be computed at all. */
  inventory?: boolean;
}) {
  const [targets, setTargets] = useState<readonly string[]>(['c']);
  const files = useMemo(() => createMemoryObjectFiles(readyDocuments(content)), [content]);
  return <LearningMode workspace={{ id: 'w', name: '路线工作区' }} content={content} active
    learnerRecords={walker.store} activeRouteId={walker.record.id}
    targetIds={targets} routeSolver={fixtureRouteSolver()}
    readOwnedFiles={inventory ? files.listOwnedFiles : undefined}
    readDocuments={files.readDocuments} readAsset={files.readAsset}
    view={view} onEnterView={onEnterView} onConfirmRoute={onConfirmRoute} onSelectRoute={onSelectRoute}
    onChangeTargets={setTargets}
    conversation={conversation} drainPendingChanges={drainPendingChanges} />;
}
function readyDocuments(content: WorkspaceContent): Record<string, string> {
  return Object.fromEntries(Object.entries(content.documents).flatMap(([path, resource]) =>
    resource.status === 'ready' ? [[path, resource.text]] : []));
}

/**
 * The confirmed route the walker is showing, plus the mastery that makes `a` known. The walker
 * takes its targets and `known` from the record, never from the live application state.
 */
async function createWalker(
  mastery: NonNullable<Parameters<typeof createMemoryLearnerRecords>[1]>['state'] = {
  concepts: { a: { status: 'complete', basis: 'a'.repeat(64), data: { selfReported: true } } },
  derivations: {},
}) {
  const record: RouteRecord = {
    id: 'r-aaaaaa', description: '走到 C', targets: ['c'], known: ['a'],
    basis: await routeBasis(workspace().graph, ['a', 'b', 'c', 'd1', 'd2']),
    conceptIds: ['a', 'b', 'c'], derivationIds: ['d1', 'd2'], order: ['d1', 'd2'], cost: 5,
  };
  return { store: createMemoryLearnerRecords('test-workspace', { routes: [record], state: mastery }).store, record };
}

async function render(over: Parameters<typeof Harness>[0] = {}) {
  root = createRoot(container);
  await act(async () => root?.render(<Harness {...over} />));
  // The solver answers on a microtask; the view only exists once it has.
  await act(async () => { await Promise.resolve(); });
}

async function renderContent(content: WorkspaceContent) {
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={content} />));
  await act(async () => { await Promise.resolve(); });
}

const click = (selector: string) => act(async () => {
  (container.querySelector(selector) as HTMLButtonElement | null)?.click();
});

it('puts the derivation in front of the definition, and keeps the definition behind a press', async () => {
  await render();
  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();
  expect(container.textContent).toContain('A → B');

  const frames = () => [...container.querySelectorAll('iframe')].map((frame) => frame.srcdoc).join('|');
  expect(frames()).toContain('第一步的推导正文');
  expect(frames()).not.toContain('B 的定义正文');

  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await expect.element(page.getByText('定义：B')).toBeVisible();
  expect(frames()).toContain('B 的定义正文');
});

it('generates the comprehension task from the route, and only moves on once it is answered', async () => {
  await render();
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();

  // The task is what the route uses this concept for, not a fixed prompt.
  expect(container.textContent).toContain('接下来的「C」为什么非得先有它不可');
  const submit = () => container.querySelector('.learning-task-actions .learning-primary') as HTMLButtonElement;
  expect(submit().disabled).toBe(true);
  // Nothing on the step waves the task through: an unanswered gate is the only state left.
  expect(container.querySelector('.learning-task')?.textContent).not.toContain('跳过');

  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('没有 B 就写不下 C。');
  await page.getByRole('button', { name: '交上去' }).click();
  // There is no “next” to press: the record is what moves the walk.
  await expect.element(page.getByText('第 2 / 2 步')).toBeVisible();
});

it('writes the handed-in verification as a judgement about the step’s concept', async () => {
  await render();
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('没有 B 就写不下 C。');
  await page.getByRole('button', { name: '交上去' }).click();

  const files = createMemoryObjectFiles(readyDocuments(workspace()));
  const basis = await objectMasteryBasis(workspace().graph, 'docs/b', 'b', files);
  // A complete record with neither source marker is a judgement; the answer itself is not kept.
  await expect.poll(() => walker.store.readLearningState().then((reading) =>
    reading.presence === 'present' ? reading.state.concepts.b : undefined)).toEqual({
    status: 'complete', basis,
  });
  // And the interface says so rather than showing it as the learner’s own word.
  await expect.element(page.getByText('判定')).toBeVisible();
});

it('shrinks from a record it cannot check, and says what is missing', async () => {
  walker = await createWalker({ concepts: { b: { status: 'complete', basis: 'b'.repeat(64) } }, derivations: {} });
  await render({ inventory: false });

  // The stored record is not silently counted: the step is still the one to do.
  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await expect.element(page.getByText(/算不出这一步所依据的内容版本/)).toBeVisible();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('没有 B 就写不下 C。');
  await page.getByRole('button', { name: '交上去' }).click();
  await expect.element(page.getByText('这个宿主列不出对象所属的文件，判定所依据的内容版本算不出来。')).toBeVisible();
});

it('walks to the end of the route and says how far along it is kept', async () => {
  await render();
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('第一步的答案。');
  await page.getByRole('button', { name: '交上去' }).click();
  await expect.element(page.getByText('第 2 / 2 步')).toBeVisible();

  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('第二步的答案。');
  await page.getByRole('button', { name: '交上去' }).click();

  await expect.element(page.getByText('这条路线走完了')).toBeVisible();
  expect(container.textContent).toContain('路线本身存在学习者记录里，走到哪一步也由它算出来');
});

it('lands on the same step after a workspace is reopened, because the records decide it', async () => {
  await render();
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('没有 B 就写不下 C。');
  await page.getByRole('button', { name: '交上去' }).click();
  await expect.element(page.getByText('第 2 / 2 步')).toBeVisible();

  // Closing and reopening: new component tree, same records. Nothing of the session is left.
  await act(async () => root?.unmount());
  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  await act(async () => { await Promise.resolve(); });
  await expect.element(page.getByText('第 2 / 2 步')).toBeVisible();
});

it('shows no completion at all when state.json is gone, and keeps the route readable', async () => {
  // routes.json alone: the route is intact and there is no mastery to mark it with.
  walker = { ...walker, store: createMemoryLearnerRecords('test-workspace', { routes: [walker.record] }).store };
  await render();

  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();
  expect(container.querySelector('.learning-rail-list svg')).toBeNull();
  expect(container.querySelector('.learning-rail-list li.is-done')).toBeNull();
});

it('starts at the first step the records do not already have, not at the top', async () => {
  const files = createMemoryObjectFiles(readyDocuments(workspace()));
  const basis = await objectMasteryBasis(workspace().graph, 'docs/b', 'b', files);
  walker = await createWalker({ concepts: { b: { status: 'complete', basis } }, derivations: {} });
  await render();

  await expect.element(page.getByText('第 2 / 2 步')).toBeVisible();
});

it('requires a changed document to be verified again without dropping unrelated progress', async () => {
  const first = workspace();
  const second = workspace({
    ...first.documents,
    'docs/b/document.md': { status: 'ready', text: '<main>B 的新定义正文</main>' },
  });
  await renderContent(first);
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('第一步的答案。');
  await page.getByRole('button', { name: '交上去' }).click();
  await expect.element(page.getByText('第 2 / 2 步')).toBeVisible();
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('第二步的答案。');
  await page.getByRole('button', { name: '交上去' }).click();
  await expect.element(page.getByText('这条路线走完了')).toBeVisible();

  await act(async () => root?.render(<Harness content={second} />));
  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();
  await expect.element(page.getByText('定义：B')).toBeVisible();
  expect(container.textContent).toContain('内容更新了');
  expect(container.querySelector('.learning-rail-list li:first-child svg')).toBeNull();
  // The later judgement is untouched: staleness on one object never reaches another.
  expect(container.querySelector('.learning-rail-list li:last-child svg')).not.toBeNull();
});

it('requires re-verification when the judged object’s own entry moves on, and not for an unrelated edit', async () => {
  const first = workspace();
  const judged = {
    ...first,
    graphText: `${first.graphText}\n`,
    graph: {
      ...first.graph,
      points: first.graph.points.map((point) => point.id === 'b'
        ? { ...point, data: { ...point.data, label: 'B（改名）' } }
        : point),
    },
  };
  // A change to some other part of the workspace is not part of this judgement’s basis.
  const unrelated = parseWorkspaceContent({
    graph: first.graphText.replace('路线工作区', '路线工作区 2'),
    documents: first.documents,
  });
  await renderContent(first);
  await page.getByRole('button', { name: '跟下来了，给我定义 ↓' }).click();
  await page.getByRole('textbox', { name: '理解验证的回答' }).fill('没有 B 就写不下 C。');
  await page.getByRole('button', { name: '交上去' }).click();
  await expect.element(page.getByText('第 2 / 2 步')).toBeVisible();

  await act(async () => root?.render(<Harness content={unrelated} />));
  await act(async () => { await Promise.resolve(); });
  expect(container.textContent, '工作区标题不是这份判定的依据').toContain('第 2 / 2 步');
  expect(container.textContent).not.toContain('内容更新了');

  await act(async () => root?.render(<Harness content={judged} />));
  await act(async () => { await Promise.resolve(); });
  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();
  expect(container.textContent).toContain('内容更新了');
  expect(container.querySelector('.learning-rail-list li:first-child svg')).toBeNull();
});

it('hides a side panel to a recall tab, and never lets the textbook lose width to both', async () => {
  await render();
  await click('.learning-rail button[aria-label="隐藏"]');
  await expect.element(page.getByRole('button', { name: '路线' })).toBeVisible();
  expect(container.querySelector('.learning-rail')).toBeNull();

  await page.getByRole('button', { name: '路线' }).click();
  await expect.element(page.getByText('折叠态 · 只排步骤')).toBeVisible();

  // Widening one side hides the other rather than squeezing the middle.
  await click('.learning-rail button[aria-label="展开子图"]');
  expect(container.querySelector('.learning-tutor')).toBeNull();
  expect(container.querySelector('.learning-route')?.className).toContain('rail-expanded');
});

it('holds the route being walked, so a later solve cannot renumber the steps', async () => {
  await render();
  expect(container.textContent).toContain('第 1 / 2 步');

  // Saying a step was already known records it — the next route will be shorter — but the
  // walk in progress keeps its numbering and simply moves on. Re-solving under the learner
  // would put them back at "第 1 / 1 步" of a route they never accepted.
  await click('.learning-text-actions button:nth-child(3)');
  await act(async () => { await Promise.resolve(); });
  expect(container.textContent).toContain('第 2 / 2 步');
  await expect.poll(() => container.querySelector('[data-learning-known]')?.getAttribute('data-learning-known')).toBe('a b');
  // The claim went into the learner record as a self-report, marked as one, and the rail
  // says so instead of showing it as a judgement the application made.
  await expect.poll(() => walker.store.readLearningState().then((reading) =>
    reading.presence === 'present' ? reading.state.concepts.b : undefined)).toMatchObject({
    status: 'complete', data: { selfReported: true },
  });
  await expect.element(page.getByText('自述')).toBeVisible();
});

it('reports a route whose graph moved on instead of blocking the walk', async () => {
  const initial = workspace();
  const changed = {
    ...initial,
    graphText: `${initial.graphText}\n`,
    graph: {
      ...initial.graph,
      hyperedges: initial.graph.hyperedges.map((edge) => edge.id === 'd2' ? { ...edge, weight: 4 } : edge),
    },
  };
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={initial} />));
  await act(async () => { await Promise.resolve(); });
  expect(container.textContent).toContain('第 1 / 2 步');

  await act(async () => root?.render(<Harness content={changed} />));
  await act(async () => { await Promise.resolve(); });
  await expect.element(page.getByRole('alert')).toBeVisible();
  expect(container.textContent).toContain('另一版图');
  // The route keeps being walked from its own record: reported, never repaired in place.
  expect(container.textContent).toContain('第 1 / 2 步');
});

it('keeps walking a route the graph has moved on from, and reports the mismatch instead of re-solving', async () => {
  const initial = workspace();
  const changed = {
    ...initial,
    graphText: `${initial.graphText}\n`,
    graph: {
      ...initial.graph,
      points: initial.graph.points.map((point) => point.id === 'b'
        ? { ...point, data: { ...point.data, label: 'Renamed B' } }
        : point),
    },
  };
  await renderContent(initial);
  await act(async () => root?.render(<Harness content={changed} />));
  await act(async () => { await Promise.resolve(); });

  await expect.element(page.getByText('第 1 / 2 步')).toBeVisible();
  await expect.element(page.getByText(/另一版图/)).toBeVisible();
});

it('keeps a route whose target is gone readable, and never replaces or drops it', async () => {
  const initial = workspace();
  const changed = {
    ...initial,
    graphText: `${initial.graphText}\n`,
    graph: {
      ...initial.graph,
      points: initial.graph.points.filter((point) => point.id !== 'c'),
      hyperedges: initial.graph.hyperedges.filter((edge) => edge.id !== 'd2'),
    },
  };
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={initial} />));
  await act(async () => { await Promise.resolve(); });
  await act(async () => root?.render(<Harness content={changed} />));
  await act(async () => { await Promise.resolve(); });

  // The record still holds its own order; the step the graph no longer has is simply not drawn.
  await expect.element(page.getByText(/另一版图/)).toBeVisible();
  await expect.element(page.getByText('第 1 / 1 步')).toBeVisible();
});

it('does not ask the host to solve again for content that parsed to the same graph', async () => {
  let solves = 0;
  const counting: RouteSolver = {
    solve: (graph, request) => { solves++; return fixtureRouteSolver().solve(graph, request); },
  };
  function Counted({ content }: { content: WorkspaceContent }) {
    const [targets, setTargets] = useState<readonly string[]>(['c']);
    const files = useMemo(() => createMemoryObjectFiles(readyDocuments(content)), [content]);
    return <LearningMode workspace={{ id: 'w', name: '路线工作区' }} content={content} active
      learnerRecords={walker.store} activeRouteId={walker.record.id}
      targetIds={targets} routeSolver={counting}
      readOwnedFiles={files.listOwnedFiles} readDocuments={files.readDocuments} readAsset={files.readAsset}
      view="route" onEnterView={vi.fn()} onConfirmRoute={vi.fn()} onSelectRoute={vi.fn()}
      onChangeTargets={setTargets} />;
  }
  root = createRoot(container);
  await act(async () => root?.render(<Counted content={workspace()} />));
  await act(async () => { await Promise.resolve(); });
  expect(solves).toBe(1);

  // Acquiring a document body hands the mode a new content object with the same manifest.
  await act(async () => root?.render(<Counted content={workspace()} />));
  await act(async () => { await Promise.resolve(); });
  expect(solves, '同一份清单不该再求一次路线').toBe(1);
});

it('brings back only the panel the learner asked for when both are put away', async () => {
  await render();
  await click('.learning-rail button[aria-label="隐藏"]');
  await click('.learning-tutor button[aria-label="隐藏"]');
  expect(container.querySelector('.learning-route')?.className).toContain('tutor-hidden');

  await page.getByRole('button', { name: '路线' }).click();
  await expect.element(page.getByText('折叠态 · 只排步骤')).toBeVisible();
  // The tutor was closed by hand, so nothing else gets to reopen it.
  expect(container.querySelector('.learning-tutor')).toBeNull();
  await expect.element(page.getByRole('button', { name: 'Agent 对话' })).toBeVisible();
});

it('draws the route subgraph with the learner\'s position on it, once the rail is widened', async () => {
  await render();
  await click('.learning-rail button[aria-label="展开子图"]');
  await expect.element(page.getByText('route 图')).toBeVisible();
  await expect.element(page.getByRole('button', { name: '图：B（current）' })).toBeVisible();
  await expect.element(page.getByRole('button', { name: '图：C（target）' })).toBeVisible();
});

it('offers an Agent window that answers from the graph and says plainly that no model is connected', async () => {
  await render();
  await page.getByRole('button', { name: '「A」是什么来着？' }).click();
  expect(container.textContent).toContain('它要么是已知的，要么是图里的起点');

  await page.getByRole('textbox', { name: 'Agent 消息' }).fill('这一步为什么成立？');
  await page.getByRole('button', { name: '发送消息' }).click();
  expect(container.textContent).toContain('未连接模型，没有生成任何讲解');
});

it('drains the workspace write-back queue on the learning side too, before the Agent reads', async () => {
  const order: string[] = [];
  const provider: ConversationProvider = {
    send: async () => { order.push('send'); },
    abort: async () => {}, newConversation: async () => {}, setWorkspace: async () => {},
    setModel: async () => {}, listModels: async () => ({ models: [], notices: [] }), subscribe: () => () => {},
  };
  await render({ conversation: provider, drainPendingChanges: async () => { order.push('drain'); } });

  await page.getByRole('textbox', { name: 'Agent 消息' }).fill('这一步为什么成立？');
  await page.getByRole('button', { name: '发送消息' }).click();

  // The learning session reads the same disk, so the same rule applies here.
  await expect.poll(() => order).toEqual(['drain', 'send']);
});
