import { describe, expect, it } from 'vitest';
import { masteryBasis } from '../../learner-records';
import { createMemoryObjectFiles } from '../../testing/memoryObjectFiles';
import type { WorkspaceGraph } from '../../workspace/index';
import { objectMasteryBasis } from './objectBasis';

const graph: WorkspaceGraph = {
  points: [{ id: 'a', data: { label: 'A', document: 'docs/a', description: '' } }],
  hyperedges: [],
};

const encoder = new TextEncoder();

describe('an object basis', () => {
  it('covers every file under the object’s directory, not only the ones a document mentions', async () => {
    const image = new Uint8Array([1, 2, 3]);
    const full = await objectMasteryBasis(graph, 'docs/a', 'a', createMemoryObjectFiles(
      { 'docs/a/document.md': 'body' }, { 'docs/a/assets/x.png': image }));
    const withoutImage = await objectMasteryBasis(graph, 'docs/a', 'a', createMemoryObjectFiles({ 'docs/a/document.md': 'body' }));
    expect(full).not.toBe(withoutImage);
    // The listing is what makes the difference, so a document scan could not have found it.
    expect(full).toBe(await masteryBasis(graph, 'a', [
      { path: 'docs/a/document.md', bytes: encoder.encode('body') },
      { path: 'docs/a/assets/x.png', bytes: image },
    ]));
  });

  it('covers a file the manifest does not name without calling it the object’s document', async () => {
    const notes = encoder.encode('loose notes');
    const basis = await objectMasteryBasis(graph, 'docs/a', 'a', createMemoryObjectFiles(
      { 'docs/a/document.md': 'body' }, { 'docs/a/notes.md': notes }));
    expect(basis).toBe(await masteryBasis(graph, 'a', [
      { path: 'docs/a/document.md', bytes: encoder.encode('body') },
      { path: 'docs/a/notes.md', bytes: notes },
    ]));
  });

  it('does not care what order the listing arrives in', async () => {
    const files = createMemoryObjectFiles(
      { 'docs/a/document.md': 'body' }, { 'docs/a/assets/x.png': new Uint8Array([9]) });
    const forward = await objectMasteryBasis(graph, 'docs/a', 'a', files);
    const backward = await objectMasteryBasis(graph, 'docs/a', 'a', {
      ...files, listOwnedFiles: async () => ['docs/a/assets/x.png', 'docs/a/document.md'],
    });
    expect(forward).toBe(backward);
  });

  it('refuses rather than hashing a partial basis when the object’s document cannot be read', async () => {
    await expect(objectMasteryBasis(graph, 'docs/a', 'a', createMemoryObjectFiles(
      {}, { 'docs/a/document.md': new Uint8Array([1]) }))).rejects.toThrow(/读不出/);
  });

  it('is only the manifest entry when the object owns no files', async () => {
    await expect(objectMasteryBasis(graph, 'docs/a', 'a', createMemoryObjectFiles({})))
      .resolves.toBe(await masteryBasis(graph, 'a', []));
  });
});
