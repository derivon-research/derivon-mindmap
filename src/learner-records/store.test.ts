import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempLearnerRecordFiles } from '../testing/learnerRecordFiles';
import type { LearnerRecordFiles } from '../ports/LearnerRecordFiles';
import { LEARNING_SCHEMA, parseLearningState } from './protocol';
import { createLearnerRecordStore } from './store';

const basis = 'a'.repeat(64);
const state = {
  concepts: { 'c-k7f3q2': { status: 'complete' as const, basis, data: { selfReported: true } } },
  derivations: {},
};
const route = (id: string) => ({
  id, label: '走到 B', known: [], targets: ['c-b'], steps: ['h-ab'], ordered: true, basis,
});

let root: string;
let files: LearnerRecordFiles;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'derivon-learner-records-'));
  files = createTempLearnerRecordFiles(root);
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('the learner record store', () => {
  it('reads a record that is not there as missing, without creating anything', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    await expect(store.readLearningState()).resolves.toEqual({ presence: 'missing' });
    await expect(readFile(path.join(root, 'learner-records'), 'utf8')).rejects.toThrow();
  });

  it('creates the workspace directory on first write and reads the record back', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    const version = await store.writeLearningState(state, { presence: 'missing' });
    expect(version).toMatch(/^[0-9a-f]{64}$/);
    await expect(store.readLearningState()).resolves.toEqual({ presence: 'present', state, version });
  });

  it('writes a state.json the protocol validator accepts', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    await store.writeLearningState(state, { presence: 'missing' });
    const text = await readFile(path.join(root, 'learner-records/math-reforged/state.json'), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(parseLearningState(text)).toEqual(state);
    expect(JSON.parse(text).schema).toBe(LEARNING_SCHEMA);
  });

  it('refuses to write a record its own validator rejects, leaving the file alone', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    await expect(store.writeLearningState(
      { concepts: { 'c-1': { status: 'incomplete', basis } }, derivations: {} },
      { presence: 'missing' },
    )).rejects.toThrow(/data/);
    await expect(store.readLearningState()).resolves.toEqual({ presence: 'missing' });
  });

  it('loses cleanly when the file changed since it was read', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    const first = await store.writeLearningState(state, { presence: 'missing' });
    const second = createLearnerRecordStore(files, 'math-reforged');
    // A caller that read the file as absent races a writer that created it: its precondition loses.
    await expect(second.writeLearningState(state, { presence: 'missing' })).rejects.toThrow(/已被其他写入方更新/);
    await expect(second.writeLearningState(state, { presence: 'present', version: first }))
      .resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps state.json and every route file independent', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    await store.writeLearningState(state, { presence: 'missing' });
    await store.writeRoute(route('r-aaaaaa'), { presence: 'missing' });
    const second = await store.writeRoute(route('r-bbbbbb'), { presence: 'missing' });
    await rm(path.join(root, 'learner-records/math-reforged/state.json'));
    await store.deleteRoute('r-bbbbbb', second);
    await expect(store.readLearningState()).resolves.toEqual({ presence: 'missing' });
    expect((await store.listRoutes()).map((entry) => entry.status === 'ready' && entry.route))
      .toEqual([route('r-aaaaaa')]);
  });

  it('refuses a personal route without a basis before touching a file', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    const { basis: _basis, ...unsaved } = route('r-aaaaaa');
    await expect(store.writeRoute(unsaved, { presence: 'missing' })).rejects.toThrow(/basis/);
    await expect(store.listRoutes()).resolves.toEqual([]);
  });

  it('lists an unreadable route file as unreadable instead of dropping it', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    await store.writeRoute(route('r-aaaaaa'), { presence: 'missing' });
    await writeFile(path.join(root, 'learner-records/math-reforged/routes/r-bbbbbb.json'), '{"schema":"derivon.routes/v1"}');
    await writeFile(path.join(root, 'learner-records/math-reforged/routes/notes.txt'), 'not a route');
    expect((await store.listRoutes()).map((entry) => [entry.fileName, entry.status])).toEqual([
      ['r-aaaaaa.json', 'ready'], ['r-bbbbbb.json', 'unreadable'],
    ]);
  });

  it('reports an unreadable record instead of treating it as empty', async () => {
    const store = createLearnerRecordStore(files, 'math-reforged');
    await mkdir(path.join(root, 'learner-records/math-reforged'), { recursive: true });
    await writeFile(path.join(root, 'learner-records/math-reforged/state.json'), '{"schema":"derivon.learning/v2"}');
    await expect(store.readLearningState()).rejects.toThrow(/schema/);
  });

  it('does not derive a second key from the folder path', async () => {
    // Same id in two places is one identity: the store keys only on the id it was given.
    const first = createLearnerRecordStore(files, 'shared-id');
    await first.writeLearningState(state, { presence: 'missing' });
    const second = createLearnerRecordStore(files, 'shared-id');
    await expect(second.readLearningState()).resolves.toEqual({ presence: 'present', state, version: expect.any(String) });
  });
});
