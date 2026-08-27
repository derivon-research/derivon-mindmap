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
  targetDiagnoses: Array<{
    targetPointId: string;
    blockingPointIds: string[];
    cycles: string[][];
  }>;
};

export type RouteSelection = {
  startPointIds: string[];
  targetPointIds: string[];
  result: RouteResponse | null;
};

export const DEFAULT_ROUTE_BUDGET: RouteBudget = {
  maxNodes: 200_000,
  maxMillis: 200,
};

export function createRouteSelection(): RouteSelection {
  return { startPointIds: [], targetPointIds: [], result: null };
}

function togglePointId(pointIds: string[], pointId: string): string[] {
  const selected = new Set(pointIds);
  if (selected.has(pointId)) selected.delete(pointId);
  else selected.add(pointId);
  return [...selected].sort();
}

export function toggleRouteStart(selection: RouteSelection, pointId: string): RouteSelection {
  return { ...selection, startPointIds: togglePointId(selection.startPointIds, pointId), result: null };
}

export function toggleRouteTarget(selection: RouteSelection, pointId: string): RouteSelection {
  return { ...selection, targetPointIds: togglePointId(selection.targetPointIds, pointId), result: null };
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
  if (!selection.targetPointIds.length) throw new Error('请至少选择一个目标概念');
  if (!isTauriRuntime()) throw new Error('路线求解需要在 Derivon 本地应用中运行');
  return invoke<RouteResponse>('solve_route', {
    request: {
      workspace,
      startPointIds: selection.startPointIds,
      targetPointIds: selection.targetPointIds,
      budget,
    },
  });
}
