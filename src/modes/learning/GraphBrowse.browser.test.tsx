import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { LearningModeProps } from '../../app/host';
import { WORKSPACE_SCHEMA, parseWorkspaceContent, type WorkspaceContent } from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view, onEvent }: GraphRendererProps) => <div>
  <span>{view.kind} 图 · {view.concepts.length} 个概念</span>
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

function workspace(): WorkspaceContent {
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA,
    document: { title: '浏览工作区', description: '' },
    tags: [{ id: 'basics', label: '基础' }],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b', tags: ['basics'] } },
      { id: 'c', data: { label: 'C', document: 'docs/c' } },
      { id: 'far', data: { label: '远处', document: 'docs/far' } },
    ], hyperedges: [
      { id: 'd1', weight: 1, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
      { id: 'd2', weight: 1, tails: ['b'], head: 'c', data: { document: 'docs/d2' } },
    ] },
  }), documents: { 'docs/b/document.md': { status: 'ready', text: '<main>B 的正文</main>' } } });
}

function Harness({ onEnterView = vi.fn() }: { onEnterView?: LearningModeProps['onEnterView'] }) {
  const [content] = useState(workspace);
  const [targets, setTargets] = useState<readonly string[]>([]);
  const [known, setKnown] = useState<readonly string[]>([]);
  return <LearningMode workspace={{ id: 'w', name: '浏览工作区' }} content={content} active
    targetIds={targets} knownIds={known}
    view="browse" onEnterView={onEnterView} onConfirmRoute={vi.fn()}
    onChangeTargets={setTargets} onChangeKnown={setKnown} />;
}

async function render(over: Parameters<typeof Harness>[0] = {}) {
  root = createRoot(container);
  await act(async () => root?.render(<Harness {...over} />));
}

it('draws the whole graph and reads a concept beside the map rather than on it', async () => {
  await render();
  await expect.element(page.getByText('overview 图 · 4 个概念')).toBeVisible();

  await page.getByRole('button', { name: '图：B' }).click();
  await expect.element(page.getByRole('complementary', { name: 'B 文档' })).toBeVisible();
  expect(container.querySelector<HTMLIFrameElement>('.learning-reader iframe')?.srcdoc).toContain('B 的正文');
  // The map stays alongside it: reading a concept does not close the thing being browsed.
  await expect.element(page.getByText('overview 图 · 4 个概念')).toBeVisible();
});

it('turns a page instead of stacking documents when another concept is opened', async () => {
  await render();
  await page.getByRole('button', { name: '图：B' }).click();
  await page.getByRole('button', { name: '图：C' }).click();

  await expect.element(page.getByRole('complementary', { name: 'C 文档' })).toBeVisible();
  expect(container.querySelectorAll('.learning-reader').length).toBe(1);
  expect(container.textContent).toContain('第 2 / 2 页');

  await page.getByRole('button', { name: '上一页' }).click();
  await expect.element(page.getByRole('complementary', { name: 'B 文档' })).toBeVisible();
  expect(container.textContent).toContain('第 1 / 2 页');

  // Reopening a concept already read returns to its page rather than adding another.
  await page.getByRole('button', { name: '图：C' }).click();
  expect(container.textContent).toContain('第 2 / 2 页');
});

it('narrows to one step around a concept instead of piling more onto the overview', async () => {
  await render();
  await page.getByRole('button', { name: '图：C' }).click();
  await page.getByRole('button', { name: '看关联 →' }).click();

  // `c` is derived from `b` alone, so the neighbourhood is exactly the two of them.
  await expect.element(page.getByText('neighbourhood 图 · 2 个概念')).toBeVisible();
  expect(container.textContent).toContain('C 附近');
  expect(container.textContent).not.toContain('远处');

  await page.getByRole('button', { name: '回到全图' }).click();
  await expect.element(page.getByText('overview 图 · 4 个概念')).toBeVisible();
});

it('moves the focus when the learner follows a link out of a neighbourhood', async () => {
  await render();
  await page.getByRole('button', { name: '图：C' }).click();
  await page.getByRole('button', { name: '看关联 →' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '图：B' }).click();

  expect(container.querySelector('.learning-browse')?.getAttribute('data-browse-focus')).toBe('b');
  // `b` sits between `a` and `c`, so following it widens to three rather than staying at two.
  await expect.element(page.getByText('neighbourhood 图 · 3 个概念')).toBeVisible();
});

it('finds a concept by name without needing it on screen first', async () => {
  await render();
  await page.getByRole('textbox', { name: '搜索概念' }).fill('远');
  await page.getByRole('button', { name: '远处', exact: true }).click();
  await expect.element(page.getByRole('complementary', { name: '远处 文档' })).toBeVisible();
});

it('sends the learner back to settle the run when a target is set from here', async () => {
  const onEnterView = vi.fn();
  await render({ onEnterView });
  await page.getByRole('button', { name: '图：C' }).click();
  await page.getByRole('button', { name: '加进目标' }).click();

  expect(onEnterView).toHaveBeenLastCalledWith('orientation');
  expect(container.querySelector('[data-derivon-mode="learning"]')?.getAttribute('data-learning-targets')).toBe('c');
});

it('marks what the learner knows on the map, and lets them take it back', async () => {
  await render();
  await page.getByRole('button', { name: '图：A' }).click();
  await page.getByRole('button', { name: '这个我会' }).click();

  await expect.element(page.getByRole('button', { name: '图：A（known,selected）' })).toBeVisible();

  await page.getByRole('button', { name: '其实我不会' }).click();
  await expect.element(page.getByRole('button', { name: '图：A（selected）' })).toBeVisible();
  expect(container.querySelector('[data-derivon-mode="learning"]')?.getAttribute('data-learning-known')).toBe('');
});
