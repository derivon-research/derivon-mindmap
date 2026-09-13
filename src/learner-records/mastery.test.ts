import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LearnerRecordFiles } from '../ports/LearnerRecordFiles';
import { createTempLearnerRecordFiles, tempLearnerRecordPath } from '../testing/learnerRecordFiles';
import { createLearnerRecordStore, type LearnerRecordStore } from './store';
import {
  EMPTY_MASTERY, conceptSources, knownConceptIds, masterySourceOf, readMastery, writeMastery,
} from './mastery';

const basis = 'a'.repeat(64);
const otherBasis = 'b'.repeat(64);

let root: string;
let store: LearnerRecordStore;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'derivon-mastery-'));
  store = createLearnerRecordStore(createTempLearnerRecordFiles(root), 'math-reforged');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('reading mastery', () => {
  it('reads a record that is not there as nothing assessed, and creates no file', async () => {
    await expect(readMastery(store)).resolves.toEqual({ state: EMPTY_MASTERY, presence: 'missing', issue: null });
    await expect(readFile(path.join(root, 'learner-records'), 'utf8')).rejects.toThrow();
  });

  it('reports an unreadable state.json instead of showing nothing assessed', async () => {
    const unreadable = createLearnerRecordStore({
      read: async () => ({ presence: 'present', text: '{"schema":"derivon.learning/v2"}', version: 'v' }),
      write: async () => 'v',
    }, 'math-reforged');
    const reading = await readMastery(unreadable);
    expect(reading.state).toEqual(EMPTY_MASTERY);
    expect(reading.issue).toMatch(/schema/);
  });
});

describe('the known set', () => {
  it('is every concept with a complete record, self-reported or judged', () => {
    const state = { concepts: {
      'c-a': { status: 'complete' as const, basis },
      'c-b': { status: 'complete' as const, basis, data: { selfReported: true } },
      'c-c': { status: 'incomplete' as const, basis, data: { notes: 'not yet' } },
    }, derivations: {} };
    expect(knownConceptIds(state)).toEqual(['c-a', 'c-b']);
    expect(masterySourceOf(state.concepts['c-b'])).toBe('selfReported');
    expect(masterySourceOf(state.concepts['c-a'])).toBe('judged');
    expect([...conceptSources(state)].sort()).toEqual([['c-a', 'judged'], ['c-b', 'selfReported']]);
  });

  it('does not count an incomplete record, because asked-and-not-reached is not known', () => {
    expect(knownConceptIds({ concepts: { 'c-a': { status: 'incomplete', basis, data: { notes: 'x' } } }, derivations: {} }))
      .toEqual([]);
  });
});

describe('writing a self-report', () => {
  it('writes a complete record marked self-reported, and reads it back', async () => {
    await writeMastery(store, { claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [] });
    const reading = await readMastery(store);
    expect(reading.presence).toBe('present');
    expect(reading.state.concepts['c-a']).toEqual({ status: 'complete', basis, data: { selfReported: true } });
  });

  it('keeps the other records, in both maps', async () => {
    await store.writeLearningState({
      concepts: { 'c-z': { status: 'complete', basis, data: { selfReported: true } } },
      derivations: { 'h-x': { status: 'incomplete', basis, data: { notes: 'x' } } },
    }, { presence: 'missing' });
    const reading = await writeMastery(store, { claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [] });
    expect(Object.keys(reading.state.concepts).sort()).toEqual(['c-a', 'c-z']);
    expect(Object.keys(reading.state.derivations)).toEqual(['h-x']);
  });

  it('takes a self-report back by removing only that record', async () => {
    await writeMastery(store, { claimed: [
      { conceptId: 'c-a', basis, source: 'selfReported' }, { conceptId: 'c-b', basis, source: 'selfReported' }], withdrawn: [] });
    const reading = await writeMastery(store, { withdrawn: ['c-a'], claimed: [] });
    expect(Object.keys(reading.state.concepts)).toEqual(['c-b']);
  });

  it('never withdraws a judgement and never downgrades it to a self-report', async () => {
    await store.writeLearningState({
      concepts: { 'c-a': { status: 'complete', basis, data: { notes: 'demonstrated' } } },
      derivations: {},
    }, { presence: 'missing' });
    const reading = await writeMastery(store, {
      claimed: [{ conceptId: 'c-a', basis: otherBasis, source: 'selfReported' }], withdrawn: ['c-a'],
    });
    expect(reading.state.concepts['c-a']).toEqual({ status: 'complete', basis, data: { notes: 'demonstrated' } });
  });

  it('refuses to write over an unreadable file rather than losing the records it cannot read', async () => {
    const unreadable = createLearnerRecordStore({
      read: async () => ({ presence: 'present', text: '{ not json', version: 'v' }),
      write: async () => 'v',
    }, 'math-reforged');
    await expect(writeMastery(unreadable, { claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [] }))
      .rejects.toThrow(/JSON/);
  });

  it('re-reads and retries when another writer moved the file under it', async () => {
    const files = createTempLearnerRecordFiles(root);
    await createLearnerRecordStore(files, 'math-reforged')
      .writeLearningState({ concepts: {}, derivations: {} }, { presence: 'missing' });
    const interleaved = createLearnerRecordStore(
      interleaveOnce(files, createTempLearnerRecordFiles(root),
        JSON.stringify({ schema: 'derivon.learning/v1', concepts: { 'c-z': { status: 'complete', basis } }, derivations: {} })),
      'math-reforged',
    );
    const reading = await writeMastery(interleaved, { claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [] });
    expect(Object.keys(reading.state.concepts).sort()).toEqual(['c-a', 'c-z']);
  });

  it('reports a write that keeps losing instead of looping forever', async () => {
    const losing = createLearnerRecordStore(alwaysConflictingFiles(createTempLearnerRecordFiles(root)), 'math-reforged');
    await expect(writeMastery(losing, { claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [] }))
      .rejects.toThrow(/已被其他写入方更新/);
  });

  it('does not touch the file when the write changes nothing', async () => {
    await writeMastery(store, { claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [] });
    const before = await readFile(tempLearnerRecordPath(root, 'math-reforged', 'state'), 'utf8');
    await writeMastery(store, { claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [] });
    expect(await readFile(tempLearnerRecordPath(root, 'math-reforged', 'state'), 'utf8')).toBe(before);
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
    async write() { throw new Error('学习者记录已被其他写入方更新（state.json）'); },
  };
}

describe('where a claim came from', () => {
  it('records a workspace default as a default, never as the learner’s own claim', async () => {
    const reading = await writeMastery(store, {
      claimed: [{ conceptId: 'c-a', basis, source: 'orientationSeed' }], withdrawn: [],
    });
    expect(reading.state.concepts['c-a']).toEqual({ status: 'complete', basis, data: { orientationSeed: true } });
    expect(masterySourceOf(reading.state.concepts['c-a'])).toBe('orientationSeed');
  });

  it('replaces the source rather than leaving both markers behind', async () => {
    await writeMastery(store, { claimed: [{ conceptId: 'c-a', basis, source: 'orientationSeed' }], withdrawn: [] });
    const reading = await writeMastery(store, {
      claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [],
    });
    expect(reading.state.concepts['c-a']).toEqual({ status: 'complete', basis, data: { selfReported: true } });
  });

  it('lets the learner take a workspace default back, and keeps every other source', async () => {
    await writeMastery(store, { claimed: [
      { conceptId: 'c-a', basis, source: 'orientationSeed' },
      { conceptId: 'c-b', basis, source: 'selfReported' },
    ], withdrawn: [] });
    const reading = await writeMastery(store, { claimed: [], withdrawn: ['c-a'] });
    expect(Object.keys(reading.state.concepts)).toEqual(['c-b']);
  });
});

describe('a claim against a judgement', () => {
  it('never overwrites an incomplete record, and never absorbs its data', async () => {
    await store.writeLearningState({
      concepts: { 'c-a': { status: 'incomplete', basis, data: { notes: '问过，没到' } } },
      derivations: {},
    }, { presence: 'missing' });
    const reading = await writeMastery(store, {
      claimed: [{ conceptId: 'c-a', basis, source: 'selfReported' }], withdrawn: [],
    });
    expect(reading.state.concepts['c-a']).toEqual({ status: 'incomplete', basis, data: { notes: '问过，没到' } });
    expect(knownConceptIds(reading.state)).toEqual([]);
  });
});
