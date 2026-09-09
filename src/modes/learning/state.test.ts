import { describe, expect, it } from 'vitest';
import type { RouteSolution } from '../../ports/RouteSolver';
import type { WorkspaceGraph } from '../../workspace/index';
import type { TaskCompletion } from './progress';
import {
  initialLearningWalkState, missingTargetIds, recordTaskCompletion, routeSignature,
} from './state';

const graph: WorkspaceGraph = {
  points: [
    { id: 'a', data: { label: 'A', document: 'docs/a' } },
    { id: 'b', data: { label: 'B', document: 'docs/b' } },
  ],
  hyperedges: [
    { id: 'd1', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
  ],
};

const solution: RouteSolution = {
  reachable: true, conceptIds: ['b'], derivationIds: ['d1'], order: ['d1'], cost: 2,
  provenOptimal: true, blocked: [],
};

const completion = (conceptId: string): TaskCompletion => ({
  graphText: '{}', routeKey: 'd1', conceptId, derivationId: `d-${conceptId}`,
  task: `task ${conceptId}`, documentBasis: `basis ${conceptId}`,
});

describe('content-aware learning state', () => {
  it('signs the route topology and result, not labels or unrelated graph metadata', () => {
    const renamed: WorkspaceGraph = {
      points: graph.points.map((point) => point.id === 'b'
        ? { ...point, data: { ...point.data, label: 'Renamed' } } : point),
      hyperedges: graph.hyperedges,
    };
    const changedStructure: WorkspaceGraph = {
      points: graph.points,
      hyperedges: [{ ...graph.hyperedges[0], tails: [], weight: 3 }],
    };

    expect(routeSignature(renamed, solution)).toBe(routeSignature(graph, solution));
    expect(routeSignature(changedStructure, solution)).not.toBe(routeSignature(graph, solution));
  });

  it('keeps unrelated task completions when another step is submitted again', () => {
    let state = initialLearningWalkState();
    state = recordTaskCompletion(state, completion('b'));
    state = recordTaskCompletion(state, completion('c'));
    const resubmitted = { ...completion('b'), documentBasis: 'new basis b' };
    state = recordTaskCompletion(state, resubmitted);

    expect(state.taskCompletions).toHaveLength(2);
    expect(state.taskCompletions).toContainEqual(resubmitted);
    expect(state.taskCompletions).toContainEqual(completion('c'));
  });

  it('reports missing targets without removing or replacing them', () => {
    expect(missingTargetIds(graph, ['b', 'missing'])).toEqual(['missing']);
  });
});
