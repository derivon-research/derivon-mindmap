import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCommit, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import { createWorkspace } from '../workspace/index';
import { openWorkspaceSession } from './index';

function memorySource(graph = createWorkspace({ title: 'Test' }).content.graphText) {
  const files = new Map<string, string>([['.derivon/workspace.json', graph]]);
  const assets = new Map<string, Uint8Array>();
  const commits: WorkspaceCommit[] = [];
  const source: WritableWorkspaceSource = {
    async readGraph() { return files.get('.derivon/workspace.json')!; },
    async readDocument(path) {
      if (!files.has(path)) throw new Error(`Missing: ${path}`);
      return files.get(path)!;
    },
    async readAsset(path) {
      const bytes = assets.get(path);
      if (!bytes) throw new Error(`Missing: ${path}`);
      return new Uint8Array(bytes);
    },
    async readCompanionMetadata(path) { return files.get(path) ?? null; },
    async commit(changes) {
      commits.push(changes);
      if (changes.graph !== undefined) files.set('.derivon/workspace.json', changes.graph);
      for (const change of [...changes.documents ?? [], ...changes.companionMetadata ?? []]) {
        if (change.content === null) files.delete(change.path);
        else files.set(change.path, change.content);
      }
      for (const change of changes.assets ?? []) {
        if (change.content === null) assets.delete(change.path);
        else assets.set(change.path, new Uint8Array(change.content));
      }
    },
  };
  return { source, files, assets, commits };
}

afterEach(() => vi.useRealTimers());

describe('application-scoped workspace synchronization', () => {
  it('previews a complete accepted concept before automatic persistence and reopens it intact', async () => {
    vi.useFakeTimers();
    const { source, files, commits } = memorySource();
    files.set('.derivon/orientation.json', '{ "questions": [] }');
    const session = await openWorkspaceSession(source, { authoring: source, autosaveDelayMs: 50 });
    const reader = session.reader;
    const id = session.authoring!.createConcept({ label: 'Vector space' });
    const preview = reader.getSnapshot();
    const directory = preview.content.graph.points[0].data.document;
    expect(id).toMatch(/^c-[23456789abcdefghjkmnpqrstvwxyz]{6}$/);
    expect(preview.content.graph.points[0].data.label).toBe('Vector space');
    expect(preview.content.documents[`${directory}/document.md`]).toEqual({ status: 'ready', text: '' });
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

  it('automatically accepts an external update without local work and buffers it behind a draft', async () => {
    vi.useFakeTimers();
    const { source, files } = memorySource();
    let revision = 0;
    source.revision = async () => String(revision);
    const session = await openWorkspaceSession(source, { authoring: source, externalPollIntervalMs: 50 });

    files.set('.derivon/workspace.json', createWorkspace({ title: 'External' }).content.graphText);
    revision += 1;
    await vi.advanceTimersByTimeAsync(50);
    expect(session.reader.getSnapshot()).toMatchObject({
      content: { title: 'External' }, persistedContent: { title: 'External' }, externalChange: null,
    });

    session.authoring!.protectDraft('new-concept', true);
    files.set('.derivon/workspace.json', createWorkspace({ title: 'Conflict' }).content.graphText);
    revision += 1;
    await vi.advanceTimersByTimeAsync(50);
    expect(session.reader.getSnapshot()).toMatchObject({
      content: { title: 'External' }, hasDrafts: true, hasProtectedChanges: true,
      externalChange: { content: { title: 'Conflict' } },
    });

    const staleCommands = session.authoring!;
    expect(session.acceptExternalChange()).toBe(true);
    expect(session.reader.getSnapshot()).toMatchObject({
      content: { title: 'Conflict' }, persistedContent: { title: 'Conflict' }, externalChange: null,
      hasDrafts: false, hasProtectedChanges: false, authoringEpoch: 1,
    });
    expect(() => staleCommands.createConcept({ label: 'Late draft' })).toThrow('编辑会话');
    await vi.advanceTimersByTimeAsync(50);
    expect(session.reader.getSnapshot().content.title).toBe('Conflict');
    session.dispose();
  });

  it('pauses conflicted writes until explicit discard and accepts one external asset basis', async () => {
    vi.useFakeTimers();
    const { source, files, assets, commits } = memorySource();
    let revision = 'initial';
    source.revision = async () => revision;
    const path = 'docs/a/assets/image.png';
    assets.set(path, new Uint8Array([1]));
    const session = await openWorkspaceSession(source, { authoring: source, externalPollIntervalMs: 50 });
    session.authoring!.createConcept({ label: 'Local' });
    files.set('.derivon/workspace.json', createWorkspace({ title: 'External' }).content.graphText);
    assets.set(path, new Uint8Array([2]));
    revision = 'external';
    await vi.advanceTimersByTimeAsync(50);
    await session.flush();
    expect(commits).toEqual([]);
    await expect(session.reader.readAsset(path)).rejects.toThrow();
    expect(session.acceptExternalChange()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(commits).toEqual([]);
    expect(session.reader.getSnapshot()).toMatchObject({ content: { title: 'External' }, saveState: 'saved' });
    expect(await session.reader.readAsset(path)).toEqual(new Uint8Array([2]));
    session.dispose();
  });

  it('resumes automatic saving when an external conflict is reverted', async () => {
    vi.useFakeTimers();
    const { source, files, commits } = memorySource();
    const originalGraph = files.get('.derivon/workspace.json')!;
    let revision = 'initial';
    source.revision = async () => revision;
    const commit = source.commit;
    source.commit = async (changes) => { await commit(changes); revision = 'saved'; return revision; };
    const session = await openWorkspaceSession(source, { authoring: source, externalPollIntervalMs: 50, autosaveDelayMs: 100 });
    session.authoring!.createConcept({ label: 'Local' });
    files.set('.derivon/workspace.json', createWorkspace({ title: 'External' }).content.graphText);
    revision = 'external';
    await vi.advanceTimersByTimeAsync(200);
    expect(commits).toEqual([]);
    files.set('.derivon/workspace.json', originalGraph);
    revision = 'initial';
    await vi.advanceTimersByTimeAsync(200);
    expect(commits).toHaveLength(1);
    expect(session.reader.getSnapshot()).toMatchObject({ saveState: 'saved', externalChange: null });
    session.dispose();
  });

  it('retries an asset read overlapping its own save without invalidating unchanged effective content', async () => {
    const { source, assets } = memorySource();
    const path = 'docs/a/assets/image.png';
    assets.set(path, new Uint8Array([1]));
    let revision = 'initial';
    source.revision = async () => revision;
    const commit = source.commit;
    source.commit = async (changes) => { await commit(changes); revision = 'saved'; return revision; };
    let started!: () => void;
    let release!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const readAsset = source.readAsset;
    source.readAsset = async (path) => { started(); await gate; return readAsset(path); };
    const session = await openWorkspaceSession(source, { authoring: source });
    session.authoring!.createConcept({ label: 'Local' });
    const effective = session.reader.getSnapshot().content;
    const pending = session.reader.readAsset(path);
    await reading;
    await session.flush();
    release();
    await expect(pending).resolves.toEqual(new Uint8Array([1]));
    expect(session.reader.getSnapshot().content).toBe(effective);
    session.dispose();
  });

  it('does not buffer an intermediate version of its own in-flight save', async () => {
    vi.useFakeTimers();
    const { source, files } = memorySource();
    let revision = 'initial';
    source.revision = async () => revision;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const commit = source.commit;
    source.commit = async (changes) => {
      files.set('.derivon/workspace.json', changes.graph!);
      revision = 'partial';
      await gate;
      await commit(changes);
      revision = 'saved';
      return revision;
    };
    const session = await openWorkspaceSession(source, { authoring: source, externalPollIntervalMs: 50 });
    session.authoring!.createConcept({ label: 'Local' });
    const saving = session.flush();
    await vi.advanceTimersByTimeAsync(50);
    const duringSave = session.reader.getSnapshot().externalChange;
    release();
    await saving;
    const afterSave = session.reader.getSnapshot();
    session.dispose();
    expect(duringSave).toBeNull();
    expect(afterSave).toMatchObject({ externalChange: null, saveState: 'saved' });
  });

  it('rejects a lazy read when observation fails instead of retrying without a bound', async () => {
    const { source, files } = memorySource();
    let changed = false;
    let reads = 0;
    source.revision = async () => {
      if (++reads > 20) throw new Error('unbounded revision reads');
      return changed ? 'external' : 'initial';
    };
    const session = await openWorkspaceSession(source);
    files.set('.derivon/workspace.json', 'invalid JSON');
    changed = true;
    reads = 0;
    await expect(session.reader.readAsset('docs/a/assets/a.png')).rejects.toThrow();
    session.dispose();
    expect(reads).toBeLessThan(10);
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
    expect(() => session.authoring!.createConcept({ label: ' ' })).toThrow();
    expect(session.reader.getSnapshot().hasDrafts).toBe(true);
    session.authoring!.protectDraft('new-concept', false);
    expect(await session.reload()).toBe('loaded');
    expect(session.reader.getSnapshot().content.title).toBe('External');
    session.dispose();
  });

  it('does not overwrite an external update discovered by a revision-checked save', async () => {
    const { source, files, commits } = memorySource();
    let revision = 0;
    source.revision = async () => String(revision);
    const commit = source.commit;
    source.commit = async (changes) => {
      if (changes.expectedRevision === undefined) throw new Error('missing expected revision');
      if (changes.expectedRevision !== String(revision)) throw new Error('workspace changed externally');
      await commit(changes);
      revision += 1;
      return String(revision);
    };
    const session = await openWorkspaceSession(source, { authoring: source, externalPollIntervalMs: 10_000 });
    session.authoring!.createConcept({ label: 'Local' });
    files.set('.derivon/workspace.json', createWorkspace({ title: 'External' }).content.graphText);
    revision += 1;

    await session.flush();
    expect(commits).toEqual([]);
    expect(session.reader.getSnapshot()).toMatchObject({
      content: { title: 'Test' }, persistedContent: { title: 'Test' }, saveState: 'error',
      error: 'workspace changed externally', hasProtectedChanges: true,
    });
    session.dispose();
  });

  it('retains accepted content on write failure and never claims it was persisted', async () => {
    const { source } = memorySource();
    let fail = true;
    const commit = source.commit;
    source.commit = async (changes) => { if (fail) throw new Error('Disk full'); await commit(changes); };
    const session = await openWorkspaceSession(source, { authoring: source });
    session.authoring!.createConcept({ label: 'Unsaved' });
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
    session.authoring!.createConcept({ label: 'A' });
    const saving = session.flush();
    session.authoring!.createConcept({ label: 'B' });
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
    session.authoring!.createConcept({ label: 'A' });
    const source_path = `${session.reader.getSnapshot().content.graph.points[0].data.document}/document.md`;
    await session.flush();
    session.dispose();
    files.delete(source_path);
    const reopened = await openWorkspaceSession(source, { authoring: source });
    expect(reopened.reader.getSnapshot().content.graph.points).toHaveLength(1);
    expect(reopened.reader.getSnapshot().content.diagnostics).toEqual([
      { path: source_path, message: `Missing: ${source_path}` },
    ]);
    reopened.authoring!.createConcept({ label: 'B' });
    await reopened.flush();
    expect(files.has(source_path)).toBe(false);
    reopened.dispose();
    files.set('.derivon/workspace.json', '{ "graph": { "points": [] } }');
    await expect(openWorkspaceSession(source)).rejects.toThrow();
  });

  it('reads existing images without publishing content and invalidates cached bytes on reload', async () => {
    const { source, assets } = memorySource();
    const path = 'docs/example/assets/image.png';
    assets.set(path, new Uint8Array([1, 2]));
    const session = await openWorkspaceSession(source);
    const snapshot = session.reader.getSnapshot();
    const changed = vi.fn();
    session.reader.subscribe(changed);
    const bytes = await session.reader.readAsset(path);
    bytes[0] = 99;
    assets.set(path, new Uint8Array([3, 4]));
    expect(await session.reader.readAsset(path)).toEqual(new Uint8Array([1, 2]));
    expect(session.reader.getSnapshot()).toBe(snapshot);
    expect(changed).not.toHaveBeenCalled();
    await session.reload();
    expect(await session.reader.readAsset(path)).toEqual(new Uint8Array([3, 4]));
    expect(changed).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it('does not mix a newer asset with protected accepted content', async () => {
    const { source, assets } = memorySource();
    const path = 'docs/concept/assets/example.png';
    let revision = 0;
    source.revision = async () => String(revision);
    assets.set(path, new Uint8Array([1]));
    const session = await openWorkspaceSession(source, { authoring: source });
    session.authoring!.protectDraft('concept', true);
    assets.set(path, new Uint8Array([2]));
    revision += 1;

    await expect(session.reader.readAsset(path)).rejects.toThrow('无法把新资产混入受保护的有效内容');
    expect(session.reader.getSnapshot()).toMatchObject({
      content: { title: 'Test' },
      hasProtectedChanges: true,
      externalChange: { content: { title: 'Test' } },
    });
    session.dispose();
  });

  it('previews accepted document and image bytes before persistence, then reopens them', async () => {
    vi.useFakeTimers();
    const { source, assets, commits } = memorySource();
    const session = await openWorkspaceSession(source, { authoring: source, autosaveDelayMs: 50 });
    const id = session.authoring!.createConcept({ label: 'A' });
    const directory = session.reader.getSnapshot().content.graph.points[0].data.document;
    await session.flush();
    const input = new Uint8Array([3, 4, 5]);
    const name = '123e4567-e89b-42d3-a456-426614174000.png';
    session.authoring!.updateDocument({ object: { kind: 'concept', id },
      source: `# Edited\n\n![x](assets/${name})`, assets: [{ name, content: input }] });
    input[0] = 99;
    expect(session.reader.getSnapshot().content.documents[`${directory}/document.md`]).toEqual({
      status: 'ready', text: `# Edited\n\n![x](assets/${name})`,
    });
    const assetPath = `${directory}/assets/${name}`;
    const previewBytes = await session.reader.readAsset(assetPath);
    expect(previewBytes).toEqual(new Uint8Array([3, 4, 5]));
    previewBytes[1] = 88;
    expect(await session.reader.readAsset(assetPath)).toEqual(new Uint8Array([3, 4, 5]));
    expect(assets.has(assetPath)).toBe(false);
    expect(session.reader.getSnapshot().saveState).toBe('pending');
    expect(commits).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(commits).toHaveLength(2);
    const reopened = await openWorkspaceSession(source);
    expect(reopened.reader.getSnapshot().content.documents[`${directory}/index.html`]).toEqual({
      status: 'ready', text: expect.stringContaining(`assets/${name}`),
    });
    expect(await reopened.reader.readAsset(assetPath)).toEqual(new Uint8Array([3, 4, 5]));
    session.dispose();
    reopened.dispose();
  });
});
