import type { WorkspaceGraph } from '../workspace/index';

/**
 * Solving a route is a host capability, like reading a workspace: the application states
 * which concepts are wanted and which are already understood, and the implementation
 * answers with a solved subgraph.
 *
 * The port speaks product vocabulary; projecting it onto the mathematical model belongs to
 * the implementation.
 */
export type RouteRequest = {
  readonly targetConceptIds: readonly string[];
  readonly knownConceptIds: readonly string[];
};

/** Why a target could not be reached, in the terms it was selected in. */
export type RouteBlock = {
  readonly targetConceptId: string;
  readonly blockingConceptIds: readonly string[];
  readonly cycles: readonly (readonly string[])[];
};

export type RouteSolution = {
  readonly reachable: boolean;
  readonly conceptIds: readonly string[];
  readonly derivationIds: readonly string[];
  /** Derivations in an order the learner can follow. */
  readonly order: readonly string[];
  readonly cost: number | null;
  /** False when the search hit its budget and returned a bound. */
  readonly provenOptimal: boolean;
  readonly blocked: readonly RouteBlock[];
};

export interface RouteSolver {
  solve(graph: WorkspaceGraph, request: RouteRequest): Promise<RouteSolution>;
}
