import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../domain';
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
    expect(parseDocument(await created!.source.readGraph()).graph).toEqual({ points: [], hyperedges: [] });
    expect(writes).toEqual([{ rootPath: '/tmp/graph', changes: {
      createOnly: true, graph: expect.any(String), documents: [], assets: [], companionMetadata: [],
    } }]);
    const reopened = await actions.chooseWorkspace();
    expect(reopened!.id).toBe(created!.id);
    expect(await reopened!.source.readGraph()).toBe(graph);
    await expect(actions.createWorkspace()).rejects.toThrow('Already a workspace');
    expect(parseDocument(graph!).document.title).toBe('My graph');
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
