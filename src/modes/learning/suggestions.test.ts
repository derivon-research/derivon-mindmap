import { describe, expect, it } from 'vitest';
import type { WorkspaceGraph } from '../../workspace/index';
import type { RouteStep } from '../routePreview';
import { comprehensionTask, sameTagNeighbours, terminalConcepts } from './suggestions';

const graph: WorkspaceGraph = {
  points: [
    { id: 'alpha', data: { label: 'Alpha', document: 'docs/alpha', tags: ['algebra'] } },
    { id: 'beta', data: { label: 'Beta', document: 'docs/beta', tags: ['algebra'] } },
    { id: 'gamma', data: { label: 'Gamma', document: 'docs/gamma', tags: ['analysis'] } },
    { id: 'delta', data: { label: 'Delta', document: 'docs/delta', tags: ['algebra', 'analysis'] } },
    { id: 'omega', data: { label: 'Omega', document: 'docs/omega' } },
  ],
  hyperedges: [
    { id: 'd1', weight: 1, tails: ['alpha'], head: 'beta', data: { document: 'docs/d1' } },
    { id: 'd2', weight: 1, tails: ['alpha'], head: 'gamma', data: { document: 'docs/d2' } },
    { id: 'd3', weight: 1, tails: ['beta', 'gamma'], head: 'omega', data: { document: 'docs/d3' } },
    { id: 'd4', weight: 1, tails: ['gamma'], head: 'omega', data: { document: 'docs/d4' } },
  ],
};

describe('terminalConcepts', () => {
  it('offers what the graph builds towards, not what it builds from', () => {
    // omega is the only concept no derivation consumes; alpha, beta and gamma are premises.
    expect(terminalConcepts(graph)).toEqual(['omega']);
  });

  it('leaves out an isolated concept, which teaches nothing about where to start', () => {
    const isolated: WorkspaceGraph = {
      points: [{ id: 'lonely', data: { label: 'Lonely', document: 'docs/lonely' } }, ...graph.points],
      hyperedges: graph.hyperedges,
    };
    expect(terminalConcepts(isolated)).not.toContain('lonely');
  });

  it('stops at the asked-for limit', () => {
    expect(terminalConcepts(graph, 0)).toEqual([]);
  });
});

describe('sameTagNeighbours', () => {
  it('offers concepts sharing a tag with what the learner already picked', () => {
    expect(sameTagNeighbours(graph, ['alpha'])).toEqual(['beta', 'delta']);
  });

  it('never offers back what is already chosen', () => {
    expect(sameTagNeighbours(graph, ['alpha', 'beta'])).toEqual(['delta']);
  });

  it('offers nothing when the chosen concepts carry no tags', () => {
    expect(sameTagNeighbours(graph, ['omega'])).toEqual([]);
  });

  it('stops at the asked-for limit', () => {
    expect(sameTagNeighbours(graph, ['alpha'], 1)).toEqual(['beta']);
  });
});

const step = (over: Partial<RouteStep> & Pick<RouteStep, 'index' | 'conceptId' | 'label'>): RouteStep => ({
  derivationId: `d${over.index}`, requires: [], weight: 1, tags: [], ...over,
});

describe('comprehensionTask', () => {
  const steps: readonly RouteStep[] = [
    step({ index: 1, conceptId: 'beta', label: 'Beta' }),
    step({ index: 2, conceptId: 'gamma', label: 'Gamma', requires: ['delta'] }),
    step({ index: 3, conceptId: 'omega', label: 'Omega', requires: ['beta'] }),
  ];

  it('asks the learner to use the concept where the route uses it next', () => {
    expect(comprehensionTask(steps, steps[0])).toContain('Omega');
  });

  it('never points at a step that comes before the one just learnt', () => {
    // Gamma is used by nothing later, even though an earlier step exists.
    expect(comprehensionTask(steps, steps[1])).not.toContain('Beta');
  });

  it('falls back to the learner\'s own example when nothing downstream needs it', () => {
    expect(comprehensionTask(steps, steps[2])).toContain('Omega');
    expect(comprehensionTask(steps, steps[2])).toContain('例子');
  });
});
