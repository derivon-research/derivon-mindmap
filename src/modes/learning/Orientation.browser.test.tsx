import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { LearningModeProps } from '../../app/host';
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

type HarnessProps = Partial<LearningModeProps> & Pick<LearningModeProps, 'content'>;

/**
 * Targets and known concepts are application state, so the harness holds them the way
 * `App` does. A spy that swallowed the change would make the mode look broken.
 */
function Harness({ content, targetIds = [], knownIds = [], onChangeTargets, onChangeKnown, ...over }: HarnessProps) {
  const [targets, setTargets] = useState<readonly string[]>(targetIds);
  const [known, setKnown] = useState<readonly string[]>(knownIds);
  return <LearningMode workspace={{ id: 'w', name: '开局工作区' }} content={content} active
    targetIds={targets} knownIds={known} routeSolver={fixtureRouteSolver()}
    view="orientation" onEnterView={vi.fn()} onConfirmRoute={vi.fn()}
    onRouteInvalidated={vi.fn()}
    onChangeTargets={(ids) => { onChangeTargets?.(ids); setTargets(ids); }}
    onChangeKnown={(ids) => { onChangeKnown?.(ids); setKnown(ids); }}
    {...over} />;
}

it('seeds the run, walks the author\'s questions and reaches the route without a conversation provider', async () => {
  const onChangeTargets = vi.fn();
  const onChangeKnown = vi.fn();
  const onEnterView = vi.fn();
  const content = updateOrientation(workspace(), CONFIG).content;
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={content} onChangeTargets={onChangeTargets} onChangeKnown={onChangeKnown} onEnterView={onEnterView} />));

  // The seed reaches application state before a question is answered.
  expect(onChangeTargets).toHaveBeenCalledWith(['c']);
  expect(onChangeKnown).toHaveBeenCalledWith(['a']);

  await page.getByRole('button', { name: '要看懂一篇论文' }).click();
  await page.getByRole('button', { name: '基础' }).click();
  await page.getByRole('button', { name: '继续' }).click();

  expect(onChangeTargets).toHaveBeenLastCalledWith(['d']);
  expect(onChangeKnown).toHaveBeenLastCalledWith(['a', 'b']);
});

it('falls back to the generic entry with a diagnosis when the configuration is broken', async () => {
  const base = workspace();
  const broken = parseWorkspaceContent({ graph: base.graphText, documents: base.documents,
    companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: JSON.stringify({
      ...CONFIG, seed: { targets: ['gone'], known: [] } }) } } });
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={broken} />));

  await expect.element(page.getByRole('alert')).toBeVisible();
  expect(container.textContent).toContain('已回到通用入口');
  expect(container.textContent).toContain('想学会什么？');
});

it('offers what the graph builds towards, and records the target the learner picks', async () => {
  const onChangeTargets = vi.fn();
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={workspace()} onChangeTargets={onChangeTargets} />));

  // `d` is the only concept no derivation consumes, so it is the offered destination.
  await page.getByRole('button', { name: 'D', exact: true }).click();
  expect(onChangeTargets).toHaveBeenLastCalledWith(['d']);
});

it('opens a concept document from the search box without leaving the thread', async () => {
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={workspace()} />));

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
  const onChangeKnown = vi.fn();
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={workspace()} targetIds={['d']} onChangeKnown={onChangeKnown} />));

  await page.getByRole('button', { name: '就这一个，问我会什么吧' }).click();
  await expect.element(page.getByText('第 1 轮 · 会的点一下')).toBeVisible();
  // `b` is the premise the only route to `d` leans on, so it is worth asking about.
  await page.getByRole('button', { name: 'B', exact: true }).click();
  expect(onChangeKnown).toHaveBeenLastCalledWith(['b']);
});

it('takes a choice back, from the option that made it and from the list of what is known', async () => {
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={workspace()} targetIds={['d']} />));
  const known = () => container.querySelector('[data-learning-known]')?.getAttribute('data-learning-known');

  await page.getByRole('button', { name: '就这一个，问我会什么吧' }).click();
  await page.getByRole('button', { name: 'B', exact: true }).click();
  expect(known()).toBe('b');

  // The same option, pressed again, is the cancel: nothing else has to be found first.
  await page.getByRole('button', { name: 'B', exact: true }).click();
  expect(known()).toBe('');

  await page.getByRole('button', { name: 'B', exact: true }).click();
  await page.getByRole('button', { name: '取消已会 B' }).click();
  expect(known()).toBe('');
});

it('spends a round when it is asked, so nobody is asked the same thing twice', async () => {
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={workspace()} targetIds={['d']} />));

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
  root = createRoot(container);
  await act(async () => root?.render(<Harness content={workspace()} targetIds={['d']} knownIds={['a']} />));
  await expect.element(page.getByRole('button', { name: '图：D（target）' })).toBeVisible();
  await expect.element(page.getByRole('button', { name: '图：A（known）' })).toBeVisible();
  // The route is not painted onto the overview (ADR-0003): B is on the route but unmarked.
  await expect.element(page.getByRole('button', { name: '图：B' })).toBeVisible();
});
