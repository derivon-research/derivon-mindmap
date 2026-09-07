import { describe, expect, it } from 'vitest';
import type { WorkspaceGraph } from '../workspace/index';
import { neighbourhoodGraphView, overviewGraphView } from './graphViews';

const graph: WorkspaceGraph = {
  points: [
    { id: 'a', data: { label: 'A', document: 'docs/a' } },
    { id: 'b', data: { label: 'B', document: 'docs/b' } },
    { id: 'c', data: { label: 'C', document: 'docs/c' } },
    { id: 'd', data: { label: 'D', document: 'docs/d' } },
    { id: 'far', data: { label: 'Far', document: 'docs/far' } },
  ],
  hyperedges: [
    { id: 'd1', weight: 1, tails: ['a', 'b'], head: 'c', data: { document: 'docs/d1' } },
    { id: 'd2', weight: 1, tails: ['c'], head: 'd', data: { document: 'docs/d2' } },
    { id: 'd3', weight: 1, tails: ['d'], head: 'far', data: { document: 'docs/d3' } },
  ],
};

describe('overviewGraphView', () => {
  it('carries the whole graph and only the marks a learner set', () => {
    const view = overviewGraphView(graph, { targetIds: ['d'], knownIds: ['a'] });
    expect(view.kind).toBe('overview');
    expect(view.concepts).toHaveLength(5);
    expect(view.hyperedges).toHaveLength(3);
    expect(view.concepts.find((concept) => concept.id === 'd')?.marks).toEqual(['target']);
    expect(view.concepts.find((concept) => concept.id === 'a')?.marks).toEqual(['known']);
    expect(view.concepts.find((concept) => concept.id === 'b')?.marks).toEqual([]);
  });

  it('stacks marks rather than letting one win', () => {
    const view = overviewGraphView(graph, { targetIds: ['a'], knownIds: ['a'], selectedId: 'a' });
    expect(view.concepts.find((concept) => concept.id === 'a')?.marks).toEqual(['target', 'known', 'selected']);
  });
});

describe('neighbourhoodGraphView', () => {
  it('keeps one step around the focus, in both directions', () => {
    const view = neighbourhoodGraphView(graph, 'c', {});
    expect(view.kind).toBe('neighbourhood');
    expect([...view.concepts.map((concept) => concept.id)].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect([...view.hyperedges.map((edge) => edge.id)].sort()).toEqual(['d1', 'd2']);
  });

  it('marks the focus as current, so the renderer can say where the reader stands', () => {
    const view = neighbourhoodGraphView(graph, 'c', { knownIds: ['a'] });
    expect(view.concepts.find((concept) => concept.id === 'c')?.marks).toContain('current');
    expect(view.concepts.find((concept) => concept.id === 'a')?.marks).toEqual(['known']);
  });

  it('shows a concept with no derivations as itself rather than as an empty view', () => {
    const isolated: WorkspaceGraph = { points: graph.points, hyperedges: [] };
    expect(neighbourhoodGraphView(isolated, 'c', {}).concepts.map((concept) => concept.id)).toEqual(['c']);
  });

  it('has nothing to draw for a concept the graph does not have', () => {
    expect(neighbourhoodGraphView(graph, 'ghost', {}).concepts).toEqual([]);
  });
});
