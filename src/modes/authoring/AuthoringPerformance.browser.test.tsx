/**
 * What an authoring edit costs at the established large-graph scale.
 *
 * The budget is the one in docs/testing/runtime-performance.md: 200 ms from the input to
 * the paint that answers it. This measures the v1 authoring side through its real surface —
 * the real workbench, over a real `WorkspaceSession` and the real content operations — so
 * the number covers validating the change, re-deriving effective content, and re-rendering
 * the object page, not a component in isolation.
 *
 * Like the rendering benchmark, `npm test` skips it: a shared CI runner's timing noise is
 * larger than the headroom, and a benchmark that blocks every pull request only teaches
 * people to press re-run. `npm run bench:authoring` runs it, and the manual runtime
 * performance workflow reports it.
 */
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGeneratedWorkspaceGraph } from '../../../benchmarks/fixtures/generated-workspace';
import type { WorkspaceCommit, WritableWorkspaceSource } from '../../ports/WorkspaceSource';
import { openWorkspaceSession, type WorkspaceSession } from '../../synchronization';
import { AuthoringMode } from './AuthoringMode';

const BUDGET_MS = 200;

/** A source with no I/O cost of its own, so what is measured is the application's work. */
function memorySource(graph: string, documents: Record<string, string>): WritableWorkspaceSource {
  const files = new Map<string, string>([['.derivon/workspace.json', graph], ...Object.entries(documents)]);
  return {
    async readGraph() { return files.get('.derivon/workspace.json')!; },
    async readDocument(path) {
      if (!files.has(path)) throw new Error(`Missing: ${path}`);
      return files.get(path)!;
    },
    async readAsset() { throw new Error('no assets'); },
    async readCompanionMetadata() { return null; },
    async listOwnedFiles(directory) {
      return [...files.keys()].filter((path) => path.startsWith(`${directory}/`)).sort();
    },
    async commit(changes: WorkspaceCommit) {
      if (changes.graph !== undefined) files.set('.derivon/workspace.json', changes.graph);
      for (const change of changes.documents ?? []) {
        if (change.content === null) files.delete(change.path); else files.set(change.path, change.content);
      }
    },
  };
}

let container: HTMLDivElement;
let root: Root | undefined;
let session: WorkspaceSession | undefined;

beforeEach(async () => {
  await page.viewport(1440, 900);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  container.style.cssText = 'width:1440px;height:900px';
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  session?.dispose();
  session = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Input to the paint that answers it, the same definition the rendering benchmark uses. */
async function measure(act_: () => Promise<void>): Promise<number> {
  const started = performance.now();
  await act_();
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  return performance.now() - started;
}

const benchmark = import.meta.env.VITE_BENCH_AUTHORING === '1' ? it : it.skip;

benchmark('measures metadata, derivation structure and deletion within 200ms at scale', async () => {
  const size = Number(import.meta.env.VITE_PERF_SIZE ?? 1000);
  const fixture = createGeneratedWorkspaceGraph(size);
  const source = memorySource(fixture.graph, fixture.documents);
  session = await openWorkspaceSession(source, { authoring: source });
  const current = session;

  // The application's own subscription, so what is measured includes republishing effective
  // content to the mode the way `WorkspaceSurface` does it.
  function Harness() {
    const snapshot = useSyncExternalStore(current.reader.subscribe, current.reader.getSnapshot);
    return <AuthoringMode workspace={{ id: 'bench', name: 'Benchmark' }} content={snapshot.content}
      authoring={current.authoring} readDocuments={current.reader.readDocuments}
      readAsset={current.reader.readAsset} selectedConceptId={null} onSelectConcept={() => {}} />;
  }

  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  // The object view, not the overview: ADR-0006 already says a hidden graph is not laid out
  // again per change, and this is the surface an author is editing on.
  await page.getByRole('button', { name: '对象', exact: true }).click();

  // Metadata: rename a concept and see the object page say so.
  await page.getByLabelText('搜索概念与推导文档').fill(fixture.interactions.conceptId);
  await page.getByRole('option', { name: new RegExp(fixture.interactions.conceptId) }).first().click();
  const name = page.getByRole('textbox', { name: '名称' });
  await name.fill('Renamed concept');
  const renameMs = await measure(async () => {
    await name.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(current.reader.getSnapshot().content.graph.points
    .find((point) => point.id === fixture.interactions.conceptId)?.data.label).toBe('Renamed concept');

  // Derivation structure: change the learning cost and commit the whole structure.
  await page.getByLabelText('搜索概念与推导文档').fill(fixture.interactions.derivationId);
  await page.getByRole('option', { name: new RegExp(fixture.interactions.derivationId) }).first().click();
  await page.getByRole('spinbutton', { name: '学习成本' }).fill('4.5');
  const structureMs = await measure(() => page.getByRole('button', { name: '保存更改' }).click());
  expect(current.reader.getSnapshot().content.graph.hyperedges
    .find((edge) => edge.id === fixture.interactions.derivationId)?.weight).toBe(4.5);

  // Deletion: the plan is acquisition and is reported separately; the deletion itself is the
  // interaction, and it is what the budget covers.
  await page.getByLabelText('搜索概念与推导文档').fill(fixture.interactions.deletedConceptId);
  await page.getByRole('option', { name: new RegExp(fixture.interactions.deletedConceptId) }).first().click();
  const planStarted = performance.now();
  await page.getByRole('button', { name: '删除这个对象' }).click();
  await expect.element(page.getByRole('button', { name: '执行完整删除方案' })).toBeEnabled();
  const planMs = performance.now() - planStarted;

  await page.getByRole('button', { name: '执行完整删除方案' }).click();
  const deleteMs = await measure(() => page.getByRole('button', { name: /^确认删除/ }).click());
  expect(current.reader.getSnapshot().content.graph.points
    .some((point) => point.id === fixture.interactions.deletedConceptId)).toBe(false);

  console.info('Authoring performance', JSON.stringify({
    concepts: size, renameMs, structureMs, deleteMs, planMs,
  }));
  expect(renameMs, 'object metadata budget').toBeLessThanOrEqual(BUDGET_MS);
  expect(structureMs, 'derivation structure budget').toBeLessThanOrEqual(BUDGET_MS);
  expect(deleteMs, 'deletion budget').toBeLessThanOrEqual(BUDGET_MS);
});
