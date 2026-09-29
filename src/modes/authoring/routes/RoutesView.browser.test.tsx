import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../../rendering';
import { openWorkspaceSession, type WorkspaceSession } from '../../../synchronization';
import { createMemoryWorkspaceSource, type MemoryWorkspace } from '../../../testing/memoryWorkspaceSource';
import { fixtureRouteSolver } from '../../../testing/routeSolver';
import { WORKSPACE_SCHEMA } from '../../../workspace/index';

vi.mock('../../../rendering', () => ({ GraphRenderer: ({ view }: GraphRendererProps) => <div>路线子图 {view.concepts.length} 个概念</div> }));
import { AuthoringMode } from '../AuthoringMode';

let container: HTMLDivElement;
let root: Root | undefined;
let session: WorkspaceSession | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  session?.dispose();
  root = undefined; session = undefined;
  container.remove(); vi.restoreAllMocks();
});

/** A → B two ways, B → C, C → D, and a detour A → X. */
const GRAPH = JSON.stringify({
  schema: WORKSPACE_SCHEMA, id: 'test-workspace',
  document: { title: '路线工作区', description: '' },
  graph: {
    points: [['a', '集合'], ['b', '向量空间'], ['c', '子空间'], ['d', '维数'], ['x', '绕路']]
      .map(([id, label]) => ({ id, data: { label, document: `docs/${id}` } })),
    hyperedges: [['h-ab', ['a'], 'b', 1], ['h-ab2', ['a', 'x'], 'b', 2], ['h-bc', ['b'], 'c', 1], ['h-cd', ['c'], 'd', 1], ['h-ax', ['a'], 'x', 1]]
      .map(([id, tails, head, weight]) => ({ id, weight, tails, head, data: { document: `docs/${id}` } })),
  },
}, null, 2);

const routeFile = (route: object) => JSON.stringify({ schema: 'derivon.route/v1', ordered: false, ...route }, null, 2);

/**
 * The authoring mode over a real session on an in-memory workspace: every save and delete is
 * a content operation that reaches the workspace's disk as a commit.
 */
async function open(companionMetadata: Record<string, string> = {}): Promise<MemoryWorkspace> {
  const memory = createMemoryWorkspaceSource(GRAPH, { companionMetadata });
  session = await openWorkspaceSession(memory.source, { authoring: memory.source, autosaveDelayMs: 0 });
  const current = session;
  const solver = fixtureRouteSolver();
  function Mode() {
    const snapshot = useSyncExternalStore(current.reader.subscribe, current.reader.getSnapshot);
    return <AuthoringMode active workspace={{ id: 'w', name: '路线工作区' }} content={snapshot.content}
      authoring={current.authoring} routeSolver={solver} selectedConceptId={null} onSelectConcept={() => {}} />;
  }
  root = createRoot(container);
  await act(async () => root!.render(<Mode />));
  await page.getByRole('group', { name: '创作视图' }).getByRole('button', { name: '路线', exact: true }).click();
  const expand = container.querySelector('button[aria-label="展开上下文区"]') as HTMLButtonElement | null;
  if (expand) await act(async () => expand.click());
  return memory;
}

const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });
const list = () => page.getByRole('list', { name: '工作区路线' });
const steps = () => [...container.querySelectorAll('ol[aria-label="路线步骤"] > li strong')].map((node) => node.textContent);
const pick = async (picker: '目标' | '已知', label: string) => {
  const choice = [...container.querySelectorAll(`ul[aria-label="${picker}"] button`)]
    .find((candidate) => candidate.textContent?.startsWith(label)) as HTMLButtonElement;
  await act(async () => choice.click());
};
const chooseParallel = (position: number, derivationId: string) => act(async () => {
  const select = page.getByRole('combobox', { name: `换掉第 ${position} 步的推导` }).element() as HTMLSelectElement;
  select.value = derivationId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
/** The route files the workspace's disk now holds. */
const routeFiles = (memory: MemoryWorkspace) => [...memory.files.keys()].filter((path) => path.startsWith('.derivon/routes/'));

it('creates a route from a solved draft, edits it in a protected draft, and commits it as its own file', async () => {
  const memory = await open();
  expect(container.textContent).toContain('这个工作区还没有路线');
  await button('新建路线').first().click();
  await expect.element(list()).toHaveTextContent('新建未保存');
  expect(session!.reader.getSnapshot().hasDrafts).toBe(true);

  await pick('已知', '集合');
  await pick('目标', '维数');
  await button('按目标与已知重新求初稿').click();
  await expect.poll(steps).toEqual(['向量空间', '子空间', '维数']);
  await page.getByRole('textbox', { name: '路线名称' }).fill('按子空间走到维数');

  // A parallel derivation that needs a concept nothing gives opens a gap; 补上 closes it.
  await chooseParallel(1, 'h-ab2');
  await expect.element(page.getByRole('region', { name: '路线问题' })).toHaveTextContent('缺「绕路」');
  await expect.element(list()).toHaveTextContent('1 个错误');
  await expect.element(button('保存')).toBeDisabled();
  await button('补上 集合 ⇒ 绕路').click();
  expect(steps()).toEqual(['绕路', '向量空间', '子空间', '维数']);

  // Moving a step before what it needs writes the order down, and that order refuses a save.
  await button('下移第 2 步').click();
  expect(container.textContent).toContain('顺序：已写定');
  await expect.element(page.getByRole('listitem', { name: '第 2 步：子空间' })).toHaveTextContent('要用「向量空间」');
  await expect.element(button('保存')).toBeDisabled();
  expect(routeFiles(memory)).toEqual([]);
  await button('改回现算').click();

  // Switching views keeps the draft.
  await page.getByRole('button', { name: '图浏览' }).click();
  await page.getByRole('group', { name: '创作视图' }).getByRole('button', { name: '路线', exact: true }).click();
  expect(steps()).toEqual(['绕路', '向量空间', '子空间', '维数']);

  await button('保存').click();
  await expect.poll(() => routeFiles(memory)).toHaveLength(1);
  const [path] = routeFiles(memory);
  expect(path).toMatch(/^\.derivon\/routes\/r-[a-z0-9]+\.json$/);
  const id = path.slice('.derivon/routes/'.length, -'.json'.length);
  expect(memory.commits.at(-1)).toEqual({ companionMetadata: [{ path, content: memory.files.get(path) }] });
  const written = JSON.parse(memory.files.get(path)!);
  expect({ ...written, steps: [...written.steps].sort() }).toEqual({
    schema: 'derivon.route/v1', id, label: '按子空间走到维数', known: ['a'], targets: ['d'],
    steps: ['h-ab2', 'h-ax', 'h-bc', 'h-cd'], ordered: false,
  });
  await expect.element(list()).toHaveTextContent('按子空间走到维数4 步 · 成本 5 · 现算');
  expect(list().element().textContent).not.toContain('未保存');
  expect(session!.reader.getSnapshot().hasDrafts).toBe(false);
});

it('discards unsaved edits, and deletes a route by removing its file', async () => {
  const memory = await open({ '.derivon/routes/r-aaaaaa.json': routeFile({
    id: 'r-aaaaaa', label: '走到维数', known: ['a'], targets: ['d'], steps: ['h-ab', 'h-bc', 'h-cd'] }) });
  await expect.element(list()).toHaveTextContent('走到维数3 步 · 成本 3 · 现算');
  await button(/^走到维数/).click();

  await button('去掉第 2 步').click();
  await expect.element(list()).toHaveTextContent('未保存');
  expect(session!.reader.getSnapshot().hasDrafts).toBe(true);
  await button('放弃更改').click();
  expect(steps()).toEqual(['向量空间', '子空间', '维数']);
  expect(session!.reader.getSnapshot().hasDrafts).toBe(false);

  await button('删除路线').click();
  await button('删除').click();
  await expect.poll(() => routeFiles(memory)).toEqual([]);
  expect(memory.commits.at(-1)).toEqual({ companionMetadata: [{ path: '.derivon/routes/r-aaaaaa.json', content: null }] });
  expect(container.textContent).toContain('这个工作区还没有路线');
});

it('lists a route that no longer fits the graph, and one that cannot be read, with their diagnosis', async () => {
  const memory = await open({
    '.derivon/routes/r-bbbbbb.json': routeFile({ id: 'r-bbbbbb', label: '断了的路线', known: ['a'], targets: ['d'], steps: ['h-ab', 'h-cd'] }),
    '.derivon/routes/r-cccccc.json': '{ not json',
  });
  const rows = list();
  await expect.element(rows).toHaveTextContent('断了的路线');
  await expect.element(rows).toHaveTextContent('无效 · 1 个错误');
  await expect.element(rows).toHaveTextContent('路线「断了的路线」有 1 处错误');
  await expect.element(rows).toHaveTextContent('未命名路线文件读不出来无效');

  // Opening the broken route shows it as it is, with the fix on offer; nothing is rewritten.
  await button(/^断了的路线/).click();
  await expect.element(page.getByRole('region', { name: '路线问题' })).toHaveTextContent('缺「子空间」');
  await button('补上 向量空间 ⇒ 子空间').click();
  await button('保存').click();
  await expect.poll(() => JSON.parse(memory.files.get('.derivon/routes/r-bbbbbb.json')!).steps).toEqual(['h-ab', 'h-cd', 'h-bc']);
  expect(list().element().textContent).not.toContain('无效 · 1 个错误');

  // An unreadable file cannot be edited; its diagnosis and deletion are what the view offers.
  await button(/^未命名路线/).click();
  await expect.element(page.getByRole('main', { name: '无法读取的路线' })).toHaveTextContent('r-cccccc.json');
  await button('删除路线').click();
  await button('删除').click();
  await expect.poll(() => routeFiles(memory)).toEqual(['.derivon/routes/r-bbbbbb.json']);
});

it('keeps the route list collapse apart from the relations pane', async () => {
  await open();
  const tab = (name: string) => page.getByRole('group', { name: '创作视图' }).getByRole('button', { name, exact: true }).click();
  const collapsed = () => container.querySelector('[data-derivon-mode="authoring"]')!.getAttribute('data-relations-open') === 'false';
  await tab('图浏览');
  const relations = collapsed();
  await tab('路线');
  expect(collapsed()).toBe(false);
  await button('收起上下文区').click();
  expect(collapsed()).toBe(true);
  await tab('图浏览');
  expect(collapsed()).toBe(relations);
  await tab('路线');
  expect(collapsed()).toBe(true);
});
