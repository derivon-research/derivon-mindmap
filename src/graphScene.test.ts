import { describe, expect, it } from 'vitest';
import { createGraphScene } from './graphScene';
import { hyperedgeGroupKey } from './hyperedgeGroups';
import { projectDocument } from './projection';
import { sampleDocument } from './sample';

describe('renderer-neutral graph scene', () => {
  it('preserves concepts, empty tails, joint premises, and stable projected IDs', () => {
    const scene = createGraphScene(sampleDocument);
    const concepts = scene.nodes.filter((node) => node.kind === 'concept');
    const derivations = scene.nodes.filter((node) => node.kind === 'derivation');

    expect(concepts.map((node) => node.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(derivations).toHaveLength(5);
    expect(scene.edges.filter((edge) => edge.derivationId === 'h-c')).toEqual([{
      id: 'head:h-c',
      kind: 'conclusion',
      source: 'h-c',
      target: 'C',
      derivationId: 'h-c',
    }]);
    expect(scene.edges.filter((edge) => edge.derivationId === 'h-d-points').map((edge) => edge.id)).toEqual([
      'premise:h-d-points:B',
      'premise:h-d-points:C',
      'head:h-d-points',
    ]);
  });

  it('switches a parallel alternative without changing scene element IDs', () => {
    const parallel = sampleDocument.graph.hyperedges.find((edge) => edge.id === 'h-b')!;
    const groupKey = hyperedgeGroupKey(parallel);
    const baseline = createGraphScene(sampleDocument);
    const alternative = createGraphScene(sampleDocument, { [groupKey]: 'h-b-alt' });
    const node = alternative.nodes.find((item) => item.kind === 'derivation' && item.id === 'h-b');

    expect(node).toMatchObject({ semanticId: 'h-b-alt', weight: 8, premiseCount: 1 });
    expect(alternative.nodes.map((item) => item.id)).toEqual(baseline.nodes.map((item) => item.id));
    expect(alternative.edges.map((edge) => edge.id)).toEqual(baseline.edges.map((edge) => edge.id));
    expect(alternative.edges.filter((edge) => edge.derivationId === 'h-b-alt')).toHaveLength(2);
  });

  it('keeps replacement assists separate from canonical graph edges', () => {
    const projection = projectDocument(sampleDocument, { detachedReplacementIds: new Set(['X']) });
    const scene = createGraphScene(sampleDocument, {}, { projection, groups: [] });

    expect(scene.replacementAssists).toEqual([{
      id: 'replacement-assist:X',
      kind: 'replacement-assist',
      replaceWith: 'X',
      targetId: 'X',
      memberIds: ['A', 'B'],
    }]);
    expect(scene.edges.some((edge) => edge.id === 'replacement-assist:X')).toBe(false);
  });

  it('applies replacement projection before building renderer data', () => {
    const replaced = structuredClone(sampleDocument);
    replaced.view.replacements[0].show = 'replacement';
    const scene = createGraphScene(replaced);

    expect(scene.nodes.some((node) => node.kind === 'concept' && node.id === 'X')).toBe(true);
    expect(scene.nodes.some((node) => node.kind === 'concept' && node.id === 'A')).toBe(false);
    expect(scene.semanticIds.has('h-x')).toBe(true);
    expect(scene.semanticIds.has('h-b')).toBe(false);
  });
});
