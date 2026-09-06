import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringCommands } from '../../synchronization';
import {
  createConcept, createWorkspace, updateConceptTags, updateTagDeclarations, type WorkspaceContent,
} from '../../workspace/index';
import { ConceptTagEditor } from './ConceptTagEditor';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

/** A session stand-in: content operations really run, so a tick has to be a valid change. */
function harness(initial?: (content: WorkspaceContent) => WorkspaceContent) {
  let content = createConcept(createWorkspace({ title: 'T' }).content, { label: '向量空间', format: 'markdown' }).content;
  if (initial) content = initial(content);
  const commands = {
    createConcept: vi.fn(() => 'unused'),
    updateDocument: vi.fn(),
    updateConceptTags: vi.fn((intent) => { content = updateConceptTags(content, intent).content; render(); }),
    updateTagDeclarations: vi.fn((tags) => { content = updateTagDeclarations(content, tags).content; render(); }),
    updateOrientation: vi.fn(),
    protectDraft: vi.fn(),
  } satisfies AuthoringCommands;
  const render = () => act(() => root?.render(
    <ConceptTagEditor concept={content.graph.points[0]} tags={content.tags} authoring={commands} />));
  root = createRoot(container);
  render();
  return { commands, get content() { return content; } };
}

it('declares a tag and attaches it to the concept whose metadata is open', async () => {
  const session = harness();
  expect(container.textContent).toContain('这个工作区还没有标签');

  await page.getByRole('textbox', { name: '新标签名称' }).fill('线性代数');
  await page.getByRole('button', { name: '建标签并打上' }).click();

  expect(session.content.tags).toEqual([{ id: '线性代数', label: '线性代数' }]);
  expect(session.content.graph.points[0].data.tags).toEqual(['线性代数']);
  await expect.element(page.getByRole('button', { name: '线性代数' })).toHaveAttribute('aria-pressed', 'true');
});

it('ticks an existing tag off and on as one complete change each time', async () => {
  const session = harness((content) => updateConceptTags(
    updateTagDeclarations(content, [{ id: 'basics', label: '基础' }, { id: 'advanced', label: '进阶' }]).content,
    { conceptId: 'c-1', tags: ['basics'] }).content);

  await page.getByRole('button', { name: '进阶' }).click();
  expect(session.content.graph.points[0].data.tags).toEqual(['basics', 'advanced']);

  await page.getByRole('button', { name: '基础' }).click();
  expect(session.content.graph.points[0].data.tags).toEqual(['advanced']);
  expect(session.commands.protectDraft).not.toHaveBeenCalled();
});

it('reports a duplicate tag name without changing content', async () => {
  const session = harness((content) => updateTagDeclarations(content, [{ id: '基础', label: '基础' }]).content);
  await page.getByRole('textbox', { name: '新标签名称' }).fill('基础');
  await page.getByRole('button', { name: '建标签并打上' }).click();
  await expect.element(page.getByRole('alert')).toBeVisible();
  expect(session.content.tags).toHaveLength(1);
  expect(session.content.graph.points[0].data.tags).toBeUndefined();
});
