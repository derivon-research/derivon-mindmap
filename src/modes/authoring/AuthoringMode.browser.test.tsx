import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringCommands } from '../../synchronization';
import type { WorkspaceContent } from '../../workspace/index';
import { AuthoringMode } from './AuthoringMode';
import { fakeAuthoringCommands } from '../../testing/authoringCommands';

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

function render(content: WorkspaceContent, authoring?: AuthoringCommands, selectedConceptId: string | null = null, onSelectConcept = vi.fn()) {
  root = createRoot(container);
  act(() => root?.render(<AuthoringMode workspace={{ id: 'fixture', name: 'Fixture' }} content={content}
    authoring={authoring} selectedConceptId={selectedConceptId} onSelectConcept={onSelectConcept} />));
  return onSelectConcept;
}

async function openConceptForm() {
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: /^概念/ }).click();
  return page.getByRole('textbox', { name: '概念名称' });
}

async function pressEnter(field: ReturnType<typeof page.getByRole>) {
  await field.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

const commands = (createConcept: AuthoringCommands['createConcept'], createDerivation: AuthoringCommands['createDerivation'] = vi.fn()): AuthoringCommands =>
  fakeAuthoringCommands({ createConcept, createDerivation });

it('creates a concept through the new-object dialog, then opens it', async () => {
  const authoring = commands(vi.fn(() => 'c-k7f3q2'));
  const onSelect = render(emptyContent, authoring);
  const name = await openConceptForm();
  await name.fill('Vector space');
  await pressEnter(name);
  expect(authoring.createConcept).toHaveBeenCalledWith({ label: 'Vector space' });
  expect(authoring.protectDraft).toHaveBeenCalledWith('fixture:create-object', true);
  expect(authoring.protectDraft).toHaveBeenCalledWith('fixture:create-object', false);
  expect(onSelect).toHaveBeenCalledWith('c-k7f3q2');
  await expect.element(page.getByRole('dialog', { name: '新建对象' })).not.toBeInTheDocument();
});

it('does not create anything from an empty name', async () => {
  const authoring = commands(vi.fn(() => 'unused'));
  render(emptyContent, authoring);
  const name = await openConceptForm();
  await name.fill('   ');
  await pressEnter(name);
  expect(authoring.createConcept).not.toHaveBeenCalled();
  await expect.element(page.getByRole('dialog', { name: '新建对象' })).toBeInTheDocument();
});

it('keeps the typed name and reports a command failure inline', async () => {
  const authoring = commands(vi.fn(() => { throw new Error('工作区已关闭'); }));
  render(emptyContent, authoring);
  const name = await openConceptForm();
  await name.fill('Kept name');
  await page.getByRole('button', { name: '创建概念' }).click();
  await expect.element(page.getByRole('textbox', { name: '概念名称' })).toHaveValue('Kept name');
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

const pointsContent = (): WorkspaceContent => ({ ...emptyContent, graph: { points: [
  { id: 'a', data: { label: '数域', document: 'docs/concept-a' } },
  { id: 'b', data: { label: '向量空间', document: 'docs/concept-b' } },
  { id: 'c', data: { label: '线性无关', document: 'docs/concept-c' } },
], hyperedges: [] } });

it('creates a derivation with premises, conclusion and cost through the dialog', async () => {
  const authoring = commands(vi.fn(() => 'unused'), vi.fn(() => 'h-k7f3q2'));
  const onSelect = render(pointsContent(), authoring);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: /^推导/ }).click();
  const premises = page.getByRole('listbox', { name: '前提集合（可多选，可为空）候选' });
  await premises.getByRole('option', { name: /数域/ }).click();
  await premises.getByRole('option', { name: /向量空间/ }).click();
  const conclusions = page.getByRole('listbox', { name: '结论（单选，必填）候选' });
  await conclusions.getByRole('option', { name: /线性无关/ }).click();
  await page.getByRole('spinbutton', { name: '学习成本' }).fill('2');
  await page.getByRole('button', { name: '创建推导' }).click();
  expect(authoring.createDerivation).toHaveBeenCalledWith({ tails: ['a', 'b'], head: 'c', weight: 2 });
  await expect.element(page.getByRole('dialog', { name: '新建对象' })).not.toBeInTheDocument();
  expect(onSelect).toHaveBeenCalledWith(null);
});

it('blocks submitting a derivation without a conclusion', async () => {
  const authoring = commands(vi.fn(() => 'unused'), vi.fn(() => 'unused'));
  render(pointsContent(), authoring);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: /^推导/ }).click();
  await expect.element(page.getByRole('button', { name: '创建推导' })).toBeDisabled();
  expect(authoring.createDerivation).not.toHaveBeenCalled();
});

it('prefills the derivation form from the relations pane without creating anything', async () => {
  const authoring = commands(vi.fn(() => 'unused'), vi.fn(() => 'unused'));
  render(pointsContent(), authoring, 'a');
  await page.getByRole('button', { name: '展开上下文区' }).click();
  await page.getByRole('button', { name: '新建后续推导' }).click();
  // The dialog opens on the derivation form with 数域 already selected as a premise.
  await expect.element(page.getByRole('dialog', { name: '新建对象' })).toBeInTheDocument();
  const premises = page.getByRole('listbox', { name: '前提集合（可多选，可为空）候选' });
  await expect.element(premises.getByRole('option', { name: /数域/ })).toHaveAttribute('aria-selected', 'true');
  expect(authoring.createDerivation).not.toHaveBeenCalled();
  await page.getByRole('button', { name: '关闭新建对象' }).click();
  await expect.element(page.getByRole('dialog', { name: '新建对象' })).not.toBeInTheDocument();
});
