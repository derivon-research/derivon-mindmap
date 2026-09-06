import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_SCHEMA, WORKSPACE_SCHEMA, createConcept, createWorkspace, emptyOrientationConfig,
  objectDocumentPreview, orientationConceptImpact, parseWorkspaceContent, updateConceptTags,
  updateObjectDocument, updateOrientation, updateTagDeclarations, type OrientationConfig,
} from './index';
import { parseWorkspaceManifest } from './manifest';

describe('complete workspace content operations', () => {
  it('creates a workspace and its first concept with owned documents in one operation', () => {
    const initial = createWorkspace({ title: 'Linear algebra' });
    const created = createConcept(initial.content, { label: 'Vector space', format: 'markdown' });
    const manifest = parseWorkspaceManifest(created.changes.graph!).manifest;
    const concept = manifest.graph.points[0];

    expect(manifest.schema).toBe(WORKSPACE_SCHEMA);
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

  it('allows an unrelated concept without replacing damaged documents or losing opaque data', () => {
    const graph = JSON.stringify({
      schema: WORKSPACE_SCHEMA, document: { title: 'Existing', description: 'Keep me' },
      tags: [{ id: 'algebra', label: '代数' }],
      graph: { points: [
        { id: 'c-1', data: { label: 'Existing', document: 'docs/concept-c-2', format: 'markdown', tags: ['algebra'] } },
        { id: 'x', data: { label: 'Other', document: 'docs/other', format: 'html' } },
      ], hyperedges: [] },
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
    expect(JSON.parse(created.changes.graph!).tags).toEqual([{ id: 'algebra', label: '代数' }]);
    expect(JSON.parse(created.changes.graph!).graph.points[0].data.tags).toEqual(['algebra']);
  });

  it('rejects incomplete intents without modifying effective content', () => {
    const initial = createWorkspace({ title: 'Original' }).content;
    expect(() => createConcept(initial, { label: '  ', format: 'markdown' })).toThrow();
    const created = createConcept(initial, { label: 'A', format: 'html', id: 'given' }).content;
    expect(() => createConcept(created, { label: 'B', format: 'html', id: 'given' })).toThrow();
    expect(initial.graph.points).toEqual([]);
    expect(created.graph.points).toHaveLength(1);
  });

  it('refuses to open a workspace written in a shape that is not this protocol', () => {
    expect(() => parseWorkspaceContent({
      graph: JSON.stringify({ schema: 'derivon.authoring/v0.3.0', document: { title: 'Old', description: '' },
        graph: { points: [], hyperedges: [] }, view: { replacements: [] } }), documents: {},
    })).toThrow(/schema/);
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
    const graph = JSON.stringify({ schema: WORKSPACE_SCHEMA, document: { title: 'T', description: 'opaque' },
      graph: { points: [
        { id: 'a', data: { label: 'A', document: 'docs/a', format: 'markdown', tags: ['keep'] } },
        { id: 'b', data: { label: 'B', document: 'docs/b', format: 'html' } },
      ], hyperedges: [] } });
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

describe('tags as workspace content', () => {
  const tagged = () => {
    const base = createConcept(createWorkspace({ title: 'T' }).content, { label: 'A', format: 'markdown' }).content;
    return createConcept(base, { label: 'B', format: 'markdown' }).content;
  };

  it('declares tags and attaches them to concepts through complete content changes', () => {
    const declared = updateTagDeclarations(tagged(), [{ id: 'basics', label: '基础', description: ' 起步 ' }]).content;
    expect(declared.tags).toEqual([{ id: 'basics', label: '基础', description: '起步' }]);
    const attached = updateConceptTags(declared, { conceptId: 'c-1', tags: ['basics', 'basics', ' '] });
    expect(attached.content.graph.points[0].data.tags).toEqual(['basics']);
    expect(attached.changes.graph).toBe(attached.content.graphText);
    expect(attached.content.tags).toEqual(declared.tags);
  });

  it('refuses unknown concepts and malformed declarations without changing content', () => {
    const content = tagged();
    expect(() => updateConceptTags(content, { conceptId: 'missing', tags: [] })).toThrow(/missing/);
    expect(() => updateTagDeclarations(content, [{ id: ' ', label: 'x' }])).toThrow();
    expect(() => updateTagDeclarations(content, [{ id: 'a', label: ' ' }])).toThrow();
    expect(() => updateTagDeclarations(content, [{ id: 'a', label: 'x' }, { id: 'a', label: 'y' }])).toThrow();
    expect(content.tags).toEqual([]);
  });
});

describe('the orientation configuration as workspace content', () => {
  const workspace = () => {
    const base = createConcept(createWorkspace({ title: 'T' }).content, { label: 'A', format: 'markdown' }).content;
    return updateTagDeclarations(createConcept(base, { label: 'B', format: 'markdown' }).content,
      [{ id: 'basics', label: '基础' }]).content;
  };
  const config = (points: string[]): OrientationConfig => ({
    schema: ORIENTATION_SCHEMA,
    seed: { targets: ['c-2'], known: ['c-1'] },
    questions: [{ id: 'why', prompt: '为什么来', select: 'one', options: [
      { id: 'o', label: '学 B', actions: [{ op: 'set-targets', points }], next: 'finish' },
    ] }],
  });

  it('is absent by default and leaves the workspace valid', () => {
    expect(workspace().orientation).toEqual({ status: 'absent' });
  });

  it('writes the companion document without touching the manifest', () => {
    const content = workspace();
    const change = updateOrientation(content, config(['c-2']));
    expect(change.changes.graph).toBeUndefined();
    expect(change.changes.companionMetadata).toEqual([
      { path: '.derivon/orientation.json', content: expect.stringContaining('"derivon.orientation/v1"') },
    ]);
    expect(change.content.graphText).toBe(content.graphText);
    expect(change.content.orientation).toEqual({ status: 'ready', config: config(['c-2']), diagnostics: [] });
    expect(updateOrientation(change.content, null).changes.companionMetadata)
      .toEqual([{ path: '.derivon/orientation.json', content: null }]);
    expect(updateOrientation(change.content, null).content.orientation).toEqual({ status: 'absent' });
  });

  it('refuses to accept a configuration that would put a dangling reference into a route', () => {
    const content = workspace();
    expect(() => updateOrientation(content, config(['gone']))).toThrow(/gone/);
    expect(content.orientation).toEqual({ status: 'absent' });
  });

  it('keeps an on-disk configuration with errors out of effective orientation, with diagnostics', () => {
    const content = workspace();
    const broken = parseWorkspaceContent({ graph: content.graphText, documents: content.documents,
      companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: JSON.stringify(config(['gone'])) } } });
    expect(broken.orientation.status).toBe('invalid');
    expect(broken.orientation.status === 'invalid' && broken.orientation.diagnostics.map((item) => item.code))
      .toEqual(['dangling-concept', 'empty-action']);
    expect(broken.diagnostics).toContainEqual({ path: '.derivon/orientation.json', message: expect.stringContaining('路线') });
  });

  it('reports which orientation references a concept deletion would break', () => {
    const configured = updateOrientation(workspace(), config(['c-2'])).content;
    expect(orientationConceptImpact(configured, ['c-1'])).toEqual([
      { conceptId: 'c-1', at: { field: 'seed.known' } },
    ]);
    expect(orientationConceptImpact(configured, ['c-2'])).toEqual([
      { conceptId: 'c-2', at: { field: 'seed.targets' } },
      { conceptId: 'c-2', at: { field: 'action', questionId: 'why', optionId: 'o' } },
    ]);
    expect(orientationConceptImpact(configured, ['other'])).toEqual([]);
  });
});
