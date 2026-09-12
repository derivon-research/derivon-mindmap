import { describe, expect, it } from 'vitest';
import {
  RECENT_WORKSPACES_KEY,
  detectLearnerRecordMigration,
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
        { path: '/a/math-reforged', name: 'math-reforged', workspaceId: 'math-reforged', openedAtMs: 20 },
        { path: '/b/notes', name: 'notes', workspaceId: 'notes', openedAtMs: 10 },
      ],
    }));
    expect(readRecentWorkspaces(storage).map((entry) => entry.id))
      .toEqual(['/a/math-reforged', '/b/notes']);
    expect(readRecentWorkspaces(storage)[0].detail).toContain('/a/math-reforged');
  });
});

describe('rememberWorkspace', () => {
  it('writes the opened workspace, with the manifest id, under the versioned key', () => {
    const storage = storageWith(null);
    rememberWorkspace(storage, { path: '/a/math-reforged', name: 'math-reforged', workspaceId: 'math-reforged' }, 100);
    expect(JSON.parse(storage.written!)).toEqual({
      version: 1,
      workspaces: [{ path: '/a/math-reforged', name: 'math-reforged', workspaceId: 'math-reforged', openedAtMs: 100 }],
    });
    expect(RECENT_WORKSPACES_KEY).toBe('derivon.recent-workspaces/v1');
  });

  it('moves a re-opened workspace to the front instead of duplicating it', () => {
    const storage = storageWith(JSON.stringify({
      version: 1,
      workspaces: [
        { path: '/a', name: 'a', workspaceId: 'a', openedAtMs: 20 },
        { path: '/b', name: 'b', workspaceId: 'b', openedAtMs: 10 },
      ],
    }));
    rememberWorkspace(storage, { path: '/b', name: 'b', workspaceId: 'b' }, 30);
    expect(JSON.parse(storage.written!).workspaces).toEqual([
      { path: '/b', name: 'b', workspaceId: 'b', openedAtMs: 30 },
      { path: '/a', name: 'a', workspaceId: 'a', openedAtMs: 20 },
    ]);
  });

  it('keeps the list short enough to stay a launch frame, not a file manager', () => {
    const storage = storageWith(JSON.stringify({
      version: 1,
      workspaces: Array.from({ length: 8 }, (_, index) => ({
        path: `/w${index}`,
        name: `w${index}`,
        workspaceId: `w${index}`,
        openedAtMs: 100 - index,
      })),
    }));
    rememberWorkspace(storage, { path: '/new', name: 'new', workspaceId: 'new' }, 200);
    const stored = JSON.parse(storage.written!).workspaces;
    expect(stored).toHaveLength(8);
    expect(stored[0].path).toBe('/new');
    expect(stored.at(-1).path).toBe('/w6');
  });

  it('keeps entries written before the id was stored', () => {
    const storage = storageWith(JSON.stringify({
      version: 1,
      workspaces: [{ path: '/old', name: 'old', openedAtMs: 5 }],
    }));
    rememberWorkspace(storage, { path: '/new', name: 'new', workspaceId: 'new' }, 10);
    expect(JSON.parse(storage.written!).workspaces).toHaveLength(2);
  });
});

describe('detectLearnerRecordMigration', () => {
  const stored = (workspaces: readonly unknown[]) => storageWith(JSON.stringify({ version: 1, workspaces }));

  it('says nothing the first time an id is seen', () => {
    expect(detectLearnerRecordMigration(storageWith(null), { path: '/a', name: 'a', workspaceId: 'a' })).toBeNull();
  });

  it('says nothing when the same path still holds the same id', () => {
    const storage = stored([{ path: '/a', name: 'a', workspaceId: 'a', openedAtMs: 1 }]);
    expect(detectLearnerRecordMigration(storage, { path: '/a', name: 'a', workspaceId: 'a' })).toBeNull();
  });

  it('notices a manifest id that was edited by hand', () => {
    const storage = stored([{ path: '/a', name: 'a', workspaceId: 'old-id', openedAtMs: 1 }]);
    expect(detectLearnerRecordMigration(storage, { path: '/a', name: 'a', workspaceId: 'new-id' }))
      .toEqual({ kind: 'id-changed', path: '/a', previousId: 'old-id', id: 'new-id' });
  });

  it('notices the same id appearing at a new path', () => {
    const storage = stored([{ path: '/original', name: 'original', workspaceId: 'shared', openedAtMs: 1 }]);
    expect(detectLearnerRecordMigration(storage, { path: '/copy', name: 'copy', workspaceId: 'shared' }))
      .toEqual({ kind: 'id-moved', id: 'shared', previousPath: '/original', path: '/copy' });
  });

  it('does not read the id out of an entry written before ids were stored', () => {
    const storage = stored([{ path: '/original', name: 'original', openedAtMs: 1 }]);
    expect(detectLearnerRecordMigration(storage, { path: '/copy', name: 'copy', workspaceId: 'shared' })).toBeNull();
  });

  it('prefers the hand-edited id over a same-id sighting when both are true', () => {
    const storage = stored([
      { path: '/a', name: 'a', workspaceId: 'old-id', openedAtMs: 2 },
      { path: '/b', name: 'b', workspaceId: 'new-id', openedAtMs: 1 },
    ]);
    expect(detectLearnerRecordMigration(storage, { path: '/a', name: 'a', workspaceId: 'new-id' })?.kind)
      .toBe('id-changed');
  });
});
