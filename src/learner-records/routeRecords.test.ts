import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LearnerRecordFiles } from '../ports/LearnerRecordFiles';
import { createTempLearnerRecordFiles, tempLearnerRecordPath } from '../testing/learnerRecordFiles';
import type { RouteRecord } from './protocol';
import { addRoute, readRoutes, removeRoute } from './routeRecords';
import { createLearnerRecordStore, type LearnerRecordStore } from './store';

const basis = 'a'.repeat(64);
const record = (id: string, description: string): RouteRecord => ({
  id, description, targets: ['c-b'], known: ['c-a'], basis,
  conceptIds: ['c-a', 'c-b'], derivationIds: ['h-ab'], order: ['h-ab'], cost: 2,
});

const mastery = {
  concepts: { 'c-a': { status: 'complete' as const, basis, data: { selfReported: true } } },
  derivations: {},
};

const routesText = (routes: readonly RouteRecord[]) =>
  `${JSON.stringify({ schema: 'derivon.routes/v1', routes }, null, 2)}\n`;

let root: string;
let store: LearnerRecordStore;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'derivon-routes-'));
  store = createLearnerRecordStore(createTempLearnerRecordFiles(root), 'math-reforged');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('reading a learner’s routes', () => {
  it('reads a file that is not there as no routes rather than as a problem, and creates nothing', async () => {
    await expect(readRoutes(store)).resolves.toEqual({ routes: [], issue: null });
    await expect(readFile(path.join(root, 'learner-records'), 'utf8')).rejects.toThrow();
  });

  it('reports an unreadable routes.json instead of showing an empty list', async () => {
    const unreadable = createLearnerRecordStore({
      read: async () => ({ presence: 'present', text: '{"schema":"derivon.routes/v2","routes":[]}', version: 'v' }),
      write: async () => 'v',
    }, 'math-reforged');
    const read = await readRoutes(unreadable);
    expect(read.routes).toEqual([]);
    expect(read.issue).toMatch(/schema/);
  });
});

describe('confirming a route', () => {
  it('writes the record and reads it back', async () => {
    const written = await addRoute(store, record('r-k7f3q2', '从 A 到 B'));
    expect(written.routes.map((route) => route.id)).toEqual(['r-k7f3q2']);
    expect(written.issue).toBeNull();
    await expect(readRoutes(store)).resolves.toEqual(written);
  });

  it('keeps the routes that were already there, because several routes coexist', async () => {
    await addRoute(store, record('r-aaaaaa', '第一条'));
    const after = await addRoute(store, record('r-bbbbbb', '第二条'));
    expect(after.routes.map((route) => route.description)).toEqual(['第一条', '第二条']);
  });

  it('refuses to write over an unreadable file rather than losing the routes it cannot read', async () => {
    const unreadable = createLearnerRecordStore({
      read: async () => ({ presence: 'present', text: '{ not json', version: 'v' }),
      write: async () => 'v',
    }, 'math-reforged');
    await expect(addRoute(unreadable, record('r-k7f3q2', '从 A 到 B'))).rejects.toThrow(/JSON/);
  });

  it('re-reads and retries when another writer moved the file under it', async () => {
    const files = createTempLearnerRecordFiles(root);
    await createLearnerRecordStore(files, 'math-reforged')
      .writeRoutes({ routes: [] }, { presence: 'missing' });
    // A second writer appends between this reader's read and its write.
    const interleaved = createLearnerRecordStore(
      interleaveOnce(files, createTempLearnerRecordFiles(root), routesText([record('r-aaaaaa', '别人的')])),
      'math-reforged',
    );
    const after = await addRoute(interleaved, record('r-bbbbbb', '我的'));
    expect(after.routes.map((route) => route.id).sort()).toEqual(['r-aaaaaa', 'r-bbbbbb']);
  });

  it('reports a write that keeps losing instead of looping forever', async () => {
    const losing = createLearnerRecordStore(alwaysConflictingFiles(createTempLearnerRecordFiles(root)), 'math-reforged');
    await expect(addRoute(losing, record('r-k7f3q2', '从 A 到 B'))).rejects.toThrow(/已被其他写入方更新/);
  });
});

describe('deleting a route', () => {
  it('removes exactly the named route and leaves the others complete', async () => {
    await addRoute(store, record('r-aaaaaa', '第一条'));
    await addRoute(store, record('r-bbbbbb', '第二条'));
    const after = await removeRoute(store, 'r-aaaaaa');
    expect(after.routes.map((route) => route.id)).toEqual(['r-bbbbbb']);
  });

  it('changes nothing when the route is not there', async () => {
    await addRoute(store, record('r-aaaaaa', '第一条'));
    const after = await removeRoute(store, 'r-zzzzzz');
    expect(after.routes.map((route) => route.id)).toEqual(['r-aaaaaa']);
  });

  it('never touches mastery, in either direction', async () => {
    await store.writeLearningState(mastery, { presence: 'missing' });
    const before = await readFile(tempLearnerRecordPath(root, 'math-reforged', 'state'), 'utf8');
    await addRoute(store, record('r-aaaaaa', '第一条'));
    await removeRoute(store, 'r-aaaaaa');
    expect(await readFile(tempLearnerRecordPath(root, 'math-reforged', 'state'), 'utf8')).toBe(before);
    // And the other direction: losing routes.json leaves state.json complete and readable.
    await rm(tempLearnerRecordPath(root, 'math-reforged', 'routes'));
    await expect(store.readLearningState()).resolves.toMatchObject({ presence: 'present', state: mastery });
    await expect(readRoutes(store)).resolves.toEqual({ routes: [], issue: null });
  });
});

/** Files where a second writer lands one write in between, so the first attempt loses. */
function interleaveOnce(inner: LearnerRecordFiles, other: LearnerRecordFiles, content: string): LearnerRecordFiles {
  let armed = true;
  return {
    read: (workspaceId, file) => inner.read(workspaceId, file),
    async write(workspaceId, file, text, precondition) {
      if (armed) {
        armed = false;
        await other.write(workspaceId, file, content, precondition);
      }
      return inner.write(workspaceId, file, text, precondition);
    },
  };
}

/** Files whose compare-and-swap never holds, so a retry loop would not terminate. */
function alwaysConflictingFiles(inner: LearnerRecordFiles): LearnerRecordFiles {
  return {
    read: (workspaceId, file) => inner.read(workspaceId, file),
    async write() { throw new Error('学习者记录已被其他写入方更新（routes.json）'); },
  };
}
