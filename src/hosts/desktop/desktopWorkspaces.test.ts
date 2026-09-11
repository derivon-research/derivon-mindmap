import { describe, expect, it } from 'vitest';
import { parseWorkspaceManifest } from '../../workspace/manifest';
import type { DesktopInvoke } from './desktopWorkspaceSource';
import { createDesktopWorkspaceActions } from './desktopWorkspaces';

describe('desktop workspace entry workflow', () => {
  it('creates through the source commit and reopens from the selected directory', async () => {
    let graph: string | undefined;
    const writes: unknown[] = [];
    const invoke = (async (command: string, args?: Record<string, unknown>) => {
      if (command === 'choose_workspace_source_directory') return { path: '/tmp/graph', name: 'My graph' };
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
    expect(parseWorkspaceManifest(graph!).manifest.document.title).toBe('My graph');
    expect(parseWorkspaceManifest(graph!).manifest.id).toBe('my-graph');
  });

  it('keeps a newly persisted workspace usable when the optional recent-list storage is unavailable', async () => {
    let graph = '';
    const invoke = (async (command: string, args?: Record<string, unknown>) => {
      if (command === 'choose_workspace_source_directory') return { path: '/tmp/graph', name: 'My graph' };
      if (command === 'commit_workspace_source_changes') { graph = (args!.changes as { graph: string }).graph; return; }
      if (command === 'read_workspace_source_graph') return graph;
      throw new Error(command);
    }) as DesktopInvoke;
    const actions = createDesktopWorkspaceActions(invoke, {
      getItem: () => null,
      setItem: () => { throw new Error('Storage unavailable'); },
    });
    const created = await actions.createWorkspace();
    expect(parseWorkspaceManifest(await created!.source.readGraph()).manifest.document.title).toBe('My graph');
    expect((await actions.chooseWorkspace())!.id).toBe(created!.id);
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
});
