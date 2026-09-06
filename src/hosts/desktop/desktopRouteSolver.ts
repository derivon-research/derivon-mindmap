import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { RouteRequest, RouteSolution, RouteSolver } from '../../ports/RouteSolver';
import { WORKSPACE_SCHEMA, type WorkspaceGraph } from '../../workspace/index';
import type { DesktopInvoke } from './desktopWorkspaceSource';

type NativeRouteResponse = {
  reachable: boolean;
  hyperedgeIds: string[];
  executableOrder: string[];
  pointIds: string[];
  cost: number | null;
  provenOptimal: boolean;
  targetDiagnoses: { targetPointId: string; blockingPointIds: string[]; cycles: string[][] }[];
};

/** A preview stays interactive; a longer search belongs to a deliberate action. */
const PREVIEW_BUDGET = { maxNodes: 200_000, maxMillis: 200 };

/** The desktop host solves through `derivon-core`, over the same IPC as its other capabilities. */
export function createDesktopRouteSolver(invoke: DesktopInvoke = tauriInvoke): RouteSolver {
  return {
    async solve(graph: WorkspaceGraph, request: RouteRequest): Promise<RouteSolution> {
      if (!request.targetConceptIds.length) throw new Error('请至少选择一个目标概念');
      const response = await invoke<NativeRouteResponse>('solve_route', {
        request: {
          workspace: { schema: WORKSPACE_SCHEMA, graph },
          startPointIds: [...request.knownConceptIds],
          targetPointIds: [...request.targetConceptIds],
          budget: PREVIEW_BUDGET,
        },
      });
      return {
        reachable: response.reachable,
        conceptIds: response.pointIds,
        derivationIds: response.hyperedgeIds,
        order: response.executableOrder,
        cost: response.cost,
        provenOptimal: response.provenOptimal,
        blocked: response.targetDiagnoses.map((diagnosis) => ({
          targetConceptId: diagnosis.targetPointId,
          blockingConceptIds: diagnosis.blockingPointIds,
          cycles: diagnosis.cycles,
        })),
      };
    },
  };
}
