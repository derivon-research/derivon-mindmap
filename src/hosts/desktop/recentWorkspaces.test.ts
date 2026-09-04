import { describe, expect, it } from 'vitest';
import {
  RECENT_WORKSPACES_KEY,
  readRecentWorkspaces,
  rememberWorkspace,
  type RecentWorkspaceStorage,
} from './recentWorkspaces';

function storageWith(value: string | null): RecentWorkspaceStorage & { written: string | null } {
  return {
    written: null,
    getItem: () => value,
    setItem(_key, next) {
      this.written = next;
    },
  };
}

describe('readRecentWorkspaces', () => {
  it('is empty before anything has been opened', () => {
    expect(readRecentWorkspaces(storageWith(null))).toEqual([]);
  });

  it('survives a corrupted or foreign entry instead of failing the launch frame', () => {
    expect(readRecentWorkspaces(storageWith('{oops'))).toEqual([]);
    expect(readRecentWorkspaces(storageWith('{"version":99,"workspaces":[]}'))).toEqual([]);
    expect(readRecentWorkspaces(storageWith('{"version":1,"workspaces":[{"name":"x"}]}'))).toEqual([]);
  });

  it('reads stored workspaces newest first', () => {
    const storage = storageWith(JSON.stringify({
      version: 1,
      workspaces: [
        { path: '/a/math-reforged', name: 'math-reforged', openedAtMs: 20 },
        { path: '/b/notes', name: 'notes', openedAtMs: 10 },
      ],
    }));
    expect(readRecentWorkspaces(storage).map((entry) => entry.id))
      .toEqual(['/a/math-reforged', '/b/notes']);
    expect(readRecentWorkspaces(storage)[0].detail).toContain('/a/math-reforged');
  });
});

describe('rememberWorkspace', () => {
  it('writes the opened workspace under the versioned key', () => {
    const storage = storageWith(null);
    rememberWorkspace(storage, { path: '/a/math-reforged', name: 'math-reforged' }, 100);
    expect(JSON.parse(storage.written!)).toEqual({
      version: 1,
      workspaces: [{ path: '/a/math-reforged', name: 'math-reforged', openedAtMs: 100 }],
    });
    expect(RECENT_WORKSPACES_KEY).toBe('derivon.recent-workspaces/v1');
  });

  it('moves a re-opened workspace to the front instead of duplicating it', () => {
    const storage = storageWith(JSON.stringify({
      version: 1,
      workspaces: [
        { path: '/a', name: 'a', openedAtMs: 20 },
        { path: '/b', name: 'b', openedAtMs: 10 },
      ],
    }));
    rememberWorkspace(storage, { path: '/b', name: 'b' }, 30);
    expect(JSON.parse(storage.written!).workspaces).toEqual([
      { path: '/b', name: 'b', openedAtMs: 30 },
      { path: '/a', name: 'a', openedAtMs: 20 },
    ]);
  });

  it('keeps the list short enough to stay a launch frame, not a file manager', () => {
    const storage = storageWith(JSON.stringify({
      version: 1,
      workspaces: Array.from({ length: 8 }, (_, index) => ({
        path: `/w${index}`,
        name: `w${index}`,
        openedAtMs: 100 - index,
      })),
    }));
    rememberWorkspace(storage, { path: '/new', name: 'new' }, 200);
    const stored = JSON.parse(storage.written!).workspaces;
    expect(stored).toHaveLength(8);
    expect(stored[0].path).toBe('/new');
    expect(stored.at(-1).path).toBe('/w6');
  });
});
