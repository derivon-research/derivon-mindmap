import { formatWeight } from './domain';
import type { GraphSceneRuntime, RuntimeSceneEdge, RuntimeSceneNode } from './graphSceneRuntime';
import { replacementAssistPath, type PathCommand } from './graphGeometry';
import type { ProjectedReplacementRole, ReplacementControl } from './projection';

export type G6SceneNodeData = {
  kind: RuntimeSceneNode['kind'];
  label: string;
  semanticId: string;
  identity: string;
  weight?: number;
  showLabel: boolean;
  replacementDepth: number;
  replacementRoles: ProjectedReplacementRole[];
  replacementControls: ReplacementControl[];
  stackDepth: number;
  showIdentity: boolean;
  showPorts: boolean;
  portsEnabled: boolean;
  interactive: boolean;
  draggable: boolean;
  opacity: number;
  zIndex: number;
};

export type G6SceneNode = {
  id: string;
  data: G6SceneNodeData;
  style: { x: number; y: number };
  states: string[];
};

export type G6SceneEdge = {
  id: string;
  source: string;
  target: string;
  data: {
    kind: RuntimeSceneEdge['kind'];
    derivationId: string;
    sourcePort: 'concept-out' | 'conclusion-out';
    targetPort: 'concept-in' | 'premise-in';
    backward: boolean;
    opacity: number;
  };
  states: string[];
};

export type G6ReplacementAssist = {
  id: string;
  replaceWith: string;
  targetId: string;
  memberIds: string[];
  path: PathCommand[];
  opacity: number;
};

export type G6SceneSnapshot = {
  nodes: G6SceneNode[];
  edges: G6SceneEdge[];
  replacementAssists: G6ReplacementAssist[];
  overviewLod: boolean;
  visualNodeCount: number;
  visualEdgeCount: number;
};

function statesForNode(node: RuntimeSceneNode): string[] {
  return [
    node.selected ? 'selected' : '',
    node.hovered ? 'hovered' : '',
    node.emphasized ? 'emphasized' : '',
    node.dimmed ? 'dimmed' : '',
    node.routeRole !== 'none' ? `route-${node.routeRole}` : '',
  ].filter(Boolean);
}

function statesForEdge(edge: RuntimeSceneEdge): string[] {
  return [
    edge.emphasized ? 'emphasized' : '',
    edge.dimmed ? 'dimmed' : '',
    edge.routeMember ? 'route' : '',
  ].filter(Boolean);
}

function nodeCenter(node: RuntimeSceneNode): { x: number; y: number } {
  return node.kind === 'concept'
    ? { x: node.position.x + 68, y: node.position.y + 32 }
    : { x: node.position.x + 27, y: node.position.y + 27 };
}

export function createG6SceneSnapshot(runtime: GraphSceneRuntime): G6SceneSnapshot {
  const nodes = runtime.nodes.map((node): G6SceneNode => {
    const active = node.selected || node.hovered || node.emphasized || node.routeRole !== 'none';
    return {
      id: node.id,
      data: {
        kind: node.kind,
        label: node.kind === 'concept' ? node.label || '未命名' : formatWeight(node.weight),
        semanticId: node.kind === 'concept' ? node.id : node.semanticId,
        identity: node.kind === 'concept' ? node.id : node.semanticId,
        weight: node.kind === 'derivation' ? node.weight : undefined,
        showLabel: true,
        replacementDepth: node.kind === 'concept' ? node.depth : 0,
        replacementRoles: node.kind === 'concept' ? node.replacementRoles : [],
        replacementControls: node.kind === 'concept' ? node.replacementControls : [],
        stackDepth: node.kind === 'derivation' ? Math.min(2, Math.max(0, node.alternatives.length - 1)) : 0,
        showIdentity: node.kind === 'concept',
        showPorts: !node.dimmed,
        portsEnabled: node.connectable,
        interactive: node.interactive,
        draggable: node.draggable,
        opacity: node.dimmed ? 0.16 : 1,
        zIndex: node.dimmed ? 0 : active ? 10 : 1,
      },
      style: nodeCenter(node),
      states: statesForNode(node),
    };
  });
  const centerById = new Map(nodes.map((node) => [node.id, node.style]));
  const edges = runtime.edges.map((edge): G6SceneEdge => {
    const source = centerById.get(edge.source);
    const target = centerById.get(edge.target);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: {
        kind: edge.kind,
        derivationId: edge.derivationId,
        sourcePort: edge.kind === 'premise' ? 'concept-out' : 'conclusion-out',
        targetPort: edge.kind === 'premise' ? 'premise-in' : 'concept-in',
        backward: !!source && !!target && target.x < source.x,
        opacity: edge.routeMember || edge.emphasized ? 1 : edge.dimmed ? 0.08 : 0.18,
      },
      states: statesForEdge(edge),
    };
  });
  const runtimeCenterById = new Map(runtime.nodes.map((node) => [node.id, nodeCenter(node)]));
  const replacementAssists = runtime.replacementAssists.flatMap((assist): G6ReplacementAssist[] => {
    const target = runtimeCenterById.get(assist.targetId);
    const members = assist.memberIds.flatMap((id) => {
      const center = runtimeCenterById.get(id);
      return center ? [center] : [];
    });
    if (!target || !members.length) return [];
    return [{
      id: assist.id,
      replaceWith: assist.replaceWith,
      targetId: assist.targetId,
      memberIds: assist.memberIds,
      path: replacementAssistPath(target, members),
      opacity: assist.dimmed ? 0.14 : 0.55,
    }];
  });
  return {
    nodes,
    edges,
    replacementAssists,
    overviewLod: false,
    visualNodeCount: runtime.nodes.length,
    visualEdgeCount: runtime.edges.length,
  };
}
