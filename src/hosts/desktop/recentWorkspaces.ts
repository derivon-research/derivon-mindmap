import type { LearnerRecordMigration, RecentWorkspace } from '../../app/host';

export const RECENT_WORKSPACES_KEY = 'derivon.recent-workspaces/v1';
const RECENT_WORKSPACES_VERSION = 1;
const RECENT_WORKSPACES_LIMIT = 8;

export type RecentWorkspaceStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type StoredWorkspace = {
  path: string;
  name: string;
  /** The manifest `id`. Absent in entries written before learner records existed. */
  workspaceId?: string;
  openedAtMs: number;
};

export type OpenedWorkspace = {
  readonly path: string;
  readonly name: string;
  /** The workspace `id` from the manifest — the learner record's key, not the path. */
  readonly workspaceId: string;
};

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredWorkspace>;
  return typeof candidate.path === 'string'
    && typeof candidate.name === 'string'
    && (candidate.workspaceId === undefined || typeof candidate.workspaceId === 'string')
    && typeof candidate.openedAtMs === 'number';
}

/** Tolerant on purpose: a damaged list costs the launch frame nothing, so never throw. */
function readStored(storage: RecentWorkspaceStorage): StoredWorkspace[] {
  let parsed: unknown;
  try {
    const raw = storage.getItem(RECENT_WORKSPACES_KEY);
    if (!raw) return [];
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const document = parsed as { version?: unknown; workspaces?: unknown };
  if (document.version !== RECENT_WORKSPACES_VERSION) return [];
  if (!Array.isArray(document.workspaces)) return [];
  return document.workspaces
    .filter(isStoredWorkspace)
    .sort((left, right) => right.openedAtMs - left.openedAtMs);
}

export function readRecentWorkspaces(storage: RecentWorkspaceStorage): RecentWorkspace[] {
  return readStored(storage).map((workspace) => ({
    id: workspace.path,
    name: workspace.name,
    detail: workspace.path,
  }));
}

export function rememberWorkspace(
  storage: RecentWorkspaceStorage,
  workspace: OpenedWorkspace,
  openedAtMs: number = Date.now(),
): void {
  const workspaces = [
    {
      path: workspace.path,
      name: workspace.name,
      workspaceId: workspace.workspaceId,
      openedAtMs,
    },
    ...readStored(storage).filter((stored) => stored.path !== workspace.path),
  ].slice(0, RECENT_WORKSPACES_LIMIT);
  storage.setItem(
    RECENT_WORKSPACES_KEY,
    JSON.stringify({ version: RECENT_WORKSPACES_VERSION, workspaces }),
  );
}

/**
 * The `id → last path it was seen at` index, read to notice a hand-edited id or the same id
 * appearing at a new path. It only *notices*: nothing here renames, deletes or re-keys a
 * record, so a conflict is reported rather than silently resolved (ADR-0009).
 *
 * The index is the recent-workspaces list itself, exactly as #99 asks it to be reused, so it
 * is best effort by construction: it holds the last few opens and entries written before the
 * id was stored carry none. What it can never do is lose a record — nothing outside
 * `learner-records/` is touched here.
 *
 * A hand-edited id wins over a same-id sighting, because it is the one that strands a record
 * under an id nothing will read again.
 */
export function detectLearnerRecordMigration(
  storage: RecentWorkspaceStorage,
  opened: OpenedWorkspace,
): LearnerRecordMigration | null {
  const stored = readStored(storage);
  const atPath = stored.find((entry) => entry.path === opened.path);
  if (atPath?.workspaceId && atPath.workspaceId !== opened.workspaceId) {
    return { kind: 'id-changed', path: opened.path, previousId: atPath.workspaceId, id: opened.workspaceId };
  }
  const seenAtOtherPath = stored.find(
    (entry) => entry.workspaceId === opened.workspaceId && entry.path !== opened.path,
  );
  if (seenAtOtherPath) {
    return { kind: 'id-moved', id: opened.workspaceId, previousPath: seenAtOtherPath.path, path: opened.path };
  }
  return null;
}
