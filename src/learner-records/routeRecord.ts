/**
 * Turning a solved route into a `derivon.routes/v1` record, and asking whether a stored
 * record still describes the current graph. Both are pure: the record is compared through
 * `basis`, and `basis` never explains what changed, only that something did
 * ([learner records](../../docs/learner-records.md)).
 */
import type { RouteSolution } from '../ports/RouteSolver';
import type { ManifestGraph } from '../workspace/index';
import { routeBasis } from './basis';
import type { RouteRecord } from './protocol';

export type ConfirmRouteInput = {
  readonly id: string;
  readonly description: string;
  readonly graph: ManifestGraph;
  readonly solution: RouteSolution;
  readonly targets: readonly string[];
  readonly known: readonly string[];
};

/**
 * The record a confirmed route is written as. `known` is copied verbatim — it is the input
 * snapshot of *that* solve, never the live known set — and the subgraph is references only,
 * so nothing here copies an object's `data`.
 *
 * A solve that hit its budget reported a bound rather than a cost, and a route without a
 * cost cannot be written: the field is required and a bound is not an answer.
 */
export async function routeRecord(input: ConfirmRouteInput): Promise<RouteRecord> {
  const { solution } = input;
  if (solution.cost === null) throw new Error('这一次求解没有给出确定的成本，路线不能落盘');
  const conceptIds = [...solution.conceptIds];
  const derivationIds = [...solution.derivationIds];
  return {
    id: input.id,
    description: input.description,
    targets: [...input.targets],
    known: [...input.known],
    basis: await routeBasis(input.graph, [...conceptIds, ...derivationIds]),
    conceptIds,
    derivationIds,
    order: [...solution.order],
    cost: solution.cost,
  };
}

/** Whether a stored route was solved against a graph that is no longer the one on disk. */
export async function routeIsStale(graph: ManifestGraph, record: RouteRecord): Promise<boolean> {
  return await routeBasis(graph, [...record.conceptIds, ...record.derivationIds]) !== record.basis;
}
