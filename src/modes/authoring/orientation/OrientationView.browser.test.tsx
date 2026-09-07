import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringCommands } from '../../../synchronization';
import type { GraphRendererProps } from '../../../rendering';
import type { RouteSolver } from '../../../ports/RouteSolver';
import {
  WORKSPACE_SCHEMA, parseWorkspaceContent, updateOrientation, type WorkspaceContent,
} from '../../../workspace/index';

vi.mock('../../../rendering', () => ({ GraphRenderer: ({ view }: GraphRendererProps) => <div>路线子图 {view.concepts.length}</div> }));
import { AuthoringMode } from '../AuthoringMode';
import { fakeAuthoringCommands } from '../../../testing/authoringCommands';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

const solver: RouteSolver = { solve: async () => ({
  reachable: true, conceptIds: ['c-1', 'c-2'], derivationIds: [], order: [], cost: 1, provenOptimal: true, blocked: [],
}) };

function workspace(): WorkspaceContent {
  return parseWorkspaceContent({ graph: JSON.stringify({
    schema: WORKSPACE_SCHEMA,
    document: { title: '开局工作区', description: '' },
    tags: [{ id: 'basics', label: '基础' }],
    graph: { points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b' } },
    ], hyperedges: [] },
  }), documents: {} });
}

/** A session stand-in: content operations really run, so a save has to be a valid one. */
function harness() {
  let content = workspace();
  const protectDraft = vi.fn();
  const render = () => act(() => root?.render(<AuthoringMode active workspace={{ id: 'w', name: '开局工作区' }}
    content={content} authoring={authoring} routeSolver={solver} selectedConceptId={null} onSelectConcept={vi.fn()} />));
  const authoring: AuthoringCommands = fakeAuthoringCommands({
    updateOrientation: vi.fn((config) => { content = updateOrientation(content, config).content; render(); }),
    protectDraft,
  });
  root = createRoot(container);
  render();
  return { protectDraft, authoring, get content() { return content; } };
}

const click = (name: string | RegExp) => page.getByRole('button', { name }).click();

/** The outline pane starts collapsed on a narrow viewport; the test needs it open. */
async function openOutline() {
  const expand = container.querySelector('button[aria-label="展开上下文区"]') as HTMLButtonElement | null;
  if (expand) await act(async () => expand.click());
}

it('maintains an orientation configuration through the shared content operations and previews it', async () => {
  const session = harness();
  await click('开局');
  await openOutline();
  expect(container.textContent).toContain('没有配置的工作区仍然有效');

  await click('新建开局配置');
  await expect.poll(() => session.protectDraft.mock.calls.at(-1)).toEqual(['w:orientation', true]);
  expect(session.content.orientation).toEqual({ status: 'absent' });

  // Every reference is built with the picker.
  const target = [...container.querySelectorAll('ul[aria-label="默认目标"] button')]
    .find((button) => button.textContent?.startsWith('B'));
  await act(async () => (target as HTMLButtonElement).click());

  await click('添加问题');
  await click('添加选项');
  await click(/没有文案/);
  await page.getByRole('textbox', { name: '文案' }).fill('要看懂一篇论文');

  await click('保存开局配置');
  await expect.poll(() => session.content.orientation.status).toBe('ready');
  const saved = session.content.orientation.status === 'ready' ? session.content.orientation.config : null;
  expect(saved!.seed).toEqual({ targets: ['b'], known: [] });
  expect(saved!.questions[0].options[0].label).toBe('要看懂一篇论文');
  await expect.poll(() => session.protectDraft.mock.calls.at(-1)).toEqual(['w:orientation', false]);

  // The author walks the learner's own run from inside the authoring mode.
  await click('学习者');
  const answer = container.querySelector('.orientation-learner .orientation-options button') as HTMLButtonElement;
  expect(answer.textContent).toBe('要看懂一篇论文');
  await act(async () => answer.click());
  await expect.element(page.getByText('初始路线')).toBeVisible();
  await page.getByRole('button', { name: '路线', exact: true }).click();
  await expect.element(page.getByText('路线子图')).toBeVisible();
});

it('narrows the concept picker by ticking tags, and offers the same tags to an action', async () => {
  harness();
  await click('开局');
  await openOutline();
  await click('新建开局配置');

  const targets = () => [...container.querySelectorAll('ul[aria-label="默认目标"] button > span:nth-of-type(2)')]
    .map((label) => label.textContent);
  expect(targets()).toEqual(['A', 'B']);

  const filter = container.querySelector('[aria-label="默认目标标签筛选"] button') as HTMLButtonElement;
  expect(filter.textContent).toBe('基础');
  await act(async () => filter.click());
  expect(targets()).toEqual(['A']);
  await act(async () => filter.click());
  expect(targets()).toEqual(['A', 'B']);

  // The same tags are what an action points at, so they are ticked the same way.
  await click('添加问题');
  await click('添加选项');
  await click(/没有文案/);
  await click('添加动作');
  await expect.element(page.getByRole('group', { name: '动作 1 的标签' })).toBeVisible();
});

it('refuses to save a configuration that would leave a dangling reference in a route', async () => {
  const session = harness();
  await click('开局');
  await openOutline();
  await click('新建开局配置');
  await click('添加问题');
  await click('添加选项');
  await click(/没有文案/);
  await click('添加动作');

  // An action that resolves to no concept keeps the draft out of effective content.
  await expect.element(page.getByRole('button', { name: '保存开局配置' })).toBeDisabled();
  expect(container.textContent).toContain('修好之前无法保存');
  expect(session.authoring.updateOrientation).not.toHaveBeenCalled();
});
