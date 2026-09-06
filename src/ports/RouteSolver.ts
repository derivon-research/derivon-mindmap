import type { WorkspaceGraph } from '../workspace/index';

/**
 * Solving a route is an external capability, like reading a workspace: the application
 * states which concepts are wanted and which are already understood, and a host-provided
 * implementation answers with a solved subgraph.
 *
 * The port speaks product vocabulary — concepts and derivations. Projecting them onto the
 * mathematical model is the implementation's job, and no caller depends on which engine
 * runs behind it.
 */
export type RouteRequest = {
  readonly targetConceptIds: readonly string[];
  readonly knownConceptIds: readonly string[];
};

/** Why a target could not be reached, in the terms the learner selected it in. */
export type RouteBlock = {
  readonly targetConceptId: string;
  readonly blockingConceptIds: readonly string[];
  readonly cycles: readonly (readonly string[])[];
};

export type RouteSolution = {
  readonly reachable: boolean;
  readonly conceptIds: readonly string[];
  readonly derivationIds: readonly string[];
  /** Derivations in an order the learner can actually follow. */
  readonly order: readonly string[];
  readonly cost: number | null;
  /** False when the search hit its budget and returned a bound rather than an optimum. */
  readonly provenOptimal: boolean;
  readonly blocked: readonly RouteBlock[];
};

export interface RouteSolver {
  solve(graph: WorkspaceGraph, request: RouteRequest): Promise<RouteSolution>;
}
