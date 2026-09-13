import { act, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { LearningModeProps } from '../../app/host';
import { createMemoryLearnerRecords, type MemoryLearnerRecords } from '../../testing/learnerRecordStore';
import { createMemoryObjectFiles } from '../../testing/memoryObjectFiles';
import { fixtureRouteSolver } from '../../testing/routeSolver';
import {
  ORIENTATION_SCHEMA, WORKSPACE_SCHEMA, parseWorkspaceContent, updateOrientation,
  type OrientationConfig, type WorkspaceContent,
} from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view, onEvent }: GraphRendererProps) => <div>
  <span>图上 {view.concepts.length} 个概念</span>
  {view.concepts.map((concept) => <button key={concept.id} type="button"
    onClick={() => onEvent({ type: 'select', object: { kind: 'concept', id: concept.id } })}>
    图：{concept.label}{concept.marks.length ? `（${concept.marks.join(',')}）` : ''}
  </button>)}
</div> }));
import { LearningMode } from './LearningMode';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

const CONFIG: OrientationConfig = {
  schema: ORIENTATION_SCHEMA,
  seed: { targets: ['c'], known: ['a'] },
  questions: [
    { id: 'why', prompt: '你为什么来', select: 'one', options: [
      { id: 'paper', label: '要看懂一篇论文', actions: [{ op: 'set-targets', points: ['d'] }], next: 'known' },
    ] },
    { id: 'known', prompt: '会哪些', select: 'many', next: 'finish', options: [
      { id: 'basics', label: '基础', actions: [{ op: 'add-known', tags: ['basics'] }] },
    ] },
  ],
};

function workspace(): WorkspaceContent {
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA, id: 'test-workspace',
    document: { title: '开局工作区', description: '' },
    tags: [{ id: 'basics', label: '基础' }],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b', tags: ['basics'] } },
      { id: 'c', data: { label: 'C', document: 'docs/c' } },
      { id: 'd', data: { label: 'D', document: 'docs/d' } },
    ], hyperedges: [
      { id: 'ab', weight: 1, tails: ['a'], head: 'b', data: { document: 'docs/ab' } },
      { id: 'bd', weight: 1, tails: ['b'], head: 'd', data: { document: 'docs/bd' } },
    ] },
  }), documents: { 'docs/d/document.md': { status: 'ready', text: '<main>D body</main>' } } });
}

type HarnessProps = Omit<Partial<LearningModeProps>, 'learnerRecords'> & {
  readonly content: WorkspaceContent;
  readonly records: MemoryLearnerRecords;
};

/**
 * Targets are application state, so the harness holds them the way `App` does. Known is not:
 * it comes from the learner record store, which the harness also holds.
 */
function Harness({ content, records, targetIds = [], onChangeTargets, ...over }: HarnessProps) {
  const [targets, setTargets] = useState<readonly string[]>(targetIds);
  const files = useMemo(() => createMemoryObjectFiles({
    'docs/a/document.md': 'A body', 'docs/b/document.md': 'B body',
    'docs/c/document.md': 'C body', 'docs/d/document.md': '<main>D body</main>',
  }), []);
  return <LearningMode workspace={{ id: 'w', name: '开局工作区' }} content={content} active
    learnerRecords={records.store}
    targetIds={targets} routeSolver={fixtureRouteSolver()}
    readOwnedFiles={files.listOwnedFiles} readDocuments={files.readDocuments} readAsset={files.readAsset}
    view="orientation" onEnterView={vi.fn()} onConfirmRoute={vi.fn()}
    onSelectRoute={vi.fn()} activeRouteId={null}
    onChangeTargets={(ids) => { onChangeTargets?.(ids); setTargets(ids); }}
    {...over} />;
}

function memoryRecords(knownIds: readonly string[] = []): MemoryLearnerRecords {
  return createMemoryLearnerRecords('test-workspace', knownIds.length ? {
    state: {
      concepts: Object.fromEntries(knownIds.map((id) =>
        [id, { status: 'complete' as const, basis: 'a'.repeat(64), data: { selfReported: true } }])),
      derivations: {},
    },
  } : {});
}

async function render(over: Omit<HarnessProps, 'content' | 'records'> & { content?: WorkspaceContent; records?: MemoryLearnerRecords }) {
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={over.content ?? workspace()} records={over.records ?? memoryRecords()} {...over} />));
  await act(async () => { await Promise.resolve(); });
}

/** What `state.json` holds right now: the concepts the learner's own claim put there. */
const reported = (records: MemoryLearnerRecords) =>
  Object.keys((JSON.parse(records.stateText() ?? '{"concepts":{}}') as { concepts: Record<string, unknown> }).concepts).sort();

it('seeds the run, walks the author\'s questions and reaches the route without a conversation provider', async () => {
  const onChangeTargets = vi.fn();
  const records = memoryRecords();
  await render({ content: updateOrientation(workspace(), CONFIG).content, records, onChangeTargets });

  // The seed's default known is a workspace default, written before a question is answered —
  // and marked as a default, because the learner never said it.
  expect(onChangeTargets).toHaveBeenCalledWith(['c']);
  await expect.poll(() => reported(records)).toEqual(['a']);
  expect(records.stateText()).toContain('"orientationSeed": true');
  expect(records.stateText()).not.toContain('"selfReported": true');

  await page.getByRole('button', { name: '要看懂一篇论文' }).click();
  await page.getByRole('button', { name: '基础' }).click();
  await page.getByRole('button', { name: '继续' }).click();

  expect(onChangeTargets).toHaveBeenLastCalledWith(['d']);
  await expect.poll(() => reported(records)).toEqual(['a', 'b']);
});

it('falls back to the generic entry with a diagnosis when the configuration is broken', async () => {
  const base = workspace();
  const broken = parseWorkspaceContent({ graph: base.graphText, documents: base.documents,
    companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: JSON.stringify({
      ...CONFIG, seed: { targets: ['gone'], known: [] } }) } } });
  await render({ content: broken });

  await expect.element(page.getByRole('alert')).toBeVisible();
  expect(container.textContent).toContain('已回到通用入口');
  expect(container.textContent).toContain('想学会什么？');
});

it('offers what the graph builds towards, and records the target the learner picks', async () => {
  const onChangeTargets = vi.fn();
  await render({ onChangeTargets });

  // `d` is the only concept no derivation consumes, so it is the offered destination.
  await page.getByRole('button', { name: 'D', exact: true }).click();
  expect(onChangeTargets).toHaveBeenLastCalledWith(['d']);
});

it('opens a concept document from the search box without leaving the thread', async () => {
  await render({});

  await page.getByRole('textbox', { name: '说出你想学会什么，或搜索一个概念' }).fill('D');
  await page.getByRole('button', { name: '发送' }).click();

  await expect.element(page.getByText('的文档在这儿')).toBeVisible();
  // The document is read at full size beside the thread, not folded into it.
  await expect.element(page.getByRole('complementary', { name: 'D 文档' })).toBeVisible();
  expect(container.querySelector<HTMLIFrameElement>('.learning-reader iframe')?.srcdoc).toContain('D body');
  expect(container.querySelector('.learning-thread .learning-reader')).toBeNull();

  // Closing keeps the thread's reference to it, so it can be reopened without searching again.
  await page.getByRole('button', { name: '回到图' }).click();
  expect(container.querySelector('.learning-reader')).toBeNull();
  await page.getByRole('button', { name: '「D」的文档 在右边展开 →' }).click();
  await expect.element(page.getByRole('complementary', { name: 'D 文档' })).toBeVisible();
});

it('probes with the concepts the route leans on, and marks what the learner says they know', async () => {
  const records = memoryRecords();
  await render({ records, targetIds: ['d'] });

  await page.getByRole('button', { name: '就这一个，问我会什么吧' }).click();
  await expect.element(page.getByText('第 1 轮 · 会的点一下')).toBeVisible();
  // `b` is the premise the only route to `d` leans on, so it is worth asking about.
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await expect.poll(() => reported(records)).toEqual(['b']);
  expect(records.stateText()).toContain('"selfReported": true');
});

it('takes a choice back, from the option that made it and from the list of what is known', async () => {
  const records = memoryRecords();
  await render({ records, targetIds: ['d'] });
  const known = () => container.querySelector('[data-learning-known]')?.getAttribute('data-learning-known');

  await page.getByRole('button', { name: '就这一个，问我会什么吧' }).click();
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await expect.poll(known).toBe('b');

  // The same option, pressed again, is the cancel: nothing else has to be found first.
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await expect.poll(known).toBe('');

  await page.getByRole('button', { name: 'B', exact: true }).click();
  await page.getByRole('button', { name: '取消已会 B' }).click();
  await expect.poll(known).toBe('');
});

it('spends a round when it is asked, so nobody is asked the same thing twice', async () => {
  await render({ targetIds: ['d'] });

  await page.getByRole('button', { name: '就这一个，问我会什么吧' }).click();
  await expect.element(page.getByText('第 1 轮 · 会的点一下')).toBeVisible();
  // The round counts the moment it is shown: leaving without answering still spent it.
  expect(container.querySelector('[data-orientation-round]')?.getAttribute('data-orientation-round')).toBe('1');
  expect(container.textContent).toContain('问过 1 轮');

  // This route only leans on those concepts, so a second round has nothing left to ask.
  await page.getByRole('button', { name: '再问我一轮，路线会更准' }).click();
  await expect.element(page.getByText('没有更值得问的了')).toBeVisible();
});

it('marks the learner\'s own choices on the overview, and nothing else', async () => {
  await render({ targetIds: ['d'], records: memoryRecords(['a']) });
  await expect.element(page.getByRole('button', { name: '图：D（target）' })).toBeVisible();
  await expect.element(page.getByRole('button', { name: '图：A（known）' })).toBeVisible();
  // The route is not painted onto the overview (ADR-0003): B is on the route but unmarked.
  await expect.element(page.getByRole('button', { name: '图：B' })).toBeVisible();
});

it('says where a known concept came from, so a self-report is not read as a judgement', async () => {
  await render({ targetIds: ['d'], records: memoryRecords(['a']) });

  await page.getByRole('button', { name: '图：A（known）' }).click();
  await expect.element(page.getByText('自述：我会了')).toBeVisible();
  await expect.element(page.getByText('其实我不会')).toBeVisible();
});

it('says the workspace default is a default, not the learner\'s own claim', async () => {
  await render({ content: updateOrientation(workspace(), CONFIG).content, records: memoryRecords() });

  await page.getByRole('button', { name: '图：A（known）' }).click();
  await expect.element(page.getByText('默认已知：工作区给的起点')).toBeVisible();
  expect(container.textContent).not.toContain('自述：我会了');
});

it('reports a mastery record whose concept is gone instead of feeding it to the solve', async () => {
  const records = createMemoryLearnerRecords('test-workspace', { state: {
    concepts: {
      a: { status: 'complete', basis: 'a'.repeat(64), data: { selfReported: true } },
      'c-gone': { status: 'complete', basis: 'a'.repeat(64), data: { selfReported: true } },
    },
    derivations: {},
  } });
  await render({ targetIds: ['d'], records });

  // The orphan is reported and retained, and the run's known set — what a solve is given — is
  // only what the graph still has.
  await expect.element(page.getByText(/指向已经不在图里的概念/)).toBeVisible();
  expect(container.querySelector('[data-derivon-mode="learning"]')?.getAttribute('data-learning-known')).toBe('a');
});
