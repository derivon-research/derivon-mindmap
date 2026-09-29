import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthoringCommands } from '../../../synchronization';
import {
  generateObjectId, newRoute, readRoute, sameRoute,
  type Route, type RouteReading, type WorkspaceContent, type WorkspaceRoute,
} from '../../../workspace/index';

/** One line of the route list: a saved route, a saved route with unsaved edits, or a new one. */
export type RouteListEntry = {
  readonly id: string;
  readonly label: string;
  /** The effective route file, absent for a route that has never been saved. */
  readonly saved: WorkspaceRoute | null;
  /** The reading of what the list shows: the draft while there is one, otherwise the saved file. */
  readonly reading: RouteReading | null;
  readonly dirty: boolean;
};

export type RouteDrafts = {
  readonly entries: readonly RouteListEntry[];
  readonly selected: RouteListEntry | null;
  /** The route the editor shows for the selection: its draft, or the saved route. */
  readonly route: Route | null;
  select(id: string): void;
  create(): void;
  edit(route: Route): void;
  discard(): void;
  save(route: Route): void;
  remove(): void;
};

/**
 * The author's working copies of the workspace routes. Every route with unsaved edits has a
 * draft, kept outside effective content and protected against external updates; saving is one
 * content operation through the shared session, and so is deleting. A draft that comes back to
 * the saved route stops being a draft, so every draft held here is an unfinished edit.
 */
export function useRouteDrafts(
  content: WorkspaceContent,
  authoring: AuthoringCommands | undefined,
  workspaceId: string,
): RouteDrafts {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Route>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const savedById = useMemo(() => new Map(content.routes.map((route) => [route.id, route])), [content.routes]);

  // A saved route opens under its file's id, so saving it always rewrites that file.
  const savedRoute = (id: string): Route | null => {
    const route = savedById.get(id)?.route;
    return route ? (route.id === id ? route : { ...route, id }) : null;
  };

  const entries = useMemo<RouteListEntry[]>(() => {
    const saved = content.routes.map((file): RouteListEntry => {
      const draft = drafts.get(file.id);
      const dirty = Boolean(draft) && !sameRoute(draft!, file.route);
      return {
        id: file.id, label: (dirty ? draft!.label : file.route?.label) ?? '', saved: file, dirty,
        reading: dirty ? readRoute(content.graph, draft!) : file.reading,
      };
    });
    const created = [...drafts.values()].filter((draft) => !savedById.has(draft.id))
      .map((draft): RouteListEntry => ({ id: draft.id, label: draft.label, saved: null, dirty: true,
        reading: readRoute(content.graph, draft) }));
    return [...saved, ...created];
  }, [content.graph, content.routes, drafts, savedById]);

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const route = selected ? drafts.get(selected.id) ?? savedRoute(selected.id) : null;

  // Every unfinished draft is protected under its own key; a key is released once its draft is
  // gone. Reconciling against what is already protected makes a rerun with the same keys a no-op.
  const protectedKeys = useRef(new Set<string>());
  const draftKeys = useMemo(() => new Set(entries.filter((entry) => entry.dirty).map((entry) => `${workspaceId}:route:${entry.id}`)),
    [entries, workspaceId]);
  useEffect(() => {
    if (!authoring) return;
    for (const key of protectedKeys.current) if (!draftKeys.has(key)) authoring.protectDraft(key, false);
    for (const key of draftKeys) if (!protectedKeys.current.has(key)) authoring.protectDraft(key, true);
    protectedKeys.current = new Set(draftKeys);
  }, [authoring, draftKeys]);
  useEffect(() => () => {
    for (const key of protectedKeys.current) authoring?.protectDraft(key, false);
    protectedKeys.current = new Set();
  }, [authoring]);

  const forget = (id: string) => setDrafts((current) => {
    if (!current.has(id)) return current;
    const next = new Map(current);
    next.delete(id);
    return next;
  });

  return {
    entries,
    selected,
    route,
    select: setSelectedId,
    create() {
      const id = generateObjectId('r', [...savedById.keys(), ...drafts.keys()]);
      setDrafts((current) => new Map(current).set(id, newRoute(id, { label: '', known: [], targets: [] })));
      setSelectedId(id);
    },
    edit(next) {
      if (sameRoute(next, savedById.get(next.id)?.route)) forget(next.id);
      else setDrafts((current) => new Map(current).set(next.id, next));
    },
    discard() {
      if (!selected) return;
      forget(selected.id);
      if (!selected.saved) setSelectedId(null);
    },
    save(next) {
      if (!authoring) throw new Error('当前工作区不可创作');
      authoring.acceptWorkspaceRoute(next);
      forget(next.id);
    },
    remove() {
      if (!selected) return;
      if (selected.saved) {
        if (!authoring) throw new Error('当前工作区不可创作');
        authoring.deleteWorkspaceRoute(selected.id);
      }
      forget(selected.id);
      setSelectedId(null);
    },
  };
}
