import type { AuthoringDocument } from './domain';
import { activeHyperedge, groupHyperedges, type HyperedgeGroup } from './hyperedgeGroups';
import {
  projectDocument,
  type GraphProjection,
  type ProjectedReplacementRole,
  type ReplacementControl,
} from './projection';

export type SceneConceptNode = {
  id: string;
  kind: 'concept';
  label: string;
  depth: number;
  replacementControls: ReplacementControl[];
  replacementRoles: ProjectedReplacementRole[];
};

export type SceneDerivationNode = {
  id: string;
  kind: 'derivation';
  semanticId: string;
  groupKey: string;
  weight: number;
  premiseCount: number;
  alternatives: Array<{ id: string; weight: number }>;
};

export type SceneNode = SceneConceptNode | SceneDerivationNode;

export type ScenePremiseEdge = {
  id: string;
  kind: 'premise';
  source: string;
  target: string;
  derivationId: string;
  premiseId: string;
};

export type SceneConclusionEdge = {
  id: string;
  kind: 'conclusion';
  source: string;
  target: string;
  derivationId: string;
};

export type SceneEdge = ScenePremiseEdge | SceneConclusionEdge;

export type SceneReplacementAssist = {
  id: string;
  kind: 'replacement-assist';
  replaceWith: string;
  targetId: string;
  memberIds: string[];
};

export type GraphScene = {
  nodes: SceneNode[];
  edges: SceneEdge[];
  replacementAssists: SceneReplacementAssist[];
  semanticIds: Set<string>;
};

export function createGraphScene(
  document: AuthoringDocument,
  activeDerivationByGroup: Readonly<Record<string, string>> = {},
  prepared: { projection: GraphProjection; groups: HyperedgeGroup[] } | null = null,
): GraphScene {
  const projection = prepared?.projection ?? projectDocument(document);
  const groups = prepared?.groups ?? groupHyperedges(projection.hyperedges);
  const pointById = new Map(document.graph.points.map((point) => [point.id, point]));
  const conceptNodes: SceneConceptNode[] = projection.points.map((point) => ({
    id: point.id,
    kind: 'concept',
    label: pointById.get(point.id)?.data.label ?? point.id,
    depth: point.depth,
    replacementControls: point.controls,
    replacementRoles: point.replacementRoles,
  }));
  const derivationNodes: SceneDerivationNode[] = [];
  const edges: SceneEdge[] = [];

  for (const group of groups) {
    const active = activeHyperedge(group, activeDerivationByGroup[group.key]);
    derivationNodes.push({
      id: group.nodeId,
      kind: 'derivation',
      semanticId: active.id,
      groupKey: group.key,
      weight: active.weight,
      premiseCount: active.tails.length,
      alternatives: group.members.map((member) => ({ id: member.id, weight: member.weight })),
    });
    active.tails.forEach((premiseId) => {
      edges.push({
        id: `premise:${group.nodeId}:${premiseId}`,
        kind: 'premise',
        source: premiseId,
        target: group.nodeId,
        derivationId: active.id,
        premiseId,
      });
    });
    edges.push({
      id: `head:${group.nodeId}`,
      kind: 'conclusion',
      source: group.nodeId,
      target: active.head,
      derivationId: active.id,
    });
  }

  return {
    nodes: [...conceptNodes, ...derivationNodes],
    edges,
    replacementAssists: projection.replacementAssists.map((assist) => ({
      ...assist,
      kind: 'replacement-assist',
    })),
    semanticIds: new Set([
      ...conceptNodes.map((node) => node.id),
      ...derivationNodes.flatMap((node) => node.alternatives.map((alternative) => alternative.id)),
    ]),
  };
}
