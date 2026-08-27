import { invoke } from '@tauri-apps/api/core';
import type { AuthoringDocument } from './domain';

export type RouteBudget = {
  maxNodes: number;
  maxMillis: number;
};

export type RouteResponse = {
  reachable: boolean;
  hyperedgeIds: string[];
  executableOrder: string[];
  pointIds: string[];
  cost: number | null;
  lower: number | null;
  upper: number | null;
  provenOptimal: boolean;
  nodes: number;
  millis: number;
  blockingPointIds: string[];
  cycles: string[][];
};

export type RouteSelection = {
  startPointIds: string[];
  targetPointId: string | null;
  result: RouteResponse | null;
};

export const DEFAULT_ROUTE_BUDGET: RouteBudget = {
  maxNodes: 200_000,
  maxMillis: 200,
};

export function createRouteSelection(): RouteSelection {
  return { startPointIds: [], targetPointId: null, result: null };
}

export function toggleRouteStart(selection: RouteSelection, pointId: string): RouteSelection {
  const selected = new Set(selection.startPointIds);
  if (selected.has(pointId)) selected.delete(pointId);
  else selected.add(pointId);
  return { ...selection, startPointIds: [...selected].sort(), result: null };
}

export function setRouteTarget(selection: RouteSelection, pointId: string | null): RouteSelection {
  return { ...selection, targetPointId: pointId, result: null };
}

export function invalidateRoute(selection: RouteSelection): RouteSelection {
  return selection.result ? { ...selection, result: null } : selection;
}

export function routeHighlightIds(result: RouteResponse | null): Set<string> {
  return new Set(result ? [...result.pointIds, ...result.hyperedgeIds] : []);
}

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export async function solveWorkspaceRoute(
  workspace: AuthoringDocument,
  selection: RouteSelection,
  budget: RouteBudget = DEFAULT_ROUTE_BUDGET,
): Promise<RouteResponse> {
  if (!selection.targetPointId) throw new Error('请先选择目标概念');
  if (!isTauriRuntime()) throw new Error('路线求解需要在 Derivon 本地应用中运行');
  return invoke<RouteResponse>('solve_route', {
    request: {
      workspace,
      startPointIds: selection.startPointIds,
      targetPointId: selection.targetPointId,
      budget,
    },
  });
}
