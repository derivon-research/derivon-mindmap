import { useEffect, useState } from 'react';
import {
  readPersonalRoutes, savePersonalRoute,
  type LearnerRecordStore, type PersonalRouteStanding, type StoredPersonalRoute,
} from '../../learner-records';
import {
  copyAsPersonal, errorMessage, generateObjectId, newRoute, routeFileName, sameRoute,
  type Route, type WorkspaceGraph, type WorkspaceRoute,
} from '../../workspace/index';
import { personalEntryKey } from './RouteShelf';

/** The personal route files as listed, or why the directory could not be listed. */
type PersonalRouteListing = {
  readonly routes: readonly StoredPersonalRoute[];
  readonly issue: string | null;
};

const NO_ROUTES: PersonalRouteListing = { routes: [], issue: null };
const NO_STANDINGS: readonly PersonalRouteStanding[] = [];

/** Every personal route file, or the reason there is no list: never an empty list in its place. */
async function listRoutes(store: LearnerRecordStore): Promise<PersonalRouteListing> {
  try {
    return { routes: await store.listRoutes(), issue: null };
  } catch (error) {
    return { routes: [], issue: errorMessage(error) };
  }
}

/**
 * The personal route being edited: the draft, and the file it replaces when saved — `null`
 * for a route that has never been saved, a copy or a blank one, which is written as a new file.
 */
type PersonalDraft = {
  readonly route: Route;
  readonly saved: { readonly route: Route; readonly version: string } | null;
};

export type PersonalRouteDrafts = {
  /**
   * Every personal route file, each read on the current graph: validated like any route and
   * checked for staleness. Both are derived on read, never written.
   */
  readonly standings: readonly PersonalRouteStanding[];
  /** Why the routes directory could not be listed, or null. */
  readonly issue: string | null;
  /** The last write that refused, until the next write starts. */
  readonly writeError: string | null;
  /** The shelf entry being looked at; a save points it at the file it wrote. */
  readonly selection: string | null;
  /** Look at another shelf entry. A draft with no changes closes; one with changes stays. */
  select(key: string): void;
  /** The route in the editor, or null. It survives view switches, like every other draft. */
  readonly draft: Route | null;
  /** Whether the draft replaces a file when saved, rather than writing a new one. */
  readonly draftSaved: boolean;
  /** Whether the draft differs from its file; a never-saved draft always does. */
  readonly dirty: boolean;
  /** A new route id, unique among this learner's routes and the workspace's. */
  newRouteId(): string;
  /** Write a confirmed solve as a new personal route. False when the write refused; `writeError` says why. */
  confirm(route: Route): Promise<boolean>;
  /** Delete one personal route file at the version listed. Never touches mastery. */
  remove(routeId: string): Promise<void>;
  /** «另存为我的路线并修改»: an unsaved copy of a workspace route, in the editor. */
  copy(workspaceRouteId: string): void;
  /** «修改»: the personal route as saved, in the editor. */
  edit(routeId: string): void;
  /** «创建我的路线»: blank but for what the learner already knows. */
  create(known: readonly string[]): void;
  change(route: Route): void;
  /** Save the draft as its file. A refusal propagates, and the draft is kept. */
  save(route: Route): Promise<void>;
  /** Close the editor, dropping the draft's changes. */
  close(): void;
  /** Delete the draft's file. A refusal propagates. */
  removeDraft(): Promise<void>;
};

/**
 * The learning side's personal routes: listing them, reading them on the graph, and the one
 * draft being edited, with every write going to the learner records and never the workspace.
 * A workspace route copied here becomes a new personal file that the author's later changes
 * never reach. With no learner records there is nothing to list and nothing is written.
 */
export function usePersonalRouteDrafts({ learnerRecords, graph, workspaceRoutes, activeRouteId, onSelectRoute }: {
  readonly learnerRecords: LearnerRecordStore | undefined;
  readonly graph: WorkspaceGraph;
  readonly workspaceRoutes: readonly WorkspaceRoute[];
  readonly activeRouteId: string | null;
  readonly onSelectRoute: (routeId: string | null) => void;
}): PersonalRouteDrafts {
  const [listed, setListed] = useState<PersonalRouteListing>(NO_ROUTES);
  const [standings, setStandings] = useState<readonly PersonalRouteStanding[]>(NO_STANDINGS);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonalDraft | null>(null);

  useEffect(() => {
    if (!learnerRecords) { setListed(NO_ROUTES); return; }
    let cancelled = false;
    void listRoutes(learnerRecords).then((value) => { if (!cancelled) setListed(value); });
    return () => { cancelled = true; };
  }, [learnerRecords]);

  // A route that no longer fits the graph is reported and kept, not re-solved, repaired or deleted.
  useEffect(() => {
    let cancelled = false;
    void readPersonalRoutes(graph, listed.routes).then((value) => { if (!cancelled) setStandings(value); });
    return () => { cancelled = true; };
  }, [graph, listed]);

  const relist = async (store: LearnerRecordStore) => setListed(await listRoutes(store));
  const dirty = draft !== null && !sameRoute(draft.route, draft.saved?.route);

  const newRouteId = () => generateObjectId('r', [
    ...listed.routes.flatMap((entry) => (entry.routeId === null ? [] : [entry.routeId])),
    ...workspaceRoutes.map((entry) => entry.id),
  ]);

  return {
    standings,
    issue: listed.issue,
    writeError,
    selection,
    select(key) {
      setSelection(key);
      if (!dirty) setDraft(null);
    },
    draft: draft?.route ?? null,
    draftSaved: draft?.saved != null,
    dirty,
    newRouteId,
    async confirm(route) {
      if (!learnerRecords) return false;
      setWriteError(null);
      try {
        // A new file: nothing can be there yet, and if something is, the write loses cleanly.
        await savePersonalRoute(learnerRecords, graph, route, { presence: 'missing' });
        await relist(learnerRecords);
        return true;
      } catch (error) {
        setWriteError(errorMessage(error));
        return false;
      }
    },
    async remove(routeId) {
      if (!learnerRecords) return;
      const entry = listed.routes.find((route) => route.routeId === routeId);
      if (!entry?.version) return;
      setWriteError(null);
      try {
        await learnerRecords.deleteRoute(routeId, entry.version);
        if (activeRouteId === routeId) onSelectRoute(null);
      } catch (error) {
        setWriteError(errorMessage(error));
      }
      await relist(learnerRecords);
    },
    copy(workspaceRouteId) {
      const original = workspaceRoutes.find((route) => route.id === workspaceRouteId)?.route;
      if (original) setDraft({ route: copyAsPersonal(original, newRouteId()), saved: null });
    },
    edit(routeId) {
      const entry = listed.routes.find((route) => route.routeId === routeId);
      if (entry?.status === 'ready') setDraft({ route: entry.route, saved: { route: entry.route, version: entry.version } });
    },
    create(known) {
      setDraft({ route: newRoute(newRouteId(), { label: '', known, targets: [] }), saved: null });
    },
    change(route) {
      setDraft((current) => (current ? { ...current, route } : current));
    },
    async save(route) {
      if (!learnerRecords || !draft) return;
      await savePersonalRoute(learnerRecords, graph, route,
        draft.saved ? { presence: 'present', version: draft.saved.version } : { presence: 'missing' });
      setWriteError(null);
      await relist(learnerRecords);
      setSelection(personalEntryKey(routeFileName(route.id)));
      setDraft(null);
    },
    close() {
      setDraft(null);
    },
    async removeDraft() {
      if (!learnerRecords || !draft?.saved) return;
      const routeId = draft.saved.route.id;
      try {
        await learnerRecords.deleteRoute(routeId, draft.saved.version);
      } finally {
        await relist(learnerRecords);
      }
      if (activeRouteId === routeId) onSelectRoute(null);
      setDraft(null);
    },
  };
}
