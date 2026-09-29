/**
 * Personal routes: `derivon.route/v1` files in the learner record. The protocol is the route
 * module's (`src/workspace/route.ts`); what being a learner record adds is here — the `basis`
 * a personal route is saved with, whether it still matches the graph, how a confirmed solve
 * becomes one, and the one save path that refuses a route with an error
 * ([learner records](../../docs/learner-records.md#personal-routes--routesroute-idjson)).
 *
 * `basis` never explains what changed, only that something did, and a route whose `basis` no
 * longer matches is reported, never re-solved, edited or deleted.
 */
import type { RouteSolution } from '../ports/RouteSolver';
import type { LearnerRecordWritePrecondition } from '../ports/LearnerRecordFiles';
import {
  draftFromSolution, newRoute, readRoute, routeObjectIds,
  type ManifestGraph, type Route, type RouteReading,
} from '../workspace/index';
import { routeBasis } from './basis';
import type { LearnerRecordStore, StoredPersonalRoute } from './store';

/** `route` with the basis of `graph` now: recomputed on every save, never carried over. */
export async function withRouteBasis(graph: ManifestGraph, route: Route): Promise<Route> {
  return { ...route, basis: await routeBasis(graph, routeObjectIds(graph, route)) };
}

/**
 * Whether a personal route was saved against a graph that is no longer the one on disk. A
 * route with no `basis` at all cannot be checked, and a basis that cannot be checked never
 * counts as a match.
 */
export async function personalRouteIsStale(graph: ManifestGraph, route: Route): Promise<boolean> {
  if (route.basis === undefined) return true;
  return (await withRouteBasis(graph, route)).basis !== route.basis;
}

export type ConfirmRouteInput = {
  readonly id: string;
  /** The name the route is shown by. */
  readonly label: string;
  readonly solution: RouteSolution;
  readonly targets: readonly string[];
  /** The input snapshot of *that* solve, never the live known set as it is later. */
  readonly known: readonly string[];
};

/**
 * The personal route a confirmed solve is written as: the solve's executable order as the
 * route's written order. It carries no `basis` yet; saving computes it.
 */
export function confirmedRoute(input: ConfirmRouteInput): Route {
  const draft = newRoute(input.id, { label: input.label, known: input.known, targets: input.targets });
  return { ...draftFromSolution(draft, input.solution), ordered: true };
}

/**
 * Save a personal route: validate it against `graph`, refuse it if it has any error, compute
 * its `basis` from `graph`, and write its file under `precondition`. This is the one way the
 * application writes a personal route, whether it was confirmed, copied or edited.
 */
export async function savePersonalRoute(
  store: LearnerRecordStore,
  graph: ManifestGraph,
  route: Route,
  precondition: LearnerRecordWritePrecondition,
): Promise<{ readonly route: Route; readonly version: string }> {
  const saved = await withRouteBasis(graph, route);
  const reading = readRoute(graph, saved, { location: 'personal' });
  if (reading.errors > 0) {
    throw new Error(reading.diagnostics.filter((item) => item.severity === 'error')
      .slice(0, 4).map((item) => item.message).join('\n'));
  }
  return { route: saved, version: await store.writeRoute(saved, precondition) };
}

/**
 * A listed personal route as the learning side shows it. A readable file is also read on the
 * graph — with its file name, so an id that does not match the name is an error — and checked
 * for staleness. It can be started exactly when it is `ready` with no error.
 */
export type PersonalRouteStanding =
  | (Extract<StoredPersonalRoute, { status: 'ready' }> & {
    readonly reading: RouteReading;
    readonly stale: boolean;
  })
  | Extract<StoredPersonalRoute, { status: 'unreadable' }>;

export async function readPersonalRoutes(
  graph: ManifestGraph,
  stored: readonly StoredPersonalRoute[],
): Promise<readonly PersonalRouteStanding[]> {
  return Promise.all(stored.map(async (entry): Promise<PersonalRouteStanding> => {
    if (entry.status === 'unreadable') return entry;
    return {
      ...entry,
      reading: readRoute(graph, entry.route, { location: 'personal', fileName: entry.fileName }),
      stale: await personalRouteIsStale(graph, entry.route),
    };
  }));
}

/** Whether a listed route can be walked: readable, and valid on the current graph. */
export function canStartPersonalRoute(standing: PersonalRouteStanding): boolean {
  return standing.status === 'ready' && standing.reading.errors === 0;
}
