import type { AuthoringDocument, Hyperedge, Point } from './domain';
import { hyperedgeGroupKey } from './hyperedgeGroups';

export type GraphIndex = {
  pointById: ReadonlyMap<string, Point>;
  hyperedgeById: ReadonlyMap<string, Hyperedge>;
  incidentHyperedgeIdsByPoint: ReadonlyMap<string, ReadonlySet<string>>;
  parallelHyperedgeIdsById: ReadonlyMap<string, ReadonlySet<string>>;
  neighborhood: (id: string | null) => Set<string>;
};

export function createGraphIndex(document: AuthoringDocument): GraphIndex {
  const pointById = new Map(document.graph.points.map((point) => [point.id, point]));
  const hyperedgeById = new Map(document.graph.hyperedges.map((hyperedge) => [hyperedge.id, hyperedge]));
  const incidentHyperedgeIdsByPoint = new Map<string, Set<string>>();
  const groupIdsByKey = new Map<string, Set<string>>();

  const addIncident = (pointId: string, hyperedgeId: string) => {
    const incident = incidentHyperedgeIdsByPoint.get(pointId) ?? new Set<string>();
    incident.add(hyperedgeId);
    incidentHyperedgeIdsByPoint.set(pointId, incident);
  };

  for (const hyperedge of document.graph.hyperedges) {
    addIncident(hyperedge.head, hyperedge.id);
    hyperedge.tails.forEach((tail) => addIncident(tail, hyperedge.id));
    const key = hyperedgeGroupKey(hyperedge);
    const groupIds = groupIdsByKey.get(key) ?? new Set<string>();
    groupIds.add(hyperedge.id);
    groupIdsByKey.set(key, groupIds);
  }

  const parallelHyperedgeIdsById = new Map<string, ReadonlySet<string>>();
  for (const groupIds of groupIdsByKey.values()) {
    for (const id of groupIds) parallelHyperedgeIdsById.set(id, groupIds);
  }

  const neighborhood = (id: string | null): Set<string> => {
    if (!id) return new Set();
    const ids = new Set([id]);
    const relevantHyperedgeIds = hyperedgeById.has(id)
      ? parallelHyperedgeIdsById.get(id) ?? new Set([id])
      : incidentHyperedgeIdsByPoint.get(id) ?? new Set<string>();

    for (const hyperedgeId of relevantHyperedgeIds) {
      const hyperedge = hyperedgeById.get(hyperedgeId);
      if (!hyperedge) continue;
      ids.add(hyperedge.id);
      ids.add(hyperedge.head);
      hyperedge.tails.forEach((tail) => ids.add(tail));
    }
    return ids;
  };

  return {
    pointById,
    hyperedgeById,
    incidentHyperedgeIdsByPoint,
    parallelHyperedgeIdsById,
    neighborhood,
  };
}
