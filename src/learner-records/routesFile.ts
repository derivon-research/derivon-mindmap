/**
 * The application's side of `routes.json`: read a learner's confirmed routes, add one, delete
 * one. Each write is a read-modify-replace under the file version it read, so a write from the
 * script command surface in between loses cleanly and is retried once rather than overwritten
 * ([learner records](../../docs/learner-records.md)).
 *
 * Nothing here touches mastery. A route and a judgement share no state, and deleting one is a
 * learner action about that route alone.
 */
import type { RouteRecord } from './protocol';
import type { LearnerRecordStore } from './store';

export type RouteList = {
  readonly routes: readonly RouteRecord[];
  /** An unreadable `routes.json`. It is reported; it is never quietly replaced with an empty list. */
  readonly issue: string | null;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function readRoutes(store: LearnerRecordStore): Promise<RouteList> {
  try {
    const stored = await store.readRoutes();
    return stored.presence === 'present'
      ? { routes: stored.state.routes, issue: null }
      : { routes: [], issue: null };
  } catch (error) {
    return { routes: [], issue: messageOf(error) };
  }
}

/**
 * Read, change, replace — twice at most. The second attempt starts from a fresh read, so a
 * route confirmed while another writer was landing their own is added on top of theirs.
 * An unreadable file throws on the read, which is the point: replacing it would destroy
 * routes nobody can read.
 */
async function replace(
  store: LearnerRecordStore,
  mutate: (routes: readonly RouteRecord[]) => readonly RouteRecord[],
): Promise<RouteList> {
  for (let attempt = 0; ; attempt += 1) {
    const stored = await store.readRoutes();
    const current = stored.presence === 'present' ? stored.state.routes : [];
    const next = mutate(current);
    const precondition = stored.presence === 'present'
      ? { presence: 'present' as const, version: stored.version }
      : { presence: 'missing' as const };
    try {
      await store.writeRoutes({ routes: next }, precondition);
      return { routes: next, issue: null };
    } catch (error) {
      if (attempt >= 1) throw error;
    }
  }
}

/** A confirmed route joins the ones already there; several routes coexist. */
export function addRoute(store: LearnerRecordStore, record: RouteRecord): Promise<RouteList> {
  return replace(store, (routes) => [...routes, record]);
}

/** Deleting a route is an explicit learner action about that route and nothing else. */
export function removeRoute(store: LearnerRecordStore, routeId: string): Promise<RouteList> {
  return replace(store, (routes) => routes.filter((route) => route.id !== routeId));
}
