import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { RouteSolver } from '../../ports/RouteSolver';
import {
  ORIENTATION_SCHEMA, WORKSPACE_SCHEMA, parseWorkspaceContent, updateOrientation,
  type OrientationConfig, type WorkspaceContent,
} from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view }: GraphRendererProps) => <div>已进入路线：{view.concepts.length} 个概念</div> }));
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
    schema: WORKSPACE_SCHEMA,
    document: { title: '开局工作区', description: '' },
    tags: [{ id: 'basics', label: '基础' }],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b', tags: ['basics'] } },
      { id: 'c', data: { label: 'C', document: 'docs/c' } },
      { id: 'd', data: { label: 'D', document: 'docs/d' } },
    ], hyperedges: [] },
  }), documents: {} });
}

const solver: RouteSolver = { solve: async () => ({
  reachable: true, conceptIds: ['a', 'd'], derivationIds: [], order: [], cost: 3, provenOptimal: true, blocked: [],
}) };

function render(content: WorkspaceContent, handlers: {
  onChangeTargets: (ids: readonly string[]) => void; onChangeKnown: (ids: readonly string[]) => void;
}) {
  root = createRoot(container);
  act(() => root?.render(<LearningMode workspace={{ id: 'w', name: '开局工作区' }} content={content}
    targetIds={[]} knownIds={[]} routeSolver={solver} {...handlers} />));
}

it('initializes a route from the seed and completes orientation without any conversation provider', async () => {
  const onChangeTargets = vi.fn();
  const onChangeKnown = vi.fn();
  render(updateOrientation(workspace(), CONFIG).content, { onChangeTargets, onChangeKnown });

  // The seed reaches application state before a question is answered.
  expect(onChangeTargets).toHaveBeenCalledWith(['c']);
  expect(onChangeKnown).toHaveBeenCalledWith(['a']);

  await page.getByRole('button', { name: '要看懂一篇论文' }).click();
  await page.getByRole('button', { name: '基础' }).click();
  await page.getByRole('button', { name: '继续' }).click();

  expect(onChangeTargets).toHaveBeenLastCalledWith(['d']);
  expect(onChangeKnown).toHaveBeenLastCalledWith(['a', 'b']);
  await expect.element(page.getByText('初始路线')).toBeVisible();
  await page.getByRole('button', { name: '进入路线' }).click();
  await expect.element(page.getByText('已进入路线')).toBeVisible();
});

it('falls back to the generic entry with a diagnosis when the configuration is broken', async () => {
  const base = workspace();
  const broken = parseWorkspaceContent({ graph: base.graphText, documents: base.documents,
    companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: JSON.stringify({
      ...CONFIG, seed: { targets: ['gone'], known: [] } }) } } });
  const onChangeTargets = vi.fn();
  render(broken, { onChangeTargets, onChangeKnown: vi.fn() });

  await expect.element(page.getByRole('alert')).toBeVisible();
  expect(container.textContent).toContain('已回到通用入口');
  expect(onChangeTargets).toHaveBeenCalledWith([]);
  const choice = [...container.querySelectorAll('ul[aria-label="目标概念"] button')]
    .find((button) => button.textContent?.startsWith('B'));
  await act(async () => (choice as HTMLButtonElement).click());
  expect(onChangeTargets).toHaveBeenLastCalledWith(['b']);
});
