import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../rendering';
import type { RouteSolver } from '../ports/RouteSolver';
import { fixtureRouteSolver } from '../testing/routeSolver';
import {
  WORKSPACE_SCHEMA, newRoute, parseWorkspaceContent, serializeRoute, type Route, type WorkspaceContent,
} from '../workspace/index';

vi.mock('../rendering', () => ({ GraphRenderer: ({ view }: GraphRendererProps) => <div>路线子图 {view.concepts.length} 个概念</div> }));
import { RouteEditor, sameRoute, type RouteEditorProps } from './RouteEditor';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

/** A → B two ways, B → C, C → D, and a detour A → X. */
function workspace(): WorkspaceContent {
  const point = (id: string, label: string) => ({ id, data: { label, document: `docs/${id}` } });
  const edge = (id: string, tails: string[], head: string, weight: number) => ({ id, weight, tails, head, data: { document: `docs/${id}` } });
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA, id: 'test-workspace',
    document: { title: '路线工作区', description: '' },
    graph: {
      points: [point('a', '集合'), point('b', '向量空间'), point('c', '子空间'), point('d', '维数'), point('x', '绕路')],
      hyperedges: [
        edge('h-ab', ['a'], 'b', 1), edge('h-ab2', ['a', 'x'], 'b', 2), edge('h-bc', ['b'], 'c', 1),
        edge('h-cd', ['c'], 'd', 1), edge('h-ax', ['a'], 'x', 1),
      ],
    },
  }), documents: {} });
}

/**
 * A caller as either mode would be: it owns the draft and the saved route, and decides what
 * saving does — here, writing the canonical text of a workspace route.
 */
function harness(options: { route?: Route; saved?: Route | null; routeSolver?: RouteSolver | null; readOnly?: boolean;
  save?: RouteEditorProps['onSave'] } = {}) {
  const content = workspace();
  const written: string[] = [];
  const onDelete = vi.fn();
  const start = options.route ?? newRoute('r-222222', { label: '新路线', known: ['a'], targets: [] });
  function Caller() {
    const [saved, setSaved] = useState<Route | null>(options.saved === undefined ? null : options.saved);
    const [draft, setDraft] = useState<Route>(start);
    const editing = options.readOnly ? {} : {
      onChange: setDraft,
      onSave: options.save ?? ((route: Route) => { written.push(serializeRoute(route, 'workspace')); setSaved(route); }),
      onDiscard: () => setDraft(saved ?? start),
      onDelete,
    };
    return <RouteEditor active graph={content.graph} tags={content.tags} route={draft} dirty={!sameRoute(draft, saved)}
      routeSolver={options.routeSolver === null ? undefined : options.routeSolver ?? fixtureRouteSolver()}
      deletePrompt="删除这条工作区路线？" {...editing} />;
  }
  root = createRoot(container);
  act(() => root!.render(<Caller />));
  return { written, onDelete };
}

const button = (name: string | RegExp) => page.getByRole('button', { name });
const steps = () => [...container.querySelectorAll('ol[aria-label="路线步骤"] > li strong')].map((node) => node.textContent);
const pickTarget = async (label: string) => {
  const choice = [...container.querySelectorAll('ul[aria-label="目标"] button')]
    .find((candidate) => candidate.textContent?.startsWith(label)) as HTMLButtonElement;
  await act(async () => choice.click());
};

it('drafts a new route from the solver, keeps an unfinished route unsaveable, and saves the canonical file', async () => {
  const { written } = harness();
  await expect.element(button('按目标与已知重新求初稿')).toBeDisabled();
  expect(container.textContent).toContain('路线至少要有一个目标');
  await expect.element(button('保存')).toBeDisabled();

  await pickTarget('维数');
  await button('按目标与已知重新求初稿').click();
  await expect.poll(steps).toEqual(['向量空间', '子空间', '维数']);
  expect(container.textContent).toContain('顺序：现算');
  expect(container.textContent).toContain('3 步 · 成本 3');
  await expect.element(page.getByText('路线子图 4 个概念')).toBeVisible();

  await page.getByRole('textbox', { name: '路线名称' }).fill('按子空间走到维数');
  await page.getByRole('textbox', { name: '路线说明' }).fill('先讲子空间。');
  await button('保存').click();
  await expect.poll(() => written.length).toBe(1);
  expect(JSON.parse(written[0])).toEqual({
    schema: 'derivon.route/v1', id: 'r-222222', label: '按子空间走到维数', description: '先讲子空间。',
    known: ['a'], targets: ['d'], steps: ['h-ab', 'h-bc', 'h-cd'], ordered: false,
  });
  // Saved and unchanged: nothing to save or discard.
  await expect.element(button('保存')).toBeDisabled();
  expect([...container.querySelectorAll('button')].map((node) => node.textContent)).not.toContain('放弃更改');
});

const solved: Route = { ...newRoute('r-333333', { label: '走到维数', known: ['a'], targets: ['d'] }), steps: ['h-ab', 'h-bc', 'h-cd'] };

it('shows a gap where a removed step leaves one, and fills it with one click', async () => {
  const { written } = harness({ route: solved, saved: solved });
  await button('去掉第 2 步').click();
  expect(steps()).toEqual(['向量空间', '维数']);
  const problems = page.getByRole('region', { name: '路线问题' });
  await expect.element(problems).toHaveTextContent('目标「维数」到不了：缺「子空间」');
  await expect.element(problems).toHaveTextContent('缺「子空间」：第 2 步「维数」要用它');
  expect(container.textContent).toContain('1 个错误，修好之前不能保存');
  await expect.element(button('保存')).toBeDisabled();

  await button('补上 向量空间 ⇒ 子空间').click();
  expect(container.querySelector('[aria-label="路线问题"]')).toBeNull();
  await button('保存').click();
  await expect.poll(() => written.length).toBe(1);
});

it('swaps a step for its parallel derivation in place, and reports what the swap now needs', async () => {
  harness({ route: solved, saved: solved });
  await act(async () => {
    const select = page.getByRole('combobox', { name: '换掉第 1 步的推导' }).element() as HTMLSelectElement;
    select.value = 'h-ab2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const first = page.getByRole('listitem', { name: '第 1 步：向量空间' });
  await expect.element(first).toHaveTextContent('需要 集合 + 绕路');
  // The swapped-in derivation needs a concept nothing gives: the gap names the step and its fix.
  await expect.element(page.getByRole('region', { name: '路线问题' })).toHaveTextContent('缺「绕路」');

  await button('补上 集合 ⇒ 绕路').click();
  expect(steps()).toEqual(['绕路', '向量空间', '子空间', '维数']);
  await expect.element(button('保存')).toBeEnabled();
});

it('offers only the parallel derivations that are not already steps', async () => {
  const both: Route = { ...solved, steps: ['h-ab', 'h-ab2', 'h-ax', 'h-bc', 'h-cd'] };
  harness({ route: both, saved: both });
  expect(page.getByRole('combobox', { name: /换掉第 \d 步的推导/ }).elements()).toHaveLength(0);
  await expect.element(page.getByRole('listitem', { name: '第 1 步：向量空间' })).toHaveTextContent('有 1 种平行推导');
});

it('asks before a new draft replaces steps the author changed, and not before replacing an untouched draft', async () => {
  harness({ route: solved, saved: solved });
  await button('去掉第 3 步').click();
  await button('按目标与已知重新求初稿').click();
  const question = page.getByRole('group', { name: '确认重新求初稿' });
  await expect.element(question).toHaveTextContent('对步骤的改动都会丢掉');
  await button('算了').click();
  expect(steps()).toEqual(['向量空间', '子空间']);

  await button('按目标与已知重新求初稿').click();
  await button('丢掉改动，重新求初稿').click();
  await expect.poll(steps).toEqual(['向量空间', '子空间', '维数']);

  // The draft the solver just gave is untouched: drafting again loses nothing and asks nothing.
  await button('按目标与已知重新求初稿').click();
  expect(page.getByRole('group', { name: '确认重新求初稿' }).elements()).toHaveLength(0);
});

it('writes the order down when a step moves, refuses an order that cannot be walked, and returns to the computed order', async () => {
  harness({ route: solved, saved: solved });
  expect(container.textContent).toContain('顺序：现算');
  await button('下移第 1 步').click();
  expect(steps()).toEqual(['子空间', '向量空间', '维数']);
  expect(container.textContent).toContain('顺序：已写定');
  await expect.element(page.getByRole('listitem', { name: '第 1 步：子空间' }))
    .toHaveTextContent('第 1 步「子空间」要用「向量空间」，它在第 2 步才得到。');
  await expect.element(button('保存')).toBeDisabled();

  await button('改回现算').click();
  expect(steps()).toEqual(['向量空间', '子空间', '维数']);
  expect(container.textContent).toContain('顺序：现算');
  await expect.element(button('保存')).toBeEnabled();
  await button('放弃更改').click();
  await expect.element(button('保存')).toBeDisabled();
});

it('adds a step by searching conclusions, with the ones that can fire now first', async () => {
  harness({ route: solved, saved: solved });
  await page.getByRole('textbox', { name: '加一步' }).fill('绕');
  const offered = page.getByRole('list', { name: '可加的推导' });
  await expect.element(offered).toHaveTextContent('绕路需要 集合 · 现在就能走');
  await offered.getByRole('button', { name: /^绕路/ }).click();
  expect(steps()).toEqual(['向量空间', '子空间', '维数', '绕路']);
  // A detour is a warning: shown on its row, and it does not stop a save.
  await expect.element(page.getByRole('listitem', { name: '第 4 步：绕路' })).toHaveTextContent('不通往任何目标');
  await expect.element(button('保存')).toBeEnabled();
});

it('says so when the host has no solver, and starts from empty steps', async () => {
  harness({ routeSolver: null });
  expect(container.textContent).toContain('这里没有求解器');
  expect(container.textContent).toContain('还没有步骤');
  expect([...container.querySelectorAll('button')].some((node) => node.textContent?.includes('求初稿'))).toBe(false);
});

it('asks twice before deleting, and shows a failed save without losing the draft', async () => {
  const { onDelete } = harness({ route: solved, saved: solved, save: () => { throw new Error('磁盘满了'); } });
  await button('删除路线').click();
  await expect.element(page.getByRole('group', { name: '确认删除路线' })).toHaveTextContent('删除这条工作区路线？');
  await button('算了').click();
  expect(onDelete).not.toHaveBeenCalled();
  await button('删除路线').click();
  await button('删除').click();
  expect(onDelete).toHaveBeenCalledOnce();

  await button('去掉第 3 步').click();
  await pickTarget('子空间');
  await pickTarget('维数');
  await button('保存').click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('磁盘满了');
  expect(steps()).toEqual(['向量空间', '子空间']);
});

it('is a read-only view when the caller passes no edit callbacks', async () => {
  harness({ route: { ...solved, description: '作者的讲法' }, saved: solved, readOnly: true });
  await expect.element(page.getByRole('heading', { name: '走到维数' })).toBeVisible();
  expect(container.textContent).toContain('作者的讲法');
  expect(steps()).toEqual(['向量空间', '子空间', '维数']);
  expect(container.textContent).toContain('有 1 种平行推导');
  expect(container.querySelectorAll('input, select').length).toBe(0);
  expect([...container.querySelectorAll('button')].map((node) => node.textContent)).toEqual([]);
});
