import type { RecentWorkspace } from '../../app/host';

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
  openedAtMs: number;
};

export type OpenedWorkspace = {
  readonly path: string;
  readonly name: string;
};

function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredWorkspace>;
  return typeof candidate.path === 'string'
    && typeof candidate.name === 'string'
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
    { path: workspace.path, name: workspace.name, openedAtMs },
    ...readStored(storage).filter((stored) => stored.path !== workspace.path),
  ].slice(0, RECENT_WORKSPACES_LIMIT);
  storage.setItem(
    RECENT_WORKSPACES_KEY,
    JSON.stringify({ version: RECENT_WORKSPACES_VERSION, workspaces }),
  );
}
