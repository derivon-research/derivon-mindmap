import { describe, expect, it } from 'vitest';
import type { WorkspaceGraph } from '../workspace/index';
import { solveGreedily } from './routeSolver';

const graph: WorkspaceGraph = {
  points: ['a', 'b', 'c', 'x'].map((id) => ({ id, data: { label: id.toUpperCase(), document: `docs/${id}` } })),
  hyperedges: [
    { id: 'd1', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
    { id: 'd2', weight: 3, tails: ['b'], head: 'c', data: { document: 'docs/d2' } },
    { id: 'dx', weight: 9, tails: ['a'], head: 'x', data: { document: 'docs/dx' } },
  ],
};

describe('solveGreedily', () => {
  it('orders derivations so every premise arrives before the step that uses it', () => {
    const solution = solveGreedily(graph, { targetConceptIds: ['c'], knownConceptIds: ['a'] });
    expect(solution.reachable).toBe(true);
    expect(solution.order).toEqual(['d1', 'd2']);
  });

  it('leaves out derivations no target leans on, so the route is not the whole graph', () => {
    const solution = solveGreedily(graph, { targetConceptIds: ['c'], knownConceptIds: ['a'] });
    expect(solution.derivationIds).not.toContain('dx');
    expect(solution.cost).toBe(5);
  });

  it('reports a target it cannot reach rather than pretending it solved', () => {
    const solution = solveGreedily(graph, { targetConceptIds: ['c'], knownConceptIds: [] });
    expect(solution.reachable).toBe(false);
    expect(solution.blocked.map((block) => block.targetConceptId)).toEqual(['c']);
  });
});
