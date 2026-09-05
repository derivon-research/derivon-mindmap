import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthoringCommands } from '../../synchronization';
import type { WorkspaceContent } from '../../workspace/index';
import { AuthoringMode } from './AuthoringMode';

const emptyContent: WorkspaceContent = {
  graphText: '', title: 'Test', graph: { points: [], hyperedges: [] }, documents: {}, companionMetadata: {}, diagnostics: [], requiresMigrationConsent: false,
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

it('submits a complete creation intent and selects its result without a body field', async () => {
  const authoring: AuthoringCommands = { createConcept: vi.fn(() => 'c-1'), updateDocument: vi.fn(), protectDraft: vi.fn() };
  const onSelect = render(emptyContent, authoring);
  await page.getByRole('button', { name: '新建概念', exact: true }).click();
  await page.getByLabelText('名称').fill('Vector space');
  expect(container.querySelector('.authoring-concept-form textarea')).toBeNull();
  await page.getByRole('button', { name: '创建' }).click();
  expect(authoring.createConcept).toHaveBeenCalledWith({ label: 'Vector space', id: undefined, format: 'markdown' });
  expect(authoring.protectDraft).toHaveBeenCalledWith('fixture:create-concept', false);
  expect(onSelect).toHaveBeenCalledWith('c-1');
});

it('reports an empty required label inline', async () => {
  const authoring: AuthoringCommands = { createConcept: vi.fn(() => 'unused'), updateDocument: vi.fn(), protectDraft: vi.fn() };
  render(emptyContent, authoring);
  await page.getByRole('button', { name: '新建概念', exact: true }).click();
  await page.getByRole('button', { name: '创建' }).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('请输入概念名称');
  expect(authoring.createConcept).not.toHaveBeenCalled();
});

it('keeps an unfinished form when hidden and reports command failures inline', async () => {
  const authoring: AuthoringCommands = { createConcept: vi.fn(() => { throw new Error('ID 已存在'); }), updateDocument: vi.fn(), protectDraft: vi.fn() };
  render(emptyContent, authoring);
  await page.getByRole('button', { name: '新建概念', exact: true }).click();
  await page.getByLabelText('名称').fill('Kept draft');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '新建概念', exact: true }).click();
  await expect.element(page.getByLabelText('名称')).toHaveValue('Kept draft');
  await page.getByRole('button', { name: '创建' }).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('ID 已存在');
});

it('shows the concept palette only for a query despite local document diagnostics', async () => {
  const content: WorkspaceContent = { ...emptyContent, graph: { points: [{ id: 'vectors', data: { label: 'Vector space', document: 'docs/vector', format: 'html' } }], hyperedges: [] },
    documents: { 'docs/vector/index.html': { status: 'error', message: 'Permission denied' } }, diagnostics: [{ path: 'docs/vector/index.html', message: 'Permission denied' }] };
  const onSelect = render(content);
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  await page.getByRole('button', { name: '对象', exact: true }).click();
  await page.getByLabelText('搜索概念与推导文档').fill('Vector');
  await page.getByRole('option', { name: /Vector space/ }).click();
  expect(onSelect).toHaveBeenCalledWith('vectors');
});
