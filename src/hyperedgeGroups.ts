import type { Hyperedge } from './domain';

export type HyperedgeGroup = {
  key: string;
  nodeId: string;
  members: Hyperedge[];
};

export function hyperedgeGroupKey(hyperedge: Pick<Hyperedge, 'head' | 'tails'>): string {
  return JSON.stringify([hyperedge.head, [...hyperedge.tails].sort()]);
}

export function groupHyperedges(hyperedges: Hyperedge[]): HyperedgeGroup[] {
  const membersByKey = new Map<string, Hyperedge[]>();
  for (const hyperedge of hyperedges) {
    const key = hyperedgeGroupKey(hyperedge);
    const members = membersByKey.get(key);
    if (members) members.push(hyperedge);
    else membersByKey.set(key, [hyperedge]);
  }

  return [...membersByKey].map(([key, members]) => ({
    key,
    nodeId: members[0].id,
    members: [...members].sort((left, right) => left.weight - right.weight || left.id.localeCompare(right.id)),
  }));
}

export function activeHyperedge(group: HyperedgeGroup, preferredId?: string): Hyperedge {
  return group.members.find((member) => member.id === preferredId) ?? group.members[0];
}
