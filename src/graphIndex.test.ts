import { describe, expect, it } from 'vitest';
import { createGraphIndex } from './graphIndex';
import { sampleDocument } from './sample';

function indexedSample() {
  return createGraphIndex(structuredClone(sampleDocument));
}

describe('GraphIndex', () => {
  it('indexes incoming and outgoing hyperedges for a concept', () => {
    const index = indexedSample();

    expect(index.incidentHyperedgeIdsByPoint.get('A')).toEqual(new Set([
      'h-a',
      'h-b',
      'h-b-alt',
    ]));
  });

  it('returns the complete one-hop hypergraph neighborhood of a concept', () => {
    const index = indexedSample();

    expect(index.neighborhood('A')).toEqual(new Set([
      'A',
      'h-a',
      'h-b',
      'h-b-alt',
      'B',
      'C',
    ]));
  });

  it('includes every parallel hyperedge and all joint tails when selecting one member', () => {
    const index = indexedSample();

    expect(index.neighborhood('h-b')).toEqual(new Set([
      'h-b',
      'h-b-alt',
      'A',
      'B',
    ]));
    expect(index.parallelHyperedgeIdsById.get('h-b')).toEqual(new Set(['h-b', 'h-b-alt']));
  });

  it('returns only an unknown id and returns an empty set for no selection', () => {
    const index = indexedSample();

    expect(index.neighborhood('missing')).toEqual(new Set(['missing']));
    expect(index.neighborhood(null)).toEqual(new Set());
  });
});
