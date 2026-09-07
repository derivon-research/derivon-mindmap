/**
 * What a learning-side interaction costs at the established large-graph scale.
 *
 * The budget is the one in docs/testing/runtime-performance.md: 200 ms from the input to
 * the paint that answers it. Two interactions carry it — changing a target, which re-ranks
 * the probe and repaints the overview, and moving a route panel, which swaps the rail
 * between a step list and the route subgraph. Both are measured through the real
 * `LearningMode` over a real `WorkspaceSession`, so the number covers re-deriving the graph
 * view and re-rendering, not a component in isolation.
 *
 * Like the rendering and authoring benchmarks, `npm test` skips it: a shared CI runner's
 * timing noise is larger than the headroom, and a benchmark that blocks every pull request
 * only teaches people to press re-run. `npm run bench:learning` runs it, and the manual
 * runtime performance workflow reports it.
 */
import { act, useState, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGeneratedWorkspaceGraph } from '../../../benchmarks/fixtures/generated-workspace';
import type { WorkspaceSource } from '../../ports/WorkspaceSource';
import { openWorkspaceSession, type WorkspaceSession } from '../../synchronization';
import { fixtureRouteSolver } from '../../testing/routeSolver';
import { labelOf } from '../ConceptPicker';
import type { LearningView } from '../../app/host';
import { LearningMode } from './LearningMode';

const BUDGET_MS = 200;

/** A source with no I/O cost of its own, so what is measured is the application's work. */
function memorySource(graph: string, documents: Record<string, string>): WorkspaceSource {
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

const benchmark = import.meta.env.VITE_BENCH_LEARNING === '1' ? it : it.skip;

benchmark('measures switching a target and moving a route panel within 200ms at scale', async () => {
  const size = Number(import.meta.env.VITE_PERF_SIZE ?? 1000);
  const fixture = createGeneratedWorkspaceGraph(size);
  session = await openWorkspaceSession(memorySource(fixture.graph, fixture.documents));
  const current = session;
  const solver = fixtureRouteSolver();
  const targetId = fixture.interactions.conceptId;
  const targetLabel = labelOf(current.reader.getSnapshot().content.graph, targetId);

  // The generated topology is one long cycle, so a route exists only once the learner holds
  // two adjacent concepts: from there every derivation fires in turn. The target is picked
  // near the seed on purpose — a route is tens of steps long, and aiming at the far side of
  // the cycle would measure a subgraph no learner is ever handed.
  const seedKnown = ['c-0', 'c-1'];
  const routeTargetId = 'c-40';
  let enterRoute: () => void = () => {};

  function Harness() {
    const snapshot = useSyncExternalStore(current.reader.subscribe, current.reader.getSnapshot);
    const [view, setView] = useState<LearningView>('orientation');
    const [targetIds, setTargetIds] = useState<readonly string[]>([]);
    const [knownIds, setKnownIds] = useState<readonly string[]>([]);
    enterRoute = () => { setTargetIds([routeTargetId]); setKnownIds(seedKnown); setView('route'); };
    return <LearningMode workspace={{ id: 'bench', name: 'Benchmark' }} content={snapshot.content}
      targetIds={targetIds} knownIds={knownIds} onChangeTargets={setTargetIds} onChangeKnown={setKnownIds}
      view={view} onEnterView={setView} onConfirmRoute={() => setView('route')} routeSolver={solver}
      readAsset={current.reader.readAsset} readDocuments={current.reader.readDocuments} />;
  }

  root = createRoot(container);
  await act(async () => root?.render(<Harness />));
  // The overview is laid out before anything is timed: opening cost is #47's budget, not this one.
  await expect.element(page.getByRole('img', { name: 'Knowledge graph' })).toHaveAttribute('aria-busy', 'false');

  // Switching a target on: reached through the composer, because a cycle has no terminal
  // concept to offer as a starter. Only the press that changes the targets is timed.
  await page.getByLabelText('说出你想学会什么，或搜索一个概念').fill(targetLabel);
  await page.getByRole('button', { name: targetLabel, exact: true }).click();
  await expect.element(page.getByTitle(`${targetLabel} 文档`)).toBeVisible();
  const addTargetMs = await measure(() => page.getByRole('button', { name: '加进目标' }).click());
  expect(container.querySelector('[data-learning-targets]')?.getAttribute('data-learning-targets')).toBe(targetId);

  const dropTargetMs = await measure(() => page.getByRole('button', { name: `移除目标 ${targetLabel}` }).click());
  expect(container.querySelector('[data-learning-targets]')?.getAttribute('data-learning-targets')).toBe('');

  // The route itself is the solver's work, not the application's, so it is settled first.
  await act(async () => { enterRoute(); });
  const rail = page.getByRole('navigation', { name: '路线' });
  await expect.element(rail).toBeVisible();
  await expect.element(page.getByRole('button', { name: '展开子图' })).toBeVisible();

  const steps = container.querySelectorAll('.learning-rail-list li').length;
  const expandMs = await measure(() => page.getByRole('button', { name: '展开子图' }).click());
  expect(container.querySelector('.learning-route')?.className).toContain('rail-expanded');
  // The subgraph is inside the measured window, not merely scheduled by it: the contract
  // counts a toggle finished once the renderer has caught up and the result has painted.
  expect(container.querySelector('.learning-rail .learning-graph-canvas canvas')).toBeTruthy();

  const collapseMs = await measure(() => rail.getByRole('button', { name: '收回默认宽度' }).click());
  const hideMs = await measure(() => rail.getByRole('button', { name: '隐藏' }).click());
  expect(container.querySelector('.learning-route')?.className).toContain('rail-hidden');

  console.info('Learning performance', JSON.stringify({
    concepts: size, steps, addTargetMs, dropTargetMs, expandMs, collapseMs, hideMs,
  }));
  expect(addTargetMs, 'add target budget').toBeLessThanOrEqual(BUDGET_MS);
  expect(dropTargetMs, 'drop target budget').toBeLessThanOrEqual(BUDGET_MS);
  expect(expandMs, 'expand route panel budget').toBeLessThanOrEqual(BUDGET_MS);
  expect(collapseMs, 'collapse route panel budget').toBeLessThanOrEqual(BUDGET_MS);
  expect(hideMs, 'hide route panel budget').toBeLessThanOrEqual(BUDGET_MS);
});
