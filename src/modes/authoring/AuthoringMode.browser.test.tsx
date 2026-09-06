import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringCommands } from '../../synchronization';
import type { WorkspaceContent } from '../../workspace/index';
import { AuthoringMode } from './AuthoringMode';

const emptyContent: WorkspaceContent = {
  graphText: '', title: 'Test', graph: { points: [], hyperedges: [] }, documents: {}, companionMetadata: {}, tags: [], orientation: { status: 'absent' }, diagnostics: [],
};
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(async () => {
  await page.viewport(320, 700);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  container.style.cssText = 'width:320px;height:600px';
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(content: WorkspaceContent, authoring?: AuthoringCommands, onSelectConcept = vi.fn()) {
  root = createRoot(container);
  act(() => root?.render(<AuthoringMode workspace={{ id: 'fixture', name: 'Fixture' }} content={content}
    authoring={authoring} selectedConceptId={null} onSelectConcept={onSelectConcept} />));
  return onSelectConcept;
}

async function pressEnter() {
  const field = container.querySelector('.authoring-create input') as HTMLInputElement;
  field.focus();
  await act(async () => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
}

const commands = (createConcept: AuthoringCommands['createConcept']): AuthoringCommands => ({
  createConcept, updateDocument: vi.fn(), updateObjectMetadata: vi.fn(), updateConceptTags: vi.fn(),
  updateTagDeclarations: vi.fn(), updateOrientation: vi.fn(), protectDraft: vi.fn(),
});

it('creates a concept from a name and a return key, then opens it', async () => {
  const authoring = commands(vi.fn(() => 'c-k7f3q2'));
  const onSelect = render(emptyContent, authoring);
  await page.getByRole('textbox', { name: '新建概念' }).fill('Vector space');
  await pressEnter();
  expect(authoring.createConcept).toHaveBeenCalledWith({ label: 'Vector space' });
  expect(authoring.protectDraft).toHaveBeenCalledWith('fixture:create-concept', false);
  expect(onSelect).toHaveBeenCalledWith('c-k7f3q2');
  await expect.element(page.getByRole('textbox', { name: '新建概念' })).toHaveValue('');
});

it('does not create anything from an empty name', async () => {
  const authoring = commands(vi.fn(() => 'unused'));
  render(emptyContent, authoring);
  await pressEnter();
  expect(authoring.createConcept).not.toHaveBeenCalled();
});

it('keeps the typed name and reports a command failure inline', async () => {
  const authoring = commands(vi.fn(() => { throw new Error('工作区已关闭'); }));
  render(emptyContent, authoring);
  await page.getByRole('textbox', { name: '新建概念' }).fill('Kept name');
  await pressEnter();
  await expect.element(page.getByRole('textbox', { name: '新建概念' })).toHaveValue('Kept name');
  expect(container.textContent).toContain('工作区已关闭');
});

it('shows the concept palette only for a query despite local document diagnostics', async () => {
  const content: WorkspaceContent = { ...emptyContent, graph: { points: [{ id: 'vectors', data: { label: 'Vector space', document: 'docs/vector' } }], hyperedges: [] },
    documents: { 'docs/vector/index.html': { status: 'error', message: 'Permission denied' } }, diagnostics: [{ path: 'docs/vector/index.html', message: 'Permission denied' }] };
  const onSelect = render(content);
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  await page.getByRole('button', { name: '对象', exact: true }).click();
  await page.getByLabelText('搜索概念与推导文档').fill('Vector');
  await page.getByRole('option', { name: /Vector space/ }).click();
  expect(onSelect).toHaveBeenCalledWith('vectors');
});
