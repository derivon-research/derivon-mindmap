import { describe, expect, it, vi } from 'vitest';
import {
  bundledExampleWorkspaceSource,
  createBundledWorkspaceSource,
} from './workspaceSources/bundledWorkspaceSource';
import {
  createDesktopWorkspaceSource,
  type DesktopInvoke,
} from './workspaceSources/desktopWorkspaceSource';

describe('WorkspaceSource', () => {
  it('reads a bundled workspace without exposing a write capability', async () => {
    const source = createBundledWorkspaceSource({
      graph: '{\n  "schema": "derivon.authoring/v0.3.0"\n}\n',
      documents: { 'docs/concept-a/document.md': '# Concept A\n' },
      assets: { 'assets/diagram.png': new Uint8Array([0, 159, 255]) },
      companionMetadata: { '.derivon/orientation.json': '{"questions":[]}\n' },
    });

    expect(await source.readGraph()).toBe('{\n  "schema": "derivon.authoring/v0.3.0"\n}\n');
    expect(await source.readDocument('docs/concept-a/document.md')).toBe('# Concept A\n');
    expect(await source.readAsset('assets/diagram.png')).toEqual(new Uint8Array([0, 159, 255]));
    expect(await source.readCompanionMetadata('.derivon/orientation.json')).toBe('{"questions":[]}\n');
    expect(await source.readCompanionMetadata('.derivon/missing.json')).toBeNull();
    expect('commit' in source).toBe(false);
  });

  it('opens the fixed web example through the same read port', async () => {
    const graph = JSON.parse(await bundledExampleWorkspaceSource.readGraph());

    expect(graph.document.title).toBe('A + B → X');
    expect(await bundledExampleWorkspaceSource.readDocument('docs/concept-a/document.md')).toBe('# A\n\n点 A。\n');
    expect('commit' in bundledExampleWorkspaceSource).toBe(false);
  });

  it('preserves every byte when a desktop workspace is read and committed unchanged', async () => {
    const graph = '{\n\t"schema":"derivon.authoring/v0.3.0", "graph": {}\n}\n';
    const document = '# Concept A\r\n\r\nOriginal spacing.\r\n';
    const asset = new Uint8Array([0, 1, 2, 127, 128, 255]);
    const companion = '{ "questions" : [ ] }\n';
    const files = new Map<string, string | Uint8Array>([
      ['.derivon/workspace.json', graph],
      ['docs/concept-a/document.md', document],
      ['assets/diagram.png', asset],
      ['.derivon/orientation.json', companion],
    ]);
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      const path = command === 'read_workspace_source_graph'
        ? '.derivon/workspace.json'
        : args?.relativePath as string;
      if (command === 'read_workspace_source_graph' || command === 'read_workspace_source_document') {
        return files.get(path);
      }
      if (command === 'read_workspace_source_asset') {
        return (files.get(path) as Uint8Array).buffer;
      }
      if (command === 'read_workspace_source_companion_metadata') {
        return files.get(path) ?? null;
      }
      if (command === 'commit_workspace_source_changes') {
        const changes = args?.changes as {
          graph?: string;
          documents: Array<{ path: string; content: string | null }>;
          assets: Array<{ path: string; content: number[] | null }>;
          companionMetadata: Array<{ path: string; content: string | null }>;
        };
        if (changes.graph !== undefined) files.set('.derivon/workspace.json', changes.graph);
        for (const change of changes.documents) files.set(change.path, change.content!);
        for (const change of changes.assets) files.set(change.path, new Uint8Array(change.content!));
        for (const change of changes.companionMetadata) files.set(change.path, change.content!);
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    }) as DesktopInvoke;
    const source = createDesktopWorkspaceSource('/projects/example', invoke);

    const openedGraph = await source.readGraph();
    const openedDocument = await source.readDocument('docs/concept-a/document.md');
    const openedAsset = await source.readAsset('assets/diagram.png');
    const openedCompanion = await source.readCompanionMetadata('.derivon/orientation.json');
    await source.commit({
      graph: openedGraph,
      documents: [{ path: 'docs/concept-a/document.md', content: openedDocument }],
      assets: [{ path: 'assets/diagram.png', content: openedAsset }],
      companionMetadata: [{ path: '.derivon/orientation.json', content: openedCompanion }],
    });

    expect(files.get('.derivon/workspace.json')).toBe(graph);
    expect(files.get('docs/concept-a/document.md')).toBe(document);
    expect(files.get('assets/diagram.png')).toEqual(asset);
    expect(files.get('.derivon/orientation.json')).toBe(companion);
    expect(invoke).toHaveBeenLastCalledWith('commit_workspace_source_changes', {
      rootPath: '/projects/example',
      changes: {
        graph,
        documents: [{ path: 'docs/concept-a/document.md', content: document }],
        assets: [{ path: 'assets/diagram.png', content: [0, 1, 2, 127, 128, 255] }],
        companionMetadata: [{ path: '.derivon/orientation.json', content: companion }],
      },
    });
  });
});
