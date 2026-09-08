import { describe, expect, it } from 'vitest';
import type { RouteSolution } from '../../ports/RouteSolver';
import type { WorkspaceGraph } from '../../workspace/index';
import { beginOrientation, type OrientationPlan, type OrientationRun } from './orientation';
import { graphProbeCandidates, routeProbeCandidates } from './probe';

/**
 * A route whose steps deliberately disagree with alphabetical order: `alpha` carries the
 * least leverage and sorts first, `zeta` carries the most and sorts last.
 */
const graph: WorkspaceGraph = {
  points: [
    { id: 'alpha', data: { label: 'Alpha', document: 'docs/alpha' } },
    { id: 'beta', data: { label: 'Beta', document: 'docs/beta' } },
    { id: 'gamma', data: { label: 'Gamma', document: 'docs/gamma' } },
    { id: 'delta', data: { label: 'Delta', document: 'docs/delta' } },
    { id: 'zeta', data: { label: 'Zeta', document: 'docs/zeta' } },
    { id: 'omega', data: { label: 'Omega', document: 'docs/omega' } },
  ],
  hyperedges: [
    { id: 'd1', weight: 1, tails: ['zeta'], head: 'beta', data: { document: 'docs/d1' } },
    { id: 'd2', weight: 1, tails: ['zeta', 'alpha'], head: 'gamma', data: { document: 'docs/d2' } },
    { id: 'd3', weight: 1, tails: ['zeta', 'beta'], head: 'delta', data: { document: 'docs/d3' } },
    { id: 'd4', weight: 1, tails: ['gamma', 'delta'], head: 'omega', data: { document: 'docs/d4' } },
  ],
};

const solution: RouteSolution = {
  reachable: true,
  conceptIds: ['zeta', 'alpha', 'beta', 'gamma', 'delta', 'omega'],
  derivationIds: ['d1', 'd2', 'd3', 'd4'],
  order: ['d1', 'd2', 'd3', 'd4'],
  cost: 4,
  provenOptimal: true,
  blocked: [],
};

const plan: OrientationPlan = { kind: 'generic', graph, config: null };
const run = (over: Partial<OrientationRun> = {}): OrientationRun => ({ ...beginOrientation(plan), ...over });

describe('routeProbeCandidates', () => {
  it('ranks by how much of the route a concept carries, not by name', () => {
    const candidates = routeProbeCandidates(graph, solution, run());
    // zeta is a premise of three steps; alphabetical order would have put it last.
    expect(candidates[0]).toBe('zeta');
    expect(candidates).not.toEqual([...candidates].sort());
  });

  it('leaves out what the learner already knows and what an earlier round asked', () => {
    const candidates = routeProbeCandidates(graph, solution, run({ known: ['zeta'], asked: ['beta'] }));
    expect(candidates).not.toContain('zeta');
    expect(candidates).not.toContain('beta');
  });

  it('breaks a tie by route position, so an earlier step is offered first', () => {
    // delta carries two steps; alpha and omega carry one each, alpha at d2 and omega at d4.
    const candidates = routeProbeCandidates(graph, solution, run({ known: ['zeta'], asked: ['beta', 'gamma'] }));
    expect(candidates).toEqual(['delta', 'alpha', 'omega']);
  });

  it('offers at most the asked-for round size', () => {
    expect(routeProbeCandidates(graph, solution, run(), 2)).toHaveLength(2);
  });

  it('has nothing left to ask once every concept on the route is settled', () => {
    expect(routeProbeCandidates(graph, solution, run({ known: solution.conceptIds }))).toEqual([]);
  });
});

describe('graphProbeCandidates', () => {
  it('ranks by how many derivations lean on the concept, so a host without a solver still probes', () => {
    // zeta is a premise of d1, d2 and d3; everything else is a premise of one.
    expect(graphProbeCandidates(graph, run())[0]).toBe('zeta');
  });

  it('counts only the derivations that could reach the target, not popularity across the graph', () => {
    // Only d1 can reach beta, so zeta's other two appearances are irrelevant here and beta's
    // one premise is the only thing worth asking — popularity would still have led with zeta,
    // but it would also have offered alpha and gamma, whose answers cannot shorten this route.
    expect(graphProbeCandidates(graph, run({ targets: ['beta'] }))).toEqual(['zeta']);
    // gamma is reached through d2, which leans on zeta and alpha; delta's chain is not involved.
    expect(graphProbeCandidates(graph, run({ targets: ['gamma'] }))).toEqual(['alpha', 'zeta']);
  });

  it('never offers a concept no derivation builds on, because knowing it prunes nothing', () => {
    // Nothing is derived from omega, so its answer cannot shorten anything.
    expect(graphProbeCandidates(graph, run())).not.toContain('omega');
  });

  it('leaves out what the learner already knows and what an earlier round asked', () => {
    const candidates = graphProbeCandidates(graph, run({ known: ['zeta'], asked: ['beta'] }));
    expect(candidates).not.toContain('zeta');
    expect(candidates).not.toContain('beta');
  });

  it('offers at most the asked-for round size', () => {
    expect(graphProbeCandidates(graph, run(), 2)).toHaveLength(2);
  });
});
