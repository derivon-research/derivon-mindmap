import { describe, expect, it } from 'vitest';
import { parseDocument } from '../domain';
import { createConcept, createWorkspace, parseWorkspaceContent } from './index';

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
});
