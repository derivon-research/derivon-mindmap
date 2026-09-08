import { describe, expect, it } from 'vitest';
import {
  bundledExampleWorkspaceSource,
  createBundledWorkspaceSource,
} from '../hosts/web';

describe('WorkspaceSource', () => {
  it('reads a bundled workspace without exposing a write capability', async () => {
    const source = createBundledWorkspaceSource({
      graph: '{\n  "schema": "derivon.workspace/v1"\n}\n',
      documents: { 'docs/concept-a/document.md': '# Concept A\n' },
      assets: { 'assets/diagram.png': new Uint8Array([0, 159, 255]) },
      companionMetadata: { '.derivon/orientation.json': '{"questions":[]}\n' },
    });

    expect(await source.readGraph()).toBe('{\n  "schema": "derivon.workspace/v1"\n}\n');
    expect(await source.readDocument('docs/concept-a/document.md')).toBe('# Concept A\n');
    expect(await source.readAsset('assets/diagram.png')).toEqual(new Uint8Array([0, 159, 255]));
    expect(await source.readCompanionMetadata('.derivon/orientation.json')).toBe('{"questions":[]}\n');
    expect(await source.readCompanionMetadata('.derivon/missing.json')).toBeNull();
    // No write capability, and therefore no owned-file inventory either: a source that
    // cannot commit cannot delete, so it is never asked what an object owns.
    expect('commit' in source).toBe(false);
    expect('listOwnedFiles' in source).toBe(false);
  });

  it('opens the fixed web example through the same read port', async () => {
    const graph = JSON.parse(await bundledExampleWorkspaceSource.readGraph());

    expect(graph.document.title).toBe('线性代数应该这样学：概念与推导图');
    expect(await bundledExampleWorkspaceSource.readDocument('docs/concept-foundation-fields/document.md'))
      .toContain('# 数域');
    expect('commit' in bundledExampleWorkspaceSource).toBe(false);
  });
});
