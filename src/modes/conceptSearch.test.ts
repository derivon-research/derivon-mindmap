import { describe, expect, it } from 'vitest';
import type { WorkspaceGraph } from '../workspace/index';
import { searchConcepts } from './conceptSearch';

const graph: WorkspaceGraph = {
  points: [
    { id: 'svd', data: { label: '奇异值分解', document: 'docs/svd', tags: ['linear-algebra'] } },
    { id: 'singular-value', data: { label: '奇异值', document: 'docs/singular-value' } },
    { id: 'value-at-risk', data: { label: '在险价值 value', document: 'docs/var' } },
    { id: 'eigenvalue', data: { label: '特征值', document: 'docs/eigenvalue' } },
  ],
  hyperedges: [],
};

describe('searchConcepts', () => {
  it('finds a concept by its id, which is what a learner pasting a link has', () => {
    expect(searchConcepts(graph, 'svd').map((point) => point.id)).toEqual(['svd']);
  });

  it('puts the whole-label match ahead of the longer label that contains it', () => {
    expect(searchConcepts(graph, '奇异值').map((point) => point.id))
      .toEqual(['singular-value', 'svd']);
  });

  it('prefers a label that starts with the query over one that merely contains it', () => {
    expect(searchConcepts(graph, 'value').map((point) => point.id))
      .toEqual(['value-at-risk', 'singular-value', 'eigenvalue']);
  });

  it('ignores case, because nobody types an id the way it is spelled', () => {
    expect(searchConcepts(graph, 'SVD').map((point) => point.id)).toEqual(['svd']);
  });

  it('returns nothing for a blank query rather than the whole graph', () => {
    expect(searchConcepts(graph, '   ')).toEqual([]);
  });

  it('stops at the asked-for limit', () => {
    expect(searchConcepts(graph, '值', 1)).toHaveLength(1);
  });
});
