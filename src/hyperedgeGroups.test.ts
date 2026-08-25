import { describe, expect, it } from 'vitest';
import type { Hyperedge } from './domain';
import { activeHyperedge, groupHyperedges, hyperedgeGroupKey } from './hyperedgeGroups';

function hyperedge(id: string, weight: number, tails: string[], head = 'B'): Hyperedge {
  return { id, weight, tails, head, data: { document: `docs/${id}`, format: 'html' } };
}

describe('parallel hyperedge groups', () => {
  it('groups equal tail sets regardless of source order', () => {
    const groups = groupHyperedges([
      hyperedge('h-slow', 8, ['C', 'A']),
      hyperedge('h-fast', 2, ['A', 'C']),
      hyperedge('h-other', 1, ['A'], 'D'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].members.map((member) => member.id)).toEqual(['h-fast', 'h-slow']);
    expect(groups[0].nodeId).toBe('h-slow');
    expect(hyperedgeGroupKey(groups[0].members[0])).toBe(hyperedgeGroupKey(groups[0].members[1]));
  });

  it('shows the cheapest member by default and honors an explicit choice', () => {
    const group = groupHyperedges([
      hyperedge('h-2', 5, ['A']),
      hyperedge('h-1', 2, ['A']),
    ])[0];

    expect(activeHyperedge(group).id).toBe('h-1');
    expect(activeHyperedge(group, 'h-2').id).toBe('h-2');
    expect(activeHyperedge(group, 'missing').id).toBe('h-1');
  });
});
