import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_SCHEMA, type WorkspaceGraph } from '../../workspace/index';
import type { DesktopInvoke } from './desktopWorkspaceSource';
import { createDesktopRouteSolver } from './desktopRouteSolver';

const graph: WorkspaceGraph = {
  points: [
    { id: 'a', data: { label: 'A', document: 'docs/a', format: 'markdown', tags: ['basics'] } },
    { id: 'b', data: { label: 'B', document: 'docs/b', format: 'markdown' } },
  ],
  hyperedges: [{ id: 'h', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/h', format: 'markdown' } }],
};

const response = {
  reachable: true, hyperedgeIds: ['h'], executableOrder: ['h'], pointIds: ['a', 'b'],
  cost: 2, lower: 2, upper: 2, provenOptimal: true, nodes: 3, millis: 1,
  targetDiagnoses: [{ targetPointId: 'b', blockingPointIds: ['a'], cycles: [['a', 'b']] }],
};

describe('the desktop route solver', () => {
  it('sends a v1 request carrying only the graph and maps the answer into product terms', async () => {
    const invoke = vi.fn(async () => response) as unknown as DesktopInvoke;
    const solution = await createDesktopRouteSolver(invoke)
      .solve(graph, { targetConceptIds: ['b'], knownConceptIds: ['a'] });

    expect(invoke).toHaveBeenCalledWith('solve_route', { request: {
      workspace: { schema: WORKSPACE_SCHEMA, graph },
      startPointIds: ['a'], targetPointIds: ['b'], budget: { maxNodes: 200_000, maxMillis: 200 },
    } });
    expect(solution).toEqual({
      reachable: true, conceptIds: ['a', 'b'], derivationIds: ['h'], order: ['h'], cost: 2, provenOptimal: true,
      blocked: [{ targetConceptId: 'b', blockingConceptIds: ['a'], cycles: [['a', 'b']] }],
    });
  });

  it('refuses a solve with no target instead of asking the engine', async () => {
    const invoke = vi.fn() as unknown as DesktopInvoke;
    await expect(createDesktopRouteSolver(invoke).solve(graph, { targetConceptIds: [], knownConceptIds: [] }))
      .rejects.toThrow(/目标/);
    expect(invoke).not.toHaveBeenCalled();
  });
});
