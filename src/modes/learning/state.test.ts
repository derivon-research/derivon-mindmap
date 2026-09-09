import { describe, expect, it } from 'vitest';
import type { RouteSolution } from '../../ports/RouteSolver';
import type { WorkspaceGraph } from '../../workspace/index';
import {
  completeTask, documentVersion, missingTargetIds, routeSignature, taskRecordIsCurrent,
  type RouteDocumentVersions,
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

const versions: RouteDocumentVersions = {
  'docs/b/document.md': documentVersion('B definition'),
  'docs/d1/document.md': documentVersion('B derivation'),
};

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

  it('keeps a submitted task only while both documents it was checked against are unchanged', () => {
    const record = completeTask(graph, solution.order[0], versions);
    expect(taskRecordIsCurrent(record, versions)).toBe(true);

    expect(taskRecordIsCurrent(record, {
      ...versions,
      'docs/b/document.md': documentVersion('New B definition'),
    })).toBe(false);
    expect(taskRecordIsCurrent(record, {
      ...versions,
      'docs/d1/document.md': documentVersion('New B derivation'),
    })).toBe(false);
  });

  it('keeps a later record current when an earlier document changes', () => {
    const first = completeTask(graph, 'd1', versions);
    const second = { ...first, conceptId: 'c', derivationId: 'd2',
      conceptDocument: { path: 'docs/c/document.md', version: documentVersion('C definition') },
      derivationDocument: { path: 'docs/d2/document.md', version: documentVersion('C derivation') } };
    const staleVersions: RouteDocumentVersions = {
      ...versions,
      'docs/b/document.md': documentVersion('New B definition'),
      'docs/c/document.md': second.conceptDocument.version,
      'docs/d2/document.md': second.derivationDocument.version,
    };

    expect(taskRecordIsCurrent(first, staleVersions)).toBe(false);
    expect(taskRecordIsCurrent(second, staleVersions)).toBe(true);
  });

  it('reports missing targets without removing or replacing them', () => {
    expect(missingTargetIds(graph, ['b', 'missing'])).toEqual(['missing']);
  });
});
