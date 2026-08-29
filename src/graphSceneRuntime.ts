import type { Position } from './domain';
import type { GraphScene, SceneEdge, SceneNode, SceneReplacementAssist } from './graphScene';

export type SceneRouteRole = 'none' | 'member' | 'start' | 'target' | 'start-target';

export type RuntimeSceneNode = SceneNode & {
  position: Position;
  selected: boolean;
  hovered: boolean;
  emphasized: boolean;
  dimmed: boolean;
  interactive: boolean;
  draggable: boolean;
  connectable: boolean;
  routeRole: SceneRouteRole;
};

export type RuntimeSceneEdge = SceneEdge & {
  emphasized: boolean;
  dimmed: boolean;
  routeMember: boolean;
};

export type RuntimeReplacementAssist = SceneReplacementAssist & {
  dimmed: boolean;
};

export type GraphSceneRuntime = {
  nodes: RuntimeSceneNode[];
  edges: RuntimeSceneEdge[];
  replacementAssists: RuntimeReplacementAssist[];
};

export type GraphSceneRuntimeInput = {
  positions: Readonly<Record<string, Position>>;
  positionOverrides?: Readonly<Record<string, Position>>;
  selectedIds?: ReadonlySet<string>;
  activeIds?: ReadonlySet<string>;
  hoveredIds?: ReadonlySet<string>;
  hoveredId?: string | null;
  routeIds?: ReadonlySet<string>;
  routeDerivationIds?: ReadonlySet<string>;
  routeStartIds?: ReadonlySet<string>;
  routeTargetIds?: ReadonlySet<string>;
  focusActive?: boolean;
  hoverActive?: boolean;
  routeActive?: boolean;
  nodeInteractionsDisabled?: boolean;
  dragDisabled?: boolean;
  connectionDisabled?: boolean;
};

export type KeyedDiff<T extends { id: string }> = {
  added: T[];
  updated: T[];
  removed: string[];
};

export type GraphSceneRuntimeDiff = {
  nodes: KeyedDiff<RuntimeSceneNode>;
  edges: KeyedDiff<RuntimeSceneEdge>;
  replacementAssists: KeyedDiff<RuntimeReplacementAssist>;
};

function nodeMatches(ids: ReadonlySet<string>, node: SceneNode): boolean {
  return ids.has(node.id) || (node.kind === 'derivation' && ids.has(node.semanticId));
}

function routeRole(
  id: string,
  routeIds: ReadonlySet<string>,
  startIds: ReadonlySet<string>,
  targetIds: ReadonlySet<string>,
): SceneRouteRole {
  const start = startIds.has(id);
  const target = targetIds.has(id);
  if (start && target) return 'start-target';
  if (start) return 'start';
  if (target) return 'target';
  return routeIds.has(id) ? 'member' : 'none';
}

export function createGraphSceneRuntime(
  scene: GraphScene,
  input: GraphSceneRuntimeInput,
): GraphSceneRuntime {
  const selectedIds = input.selectedIds ?? new Set<string>();
  const activeIds = input.activeIds ?? new Set<string>();
  const hoveredIds = input.hoveredIds ?? new Set<string>();
  const routeIds = input.routeIds ?? new Set<string>();
  const routeDerivationIds = input.routeDerivationIds ?? new Set<string>();
  const routeStartIds = input.routeStartIds ?? new Set<string>();
  const routeTargetIds = input.routeTargetIds ?? new Set<string>();
  const routeActive = input.routeActive ?? false;
  const focusActive = input.focusActive ?? false;
  const hoverActive = input.hoverActive ?? false;
  const directlyHoveredIds = input.hoveredId ? new Set([input.hoveredId]) : new Set<string>();
  const nodeInteractionsDisabled = input.nodeInteractionsDisabled ?? false;
  const dragDisabled = input.dragDisabled ?? false;
  const connectionDisabled = input.connectionDisabled ?? false;

  return {
    nodes: scene.nodes.map((node): RuntimeSceneNode => {
      const routeMember = node.kind === 'concept'
        ? routeIds.has(node.id)
        : routeDerivationIds.has(node.semanticId);
      const emphasized = routeActive
        ? routeMember
        : focusActive
          ? nodeMatches(activeIds, node)
          : hoverActive && nodeMatches(hoveredIds, node);
      const dimmed = (routeActive || focusActive) && !emphasized;
      const interactive = !dimmed && !nodeInteractionsDisabled;
      return {
        ...node,
        position: input.positionOverrides?.[node.id] ?? input.positions[node.id] ?? { x: 0, y: 0 },
        selected: selectedIds.has(node.id) && !dimmed,
        hovered: nodeMatches(directlyHoveredIds, node) && interactive,
        emphasized,
        dimmed,
        interactive,
        draggable: interactive && !dragDisabled,
        connectable: interactive && !connectionDisabled,
        routeRole: node.kind === 'concept'
          ? routeRole(node.id, routeIds, routeStartIds, routeTargetIds)
          : routeMember ? 'member' : 'none',
      };
    }),
    edges: scene.edges.map((edge): RuntimeSceneEdge => {
      const derivationNodeId = edge.kind === 'premise' ? edge.target : edge.source;
      const routeMember = routeDerivationIds.has(edge.derivationId);
      const emphasized = routeActive
        ? routeMember
        : focusActive
          ? activeIds.has(derivationNodeId) || activeIds.has(edge.derivationId)
          : hoverActive && (hoveredIds.has(derivationNodeId) || hoveredIds.has(edge.derivationId));
      return {
        ...edge,
        emphasized,
        dimmed: (routeActive || focusActive) && !emphasized,
        routeMember,
      };
    }),
    replacementAssists: scene.replacementAssists.map((assist): RuntimeReplacementAssist => ({
      ...assist,
      dimmed: routeActive || (focusActive && ![assist.targetId, ...assist.memberIds].some((id) => activeIds.has(id))),
    })),
  };
}

function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => equalValue(leftRecord[key], rightRecord[key]));
}

function keyedDiff<T extends { id: string }>(previous: T[], next: T[]): KeyedDiff<T> {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  const added: T[] = [];
  const updated: T[] = [];
  for (const item of next) {
    const old = previousById.get(item.id);
    if (!old) added.push(item);
    else if (!equalValue(old, item)) updated.push(item);
  }
  return {
    added,
    updated,
    removed: previous.filter((item) => !nextIds.has(item.id)).map((item) => item.id),
  };
}

export function diffGraphSceneRuntime(
  previous: GraphSceneRuntime,
  next: GraphSceneRuntime,
): GraphSceneRuntimeDiff {
  return {
    nodes: keyedDiff(previous.nodes, next.nodes),
    edges: keyedDiff(previous.edges, next.edges),
    replacementAssists: keyedDiff(previous.replacementAssists, next.replacementAssists),
  };
}
