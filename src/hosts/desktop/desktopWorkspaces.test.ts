import { describe, expect, it } from 'vitest';
import { parseWorkspaceManifest } from '../../workspace/manifest';
import type { DesktopInvoke } from './desktopWorkspaceSource';
import { createDesktopWorkspaceActions } from './desktopWorkspaces';

/** A minimal valid manifest, so each test only states the id it cares about. */
function manifest(id: string, title: string): string {
  return JSON.stringify({
    schema: 'derivon.workspace/v1',
    id,
    document: { title, description: '' },
    graph: { points: [], hyperedges: [] },
  });
}

function storageWithValue(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  let value: string | null = null;
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
}

/** Reads the manifest at a path, which is the only read opening a workspace needs. */
function graphReader(graphs: ReadonlyMap<string, string>): DesktopInvoke {
  return (async (command: string, args?: Record<string, unknown>) => {
    if (command === 'read_workspace_source_graph') return graphs.get((args as { rootPath: string }).rootPath);
    throw new Error(`Unexpected I/O: ${command}`);
  }) as DesktopInvoke;
}

describe('desktop workspace entry workflow', () => {
  it('creates through the source commit and reopens from the selected directory', async () => {
    let graph: string | undefined;
    const writes: unknown[] = [];
    const invoke = (async (command: string, args?: Record<string, unknown>) => {
      if (command === 'choose_workspace_source_directory') return { path: '/tmp/graph', name: 'my-graph' };
      if (command === 'commit_workspace_source_changes') {
        writes.push(args);
        const changes = args!.changes as { graph: string; createOnly?: boolean };
        if (graph && changes.createOnly) throw new Error('Already a workspace');
        graph = changes.graph;
        return;
      }
      if (command === 'read_workspace_source_graph') return graph;
      throw new Error(command);
    }) as DesktopInvoke;
    const actions = createDesktopWorkspaceActions(invoke, null);
    const created = await actions.createWorkspace();
    expect(created!.id).toBe('/tmp/graph');
    expect(created!.authoringSource).toBe(created!.source);
    expect(parseWorkspaceManifest(await created!.source.readGraph()).manifest.graph).toEqual({ points: [], hyperedges: [] });
    expect(writes).toEqual([{ rootPath: '/tmp/graph', changes: {
      createOnly: true, graph: expect.any(String), documents: [], assets: [], companionMetadata: [],
    } }]);
    const reopened = await actions.chooseWorkspace();
    expect(reopened!.id).toBe(created!.id);
    expect(await reopened!.source.readGraph()).toBe(graph);
    await expect(actions.createWorkspace()).rejects.toThrow('Already a workspace');
    expect(parseWorkspaceManifest(graph!).manifest.document.title).toBe('my-graph');
    expect(parseWorkspaceManifest(graph!).manifest.id).toBe('my-graph');
  });

  it('keeps a newly persisted workspace usable when the optional recent-list storage is unavailable', async () => {
    let graph = '';
    const invoke = (async (command: string, args?: Record<string, unknown>) => {
      if (command === 'choose_workspace_source_directory') return { path: '/tmp/graph', name: 'my-graph' };
      if (command === 'commit_workspace_source_changes') { graph = (args!.changes as { graph: string }).graph; return; }
      if (command === 'read_workspace_source_graph') return graph;
      throw new Error(command);
    }) as DesktopInvoke;
    const actions = createDesktopWorkspaceActions(invoke, {
      getItem: () => null,
      setItem: () => { throw new Error('Storage unavailable'); },
    });
    const created = await actions.createWorkspace();
    expect(parseWorkspaceManifest(await created!.source.readGraph()).manifest.document.title).toBe('my-graph');
    expect((await actions.chooseWorkspace())!.id).toBe(created!.id);
  });

  /* Each of these is unusable as it stands, and each would be usable only after a rewrite —
   * folding case, replacing a separator, dropping a trailing dot. Rewriting is what the host
   * must not do: it would hand two different folders one identity. */
  it('refuses a folder name that a rewrite would make usable, and writes nothing', async () => {
    for (const name of ['My graph', 'My-Graph', 'night_owl', 'graph.']) {
      const commands: string[] = [];
      const invoke = (async (command: string) => {
        if (command === 'choose_workspace_source_directory') return { path: '/tmp/graph', name };
        commands.push(command);
        throw new Error(command);
      }) as DesktopInvoke;
      const actions = createDesktopWorkspaceActions(invoke, null);
      await expect(actions.createWorkspace(), name).rejects.toThrow(/不能作为工作区 id/);
      expect(commands, name).toEqual([]);
    }
  });

  it('does not read or write when the native picker is cancelled', async () => {
    const invoke = (async (command: string) => {
      if (command === 'choose_workspace_source_directory') return null;
      throw new Error(`Unexpected I/O: ${command}`);
    }) as DesktopInvoke;
    const actions = createDesktopWorkspaceActions(invoke, null);
    expect(await actions.createWorkspace()).toBeNull();
    expect(await actions.chooseWorkspace()).toBeNull();
  });

  it('roots a learner record store at the manifest id, with no data directory required to open', async () => {
    const graphs = new Map([['/tmp/graph', manifest('math-reforged', 'Graph')]]);
    const opened = await createDesktopWorkspaceActions(graphReader(graphs), null).openRecentWorkspace('/tmp/graph');
    expect(opened.learnerRecordMigration).toBeUndefined();
    expect(typeof opened.learnerRecords!.readLearningState).toBe('function');
    expect(typeof opened.learnerRecords!.writeRoutes).toBe('function');
  });
});

describe('the id index at the open seam', () => {
  it('notices the same id at a new path and a manifest id edited by hand', async () => {
    const graphs = new Map([
      ['/a', manifest('shared-id', 'A')],
      ['/b', manifest('shared-id', 'B')],
    ]);
    const actions = createDesktopWorkspaceActions(graphReader(graphs), storageWithValue());

    expect((await actions.openRecentWorkspace('/a')).learnerRecordMigration).toBeUndefined();
    expect((await actions.openRecentWorkspace('/b')).learnerRecordMigration)
      .toEqual({ kind: 'id-moved', id: 'shared-id', previousPath: '/a', path: '/b' });

    // The manifest at a path the list knows is hand-edited to a different id.
    graphs.set('/a', manifest('edited-id', 'A'));
    expect((await actions.openRecentWorkspace('/a')).learnerRecordMigration)
      .toEqual({ kind: 'id-changed', path: '/a', previousId: 'shared-id', id: 'edited-id' });
  });

  it('still opens a copied workspace when the optional index is unavailable', async () => {
    const graphs = new Map([['/copy', manifest('shared', 'Copy')]]);
    const opened = await createDesktopWorkspaceActions(graphReader(graphs), {
      getItem: () => { throw new Error('Storage unavailable'); },
      setItem: () => { throw new Error('Storage unavailable'); },
    }).openRecentWorkspace('/copy');
    expect(opened.id).toBe('/copy');
    expect(opened.learnerRecordMigration).toBeUndefined();
  });
});
