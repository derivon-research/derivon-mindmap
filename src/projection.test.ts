import { describe, expect, it } from 'vitest';
import { projectDocument } from './projection';
import { sampleDocument } from './sample';

describe('replace with projection', () => {
  it('shows A B plus the shared C D subgraph on the points side', () => {
    const projection = projectDocument(sampleDocument);
    expect(projection.points.map((concept) => concept.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(projection.hyperedges.map((derivation) => derivation.id)).toEqual([
      'h-c',
      'h-a',
      'h-b',
      'h-d-points',
      'h-d-direct',
    ]);
    expect(projection.visibleIds.has('X')).toBe(false);
  });

  it('shows X as an ordinary connected part of the shared C D graph', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements[0].show = 'replacement';
    const projection = projectDocument(document);

    expect(projection.points.map((concept) => concept.id)).toEqual(['C', 'D', 'X']);
    expect(projection.hyperedges.map((derivation) => derivation.id)).toEqual([
      'h-c',
      'h-x',
      'h-d-x',
      'h-d-direct',
    ]);
    expect(projection.points.find((concept) => concept.id === 'X')?.controls).toEqual([{
      replaceWith: 'X',
      show: 'points',
      label: '2 点',
    }]);
  });

  it('filters hidden-endpoint hyperedges instead of rewriting them to X', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements[0].show = 'replacement';
    const projection = projectDocument(document);
    expect(projection.visibleIds.has('h-a')).toBe(false);
    expect(projection.visibleIds.has('h-b')).toBe(false);
    expect(projection.visibleIds.has('h-d-points')).toBe(false);
    expect(projection.hyperedges.every((derivation) => document.graph.hyperedges.includes(derivation))).toBe(true);
  });

  it('composes two view replacements recursively without synthetic nodes', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements = [
      { points: ['A', 'B'], replaceWith: 'C', show: 'replacement' },
      { points: ['C', 'D'], replaceWith: 'X', show: 'points' },
    ];
    const projection = projectDocument(document);

    expect(projection.points.map((concept) => concept.id)).toEqual(['C', 'D']);
    expect(projection.points.find((concept) => concept.id === 'C')?.controls).toHaveLength(2);
    expect([...projection.visibleIds].some((id) => id.startsWith('module:'))).toBe(false);
  });
});
