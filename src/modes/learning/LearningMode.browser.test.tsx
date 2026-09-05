import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphRendererProps } from '../../rendering';
import type { WorkspaceContent } from '../../workspace/index';

vi.mock('../../rendering', () => ({ GraphRenderer: ({ view, onEvent }: GraphRendererProps) => <button type="button" onClick={() => onEvent({ type: 'select', object: { kind: 'concept', id: view.concepts[0].id } })}>select graph concept</button> }));
import { LearningMode } from './LearningMode';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

it('renders the effective content document and changes targets without reading a source', async () => {
  const content: WorkspaceContent = { graphText: '', title: 'Effective', graph: { points: [{ id: 'fresh', data: { label: 'Fresh concept', document: 'docs/fresh', format: 'html' } }], hyperedges: [] },
    documents: { 'docs/fresh/index.html': { status: 'ready', text: '<main>Unsaved effective body</main>' } }, companionMetadata: {}, diagnostics: [], requiresMigrationConsent: false };
  const onChangeTargets = vi.fn();
  root = createRoot(container);
  act(() => root?.render(<LearningMode workspace={{ id: 'fixture', name: 'Fixture' }} content={content} targetIds={[]} onChangeTargets={onChangeTargets} />));
  await page.getByRole('button', { name: 'select graph concept' }).click();
  const frame = container.querySelector('iframe');
  expect(frame?.getAttribute('sandbox')).toBe('');
  expect(frame?.srcdoc).toContain('Unsaved effective body');
  await page.getByRole('button', { name: '设为目标' }).click();
  expect(onChangeTargets).toHaveBeenCalledWith(['fresh']);
});
