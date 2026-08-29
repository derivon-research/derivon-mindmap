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
      'h-b-alt',
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
      role: 'aggregate',
      mode: 'replacement',
      sourceCount: 2,
      label: '展开为 2 个概念',
    }]);
  });

  it('temporarily shows both sides with role metadata and a passive assist descriptor', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements[0].show = 'replacement';
    const projection = projectDocument(document, { detachedReplacementIds: new Set(['X']) });

    expect(projection.points.map((point) => point.id)).toEqual(['A', 'B', 'C', 'D', 'X']);
    expect(projection.points.find((point) => point.id === 'A')?.replacementRoles).toEqual([{
      replaceWith: 'X', role: 'member', mode: 'compare', sourceCount: 2,
    }]);
    expect(projection.points.find((point) => point.id === 'X')?.replacementRoles).toEqual([{
      replaceWith: 'X', role: 'aggregate', mode: 'compare', sourceCount: 2,
    }]);
    expect(projection.replacementAssists).toEqual([{
      id: 'replacement-assist:X',
      replaceWith: 'X',
      targetId: 'X',
      memberIds: ['A', 'B'],
    }]);
    expect(document.view.replacements[0].show).toBe('replacement');
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

  it('detaches nested replacement boundaries independently', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements = [
      { points: ['A', 'B'], replaceWith: 'C', show: 'replacement' },
      { points: ['C', 'D'], replaceWith: 'X', show: 'replacement' },
    ];
    const projection = projectDocument(document, { detachedReplacementIds: new Set(['X']) });

    expect(projection.points.map((point) => point.id)).toEqual(['C', 'D', 'X']);
    expect(projection.replacementAssists[0]?.memberIds).toEqual(['C', 'D']);
    expect(projection.replacementAssists).toHaveLength(1);
  });

  it('keeps nested compare arrows on direct relation members without flattening', () => {
    const document = structuredClone(sampleDocument);
    document.view.replacements = [
      { points: ['A', 'B'], replaceWith: 'C', show: 'replacement' },
      { points: ['C', 'D'], replaceWith: 'X', show: 'replacement' },
    ];
    const projection = projectDocument(document, { detachedReplacementIds: new Set(['C', 'X']) });

    expect(projection.points.map((point) => point.id)).toEqual(['A', 'B', 'C', 'D', 'X']);
    expect(projection.replacementAssists.map((assist) => [assist.targetId, assist.memberIds])).toEqual([
      ['C', ['A', 'B']],
      ['X', ['C', 'D']],
    ]);
  });
});
