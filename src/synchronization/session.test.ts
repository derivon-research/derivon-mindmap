import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCommit, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import { createWorkspace } from '../workspace/index';
import { openWorkspaceSession } from './index';

function memorySource(graph = createWorkspace({ title: 'Test' }).content.graphText) {
  const files = new Map<string, string>([['.derivon/workspace.json', graph]]);
  const commits: WorkspaceCommit[] = [];
  const source: WritableWorkspaceSource = {
    async readGraph() { return files.get('.derivon/workspace.json')!; },
    async readDocument(path) {
      if (!files.has(path)) throw new Error(`Missing: ${path}`);
      return files.get(path)!;
    },
    async readAsset() { throw new Error('No assets'); },
    async readCompanionMetadata(path) { return files.get(path) ?? null; },
    async commit(changes) {
      commits.push(changes);
      if (changes.graph !== undefined) files.set('.derivon/workspace.json', changes.graph);
      for (const change of [...changes.documents ?? [], ...changes.companionMetadata ?? []]) {
        if (change.content === null) files.delete(change.path);
        else files.set(change.path, change.content);
      }
    },
  };
  return { source, files, commits };
}

afterEach(() => vi.useRealTimers());

describe('application-scoped workspace synchronization', () => {
  it('previews a complete accepted concept before automatic persistence and reopens it intact', async () => {
    vi.useFakeTimers();
    const { source, files, commits } = memorySource();
    files.set('.derivon/orientation.json', '{ "questions": [] }');
    const session = await openWorkspaceSession(source, { authoring: source, autosaveDelayMs: 50 });
    const reader = session.reader;
    const id = session.authoring!.createConcept({ label: 'Vector space', format: 'markdown' });
    const preview = reader.getSnapshot();
    expect(id).toBe('c-1');
    expect(preview.content.graph.points[0].data.label).toBe('Vector space');
    expect(preview.content.documents['docs/concept-c-1/document.md']).toEqual({ status: 'ready', text: '' });
    expect(preview.content.companionMetadata['.derivon/orientation.json']).toEqual({ status: 'ready', text: '{ "questions": [] }' });
    expect(preview.persistedContent.graph.points).toEqual([]);
    expect(preview.saveState).toBe('pending');
    expect(commits).toEqual([]);

    // Neither a read-only subscriber nor a mode switch owns the save lifecycle.
    const unsubscribe = reader.subscribe(() => {});
    unsubscribe();
    await vi.advanceTimersByTimeAsync(50);
    expect(reader.getSnapshot().saveState).toBe('saved');
    expect(commits).toHaveLength(1);
    const reopened = await openWorkspaceSession(source);
    expect(reopened.authoring).toBeUndefined();
    expect(reopened.reader.getSnapshot().content).toEqual(preview.content);
    await vi.advanceTimersByTimeAsync(1000);
    expect(commits).toHaveLength(1);
    session.dispose();
    reopened.dispose();
  });

  it('protects a draft with no queued save and never lets it enter preview or persistence', async () => {
    vi.useFakeTimers();
    const { source, files, commits } = memorySource();
    const session = await openWorkspaceSession(source, { authoring: source });
    session.authoring!.protectDraft('new-concept', true);
    files.set('.derivon/workspace.json', createWorkspace({ title: 'External' }).content.graphText);
    expect(await session.reload()).toBe('protected');
    expect(session.reader.getSnapshot()).toMatchObject({
      hasDrafts: true, hasProtectedChanges: true, saveState: 'saved', content: { title: 'Test' },
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(session.reader.getSnapshot().content.graph.points).toEqual([]);
    expect(commits).toEqual([]);
    expect(() => session.authoring!.createConcept({ label: ' ', format: 'markdown' })).toThrow();
    expect(session.reader.getSnapshot().hasDrafts).toBe(true);
    session.authoring!.protectDraft('new-concept', false);
    expect(await session.reload()).toBe('loaded');
    expect(session.reader.getSnapshot().content.title).toBe('External');
    session.dispose();
  });

  it('retains accepted content on write failure and never claims it was persisted', async () => {
    const { source } = memorySource();
    let fail = true;
    const commit = source.commit;
    source.commit = async (changes) => { if (fail) throw new Error('Disk full'); await commit(changes); };
    const session = await openWorkspaceSession(source, { authoring: source });
    session.authoring!.createConcept({ label: 'Unsaved', format: 'html' });
    await session.flush();
    expect(session.reader.getSnapshot()).toMatchObject({ saveState: 'error', error: 'Disk full', hasProtectedChanges: true });
    expect(session.reader.getSnapshot().content.graph.points).toHaveLength(1);
    expect(session.reader.getSnapshot().persistedContent.graph.points).toEqual([]);
    expect(await session.reload()).toBe('protected');
    fail = false;
    await session.flush();
    expect(session.reader.getSnapshot().saveState).toBe('saved');
    session.dispose();
  });

  it('serializes changes accepted while a prior save is in flight', async () => {
    const { source, commits } = memorySource();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const commit = source.commit;
    source.commit = async (changes) => { await gate; await commit(changes); };
    const session = await openWorkspaceSession(source, { authoring: source });
    session.authoring!.createConcept({ label: 'A', format: 'markdown' });
    const saving = session.flush();
    session.authoring!.createConcept({ label: 'B', format: 'html' });
    expect(session.reader.getSnapshot().content.graph.points).toHaveLength(2);
    expect(session.reader.getSnapshot().persistedContent.graph.points).toEqual([]);
    release();
    await saving;
    expect(commits).toHaveLength(2);
    expect(session.reader.getSnapshot().persistedContent.graph.points.map((point) => point.data.label)).toEqual(['A', 'B']);
    expect(session.reader.getSnapshot().hasProtectedChanges).toBe(false);
    session.dispose();
  });

  it('keeps a valid graph with local read diagnostics and rejects an invalid manifest', async () => {
    const { source, files } = memorySource();
    const session = await openWorkspaceSession(source, { authoring: source });
    session.authoring!.createConcept({ label: 'A', format: 'markdown' });
    await session.flush();
    session.dispose();
    files.delete('docs/concept-c-1/document.md');
    const reopened = await openWorkspaceSession(source, { authoring: source });
    expect(reopened.reader.getSnapshot().content.graph.points).toHaveLength(1);
    expect(reopened.reader.getSnapshot().content.diagnostics).toEqual([
      { path: 'docs/concept-c-1/document.md', message: 'Missing: docs/concept-c-1/document.md' },
    ]);
    reopened.authoring!.createConcept({ label: 'B', format: 'html' });
    await reopened.flush();
    expect(files.has('docs/concept-c-1/document.md')).toBe(false);
    reopened.dispose();
    files.set('.derivon/workspace.json', '{ "graph": { "points": [] } }');
    await expect(openWorkspaceSession(source)).rejects.toThrow();
  });
});
