import { describe, expect, it } from 'vitest';
import {
  bundledExampleWorkspaceSource,
  createBundledWorkspaceSource,
} from './workspaceSources/bundledWorkspaceSource';

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

});
