import { describe, expect, it } from 'vitest';
import { parseDocument } from '../domain';
import { createConcept, createWorkspace, objectDocumentPreview, parseWorkspaceContent, updateObjectDocument } from './index';

describe('complete workspace content operations', () => {
  it('creates an old-format workspace and its first concept with owned documents in one operation', () => {
    const initial = createWorkspace({ title: 'Linear algebra' });
    const created = createConcept(initial.content, { label: 'Vector space', format: 'markdown' });
    const manifest = parseDocument(created.changes.graph!);
    const concept = manifest.graph.points[0];

    expect(manifest.schema).toBe('derivon.authoring/v0.3.0');
    expect(manifest.document.title).toBe('Linear algebra');
    expect(concept).toEqual({ id: 'c-1', data: {
      label: 'Vector space', document: 'docs/concept-c-1', format: 'markdown',
    } });
    expect(created.objectId).toBe('c-1');
    expect(created.content.graph.points).toEqual([concept]);
    expect(created.changes.documents).toEqual([
      { path: 'docs/concept-c-1/document.md', content: '', createOnly: true },
      { path: 'docs/concept-c-1/index.html', content: expect.stringContaining('<title>Vector space</title>'), createOnly: true },
    ]);
    expect(created.content.documents['docs/concept-c-1/document.md']).toEqual({ status: 'ready', text: '' });
    expect(created.content.diagnostics).toEqual([]);
    expect(objectDocumentPreview(created.content, concept.data)).toEqual({ status: 'ready', text: created.changes.documents![1].content });
    expect(initial.content.graph.points).toEqual([]);
  });

  it('allows an unrelated concept without replacing damaged documents or losing legacy and opaque data', () => {
    const graph = JSON.stringify({
      schema: 'derivon.authoring/v0.3.0', document: { title: 'Existing', description: 'Keep me' },
      graph: { points: [
        { id: 'c-1', data: { label: 'Existing', document: 'docs/concept-c-2', format: 'markdown', tags: ['algebra'] } },
        { id: 'x', data: { label: 'Other', document: 'docs/other', format: 'html' } },
      ], hyperedges: [] },
      view: { replacements: [{ points: ['c-1'], replaceWith: 'x', show: 'points' }] },
    });
    const damaged = parseWorkspaceContent({ graph, documents: {
      'docs/concept-c-2/document.md': { status: 'error', message: 'Permission denied' },
      'docs/other/index.html': { status: 'ready', text: '<p>Original</p>' },
    }, companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: '{ "defaults": [] }' } } });
    const created = createConcept(damaged, { label: 'New', format: 'html' });

    expect(created.content.diagnostics).toEqual(damaged.diagnostics);
    expect(objectDocumentPreview(created.content, created.content.graph.points[0].data)).toEqual({
      status: 'error', message: 'Missing document: docs/concept-c-2/index.html',
    });
    expect(created.content.graph.points[2].data.document).toBe('docs/concept-c-2-2');
    expect(created.changes.documents).toHaveLength(1);
    expect(created.changes.documents![0].path).toBe('docs/concept-c-2-2/index.html');
    expect(created.content.documents['docs/concept-c-2/document.md']).toEqual({ status: 'error', message: 'Permission denied' });
    expect(created.content.companionMetadata).toEqual(damaged.companionMetadata);
    expect(JSON.parse(created.changes.graph!).view).toEqual(JSON.parse(graph).view);
    expect(JSON.parse(created.changes.graph!).graph.points[0].data.tags).toEqual(['algebra']);
  });

  it('rejects incomplete intents and unauthorized schema migration without modifying effective content', () => {
    const initial = createWorkspace({ title: 'Original' }).content;
    expect(() => createConcept(initial, { label: '  ', format: 'markdown' })).toThrow();
    const created = createConcept(initial, { label: 'A', format: 'html', id: 'given' }).content;
    expect(() => createConcept(created, { label: 'B', format: 'html', id: 'given' })).toThrow();
    const old = parseWorkspaceContent({
      graph: initial.graphText.replace('v0.3.0', 'v0.2.0'), documents: {},
    });
    expect(old.requiresMigrationConsent).toBe(true);
    expect(() => createConcept(old, { label: 'A', format: 'markdown' })).toThrow(/升级/);
    expect(old.graphText).toContain('v0.2.0');
    expect(initial.graph.points).toEqual([]);
    expect(created.graph.points).toHaveLength(1);
  });

  it('atomically updates Markdown source, rendered HTML and owned image bytes', () => {
    const original = new Uint8Array([1, 2, 255]);
    const created = createConcept(createWorkspace({ title: 'Test' }).content,
      { label: 'Vector', format: 'markdown' }).content;
    const name = '123e4567-e89b-42d3-a456-426614174000.png';
    const updated = updateObjectDocument(created, {
      object: { kind: 'concept', id: 'c-1' }, source: `# Changed\n\n![plot](assets/${name})`,
      assets: [{ name, content: original }],
    });

    expect(updated.changes.documents).toEqual([
      { path: 'docs/concept-c-1/document.md', content: `# Changed\n\n![plot](assets/${name})` },
      { path: 'docs/concept-c-1/index.html', content: expect.stringContaining(`<img src="assets/${name}" alt="plot">`) },
    ]);
    expect(updated.changes.assets).toEqual([
      { path: `docs/concept-c-1/assets/${name}`, content: new Uint8Array([1, 2, 255]) },
    ]);
    original[0] = 99;
    expect(updated.content.assets![`docs/concept-c-1/assets/${name}`]).toEqual(new Uint8Array([1, 2, 255]));
    expect(updated.content.graphText).toBe(created.graphText);
    expect(updated.content.graph).toBe(created.graph);
  });

  it('repairs derived HTML from readable Markdown while retaining unrelated damage and opaque data', () => {
    const graph = JSON.stringify({ schema: 'derivon.authoring/v0.3.0', document: { title: 'T', description: 'opaque' },
      graph: { points: [
        { id: 'a', data: { label: 'A', document: 'docs/a', format: 'markdown', tags: ['keep'] } },
        { id: 'b', data: { label: 'B', document: 'docs/b', format: 'html' } },
      ], hyperedges: [] }, view: { replacements: [] } });
    const content = parseWorkspaceContent({ graph, documents: {
      'docs/a/document.md': { status: 'ready', text: 'old' },
      'docs/a/index.html': { status: 'error', message: 'damaged derived file' },
      'docs/b/index.html': { status: 'error', message: 'unrelated' },
    } });
    const updated = updateObjectDocument(content, { object: { kind: 'concept', id: 'a' }, source: 'new' });
    expect(updated.content.diagnostics).toEqual([{ path: 'docs/b/index.html', message: 'unrelated' }]);
    expect(JSON.parse(updated.content.graphText).graph.points[0].data.tags).toEqual(['keep']);
    expect(updated.content.documents['docs/a/index.html']).toEqual({ status: 'ready', text: expect.stringContaining('<p>new</p>') });
  });

  it('rejects unknown objects, unreadable source, invalid images and asset collisions', () => {
    const created = createConcept(createWorkspace({ title: 'Test' }).content,
      { label: 'A', format: 'markdown' }).content;
    expect(() => updateObjectDocument(created, { object: { kind: 'concept', id: 'missing' }, source: '' })).toThrow(/missing/);
    const damaged = parseWorkspaceContent({ graph: created.graphText, documents: {
      ...created.documents, 'docs/concept-c-1/document.md': { status: 'error', message: 'unreadable source' },
    } });
    expect(() => updateObjectDocument(damaged, { object: { kind: 'concept', id: 'c-1' }, source: '' })).toThrow(/unreadable source/);
    for (const name of ['../x.png', 'folder/x.png', '.hidden.png', 'x.txt', 'x\0.png', 'not-a-uuid.png']) {
      expect(() => updateObjectDocument(created, { object: { kind: 'concept', id: 'c-1' }, source: '',
        assets: [{ name, content: new Uint8Array([1]) }] })).toThrow(/文件名/);
    }
    const withAsset = parseWorkspaceContent({ graph: created.graphText, documents: created.documents,
      assets: { 'docs/concept-c-1/assets/123e4567-e89b-42d3-a456-426614174000.webp': new Uint8Array([8]) } });
    expect(() => updateObjectDocument(withAsset, { object: { kind: 'concept', id: 'c-1' }, source: '',
      assets: [{ name: '123e4567-e89b-42d3-a456-426614174000.webp', content: new Uint8Array([9]) }] })).toThrow(/已存在/);
  });
});
