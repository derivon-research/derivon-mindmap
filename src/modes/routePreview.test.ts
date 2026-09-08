import { describe, expect, it } from 'vitest';
import type { RouteSolution } from '../ports/RouteSolver';
import type { WorkspaceGraph } from '../workspace/index';
import { routeGraphView, routeSteps } from './routePreview';

const graph: WorkspaceGraph = {
  points: [
    { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['basics'] } },
    { id: 'b', data: { label: 'B', document: 'docs/b', tags: ['basics'] } },
    { id: 'c', data: { label: 'C', document: 'docs/c', tags: ['advanced'] } },
  ],
  hyperedges: [
    { id: 'd1', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/d1' } },
    { id: 'd2', weight: 3.5, tails: ['a', 'b'], head: 'c', data: { document: 'docs/d2' } },
  ],
};

const solution: RouteSolution = {
  reachable: true,
  conceptIds: ['a', 'b', 'c'],
  derivationIds: ['d1', 'd2'],
  order: ['d1', 'd2'],
  cost: 5.5,
  provenOptimal: true,
  blocked: [],
};

describe('routeSteps', () => {
  it('numbers the steps in the order the learner can follow them', () => {
    expect(routeSteps(graph, solution).map((step) => [step.index, step.conceptId]))
      .toEqual([[1, 'b'], [2, 'c']]);
  });

  it('carries what each step needs, so the preview can show why it is there', () => {
    const [first, second] = routeSteps(graph, solution);
    expect(first.requires).toEqual(['a']);
    expect(second.requires).toEqual(['a', 'b']);
    expect(second.weight).toBe(3.5);
    expect(second.derivationId).toBe('d2');
  });

  it('reads the label and tags off the concept the step arrives at', () => {
    const [, second] = routeSteps(graph, solution);
    expect(second.label).toBe('C');
    expect(second.tags).toEqual(['advanced']);
  });

  it('skips a derivation the graph no longer has rather than inventing a step', () => {
    expect(routeSteps(graph, { ...solution, order: ['d1', 'gone'] })).toHaveLength(1);
  });
});

describe('routeGraphView', () => {
  it('draws only the route, so the learner sees the path rather than the graph', () => {
    const view = routeGraphView(graph, { ...solution, conceptIds: ['a', 'b'], derivationIds: ['d1'] },
      ['b'], []);
    expect(view.kind).toBe('route');
    expect(view.concepts.map((concept) => concept.id)).toEqual(['a', 'b']);
    expect(view.hyperedges.map((edge) => edge.id)).toEqual(['d1']);
  });

  it('carries the marks the learner set: what they are after and what they already have', () => {
    const view = routeGraphView(graph, solution, ['c'], ['a']);
    expect(view.concepts.find((concept) => concept.id === 'c')?.marks).toEqual(['target']);
    expect(view.concepts.find((concept) => concept.id === 'a')?.marks).toEqual(['known']);
    expect(view.concepts.find((concept) => concept.id === 'b')?.marks).toEqual([]);
  });

  it('marks how far along the route the learner is, when there is progress to show', () => {
    const view = routeGraphView(graph, solution, ['c'], [], { completedIds: ['b'], currentId: 'c' });
    expect(view.concepts.find((concept) => concept.id === 'b')?.marks).toContain('completed');
    expect(view.concepts.find((concept) => concept.id === 'c')?.marks).toContain('current');
  });

  it('leaves progress marks off entirely when the route has not been walked', () => {
    const view = routeGraphView(graph, solution, ['c'], []);
    expect(view.concepts.flatMap((concept) => concept.marks)).not.toContain('current');
  });
});
