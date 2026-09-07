import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_SCHEMA, WORKSPACE_SCHEMA, createConcept, createDerivation, createWorkspace, emptyOrientationConfig,
  objectDocumentSource, orientationConceptImpact, parseWorkspaceContent, updateConceptTags,
  updateObjectDocument, updateOrientation, updateTagDeclarations,
  type OrientationConfig, type WorkspaceContent,
} from './index';
import { parseWorkspaceManifest } from './manifest';

/** Fixtures are built through the operations, so ids are looked up, never written down. */
const idOf = (content: WorkspaceContent, label: string) =>
  content.graph.points.find((point) => point.data.label === label)!.id;

describe('complete workspace content operations', () => {
  it('creates a workspace and its first concept with owned documents in one operation', () => {
    const initial = createWorkspace({ title: 'Linear algebra' });
    const created = createConcept(initial.content, { label: 'Vector space' });
    const manifest = parseWorkspaceManifest(created.changes.graph!).manifest;
    const concept = manifest.graph.points[0];

    expect(manifest.schema).toBe(WORKSPACE_SCHEMA);
    expect(manifest.document.title).toBe('Linear algebra');
    // The id is generated, never asked for: `c-` plus six characters that survive being
    // read aloud. The caller learns it from the operation's result.
    expect(created.objectId).toMatch(/^c-[23456789abcdefghjkmnpqrstvwxyz]{6}$/);
    expect(concept).toEqual({ id: created.objectId, data: {
      label: 'Vector space', document: `docs/concept-${created.objectId.slice(2)}`,
    } });
    expect(created.content.graph.points).toEqual([concept]);
    expect(created.changes.documents).toEqual([
      { path: `${concept.data.document}/document.md`, content: '', createOnly: true },
    ]);
    expect(created.content.documents[`${concept.data.document}/document.md`]).toEqual({ status: 'ready', text: '' });
    expect(created.content.diagnostics).toEqual([]);
    expect(objectDocumentSource(created.content, concept.data)).toEqual({ status: 'ready', text: '' });
    expect(initial.content.graph.points).toEqual([]);
  });

  it('allows an unrelated concept without replacing damaged documents or losing opaque data', () => {
    const graph = JSON.stringify({
      schema: WORKSPACE_SCHEMA, document: { title: 'Existing', description: 'Keep me' },
      tags: [{ id: 'algebra', label: '代数' }],
      graph: { points: [
        { id: 'kept', data: { label: 'Existing', document: 'docs/concept-kept', tags: ['algebra'] } },
        { id: 'x', data: { label: 'Other', document: 'docs/other' } },
      ], hyperedges: [] },
    });
    const damaged = parseWorkspaceContent({ graph, documents: {
      'docs/concept-kept/document.md': { status: 'error', message: 'Permission denied' },
      'docs/other/document.md': { status: 'ready', text: 'Original' },
    }, companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: '{ "defaults": [] }' } } });
    const created = createConcept(damaged, { label: 'New' });

    expect(created.content.diagnostics).toEqual(damaged.diagnostics);
    expect(objectDocumentSource(created.content, created.content.graph.points[0].data)).toEqual({
      status: 'error', message: 'Permission denied',
    });
    expect(created.content.graph.points[2].data.document).toBe(`docs/concept-${created.objectId.slice(2)}`);
    expect(created.changes.documents).toHaveLength(1);
    expect(created.content.documents['docs/concept-kept/document.md']).toEqual({ status: 'error', message: 'Permission denied' });
    expect(created.content.companionMetadata).toEqual(damaged.companionMetadata);
    expect(JSON.parse(created.changes.graph!).tags).toEqual([{ id: 'algebra', label: '代数' }]);
    expect(JSON.parse(created.changes.graph!).graph.points[0].data.tags).toEqual(['algebra']);
  });

  it('rejects incomplete intents without modifying effective content', () => {
    const initial = createWorkspace({ title: 'Original' }).content;
    expect(() => createConcept(initial, { label: '  ' })).toThrow();
    const created = createConcept(initial, { label: 'A' }).content;
    // Two concepts may share a name; they never share an id.
    const both = createConcept(created, { label: 'A' }).content;
    expect(new Set(both.graph.points.map((point) => point.id)).size).toBe(2);
    expect(initial.graph.points).toEqual([]);
    expect(created.graph.points).toHaveLength(1);
  });

  it('refuses to open a workspace written in another protocol', () => {
    expect(() => parseWorkspaceContent({
      graph: JSON.stringify({ schema: 'derivon.authoring/v0.3.0', document: { title: 'Old', description: '' },
        graph: { points: [], hyperedges: [] }, view: { replacements: [] } }), documents: {},
    })).toThrow(/schema/);
  });

  it('atomically updates only Markdown source and owned image bytes', () => {
    const original = new Uint8Array([1, 2, 255]);
    const created = createConcept(createWorkspace({ title: 'Test' }).content, { label: 'Vector' });
    const id = created.objectId;
    const directory = created.content.graph.points[0].data.document;
    const name = '123e4567-e89b-42d3-a456-426614174000.png';
    const updated = updateObjectDocument(created.content, {
      object: { kind: 'concept', id }, source: `# Changed\n\n![plot](assets/${name})`,
      assets: [{ name, content: original }],
    });

    expect(updated.changes.documents).toEqual([
      { path: `${directory}/document.md`, content: `# Changed\n\n![plot](assets/${name})` },
    ]);
    expect(updated.changes.assets).toEqual([
      { path: `${directory}/assets/${name}`, content: new Uint8Array([1, 2, 255]) },
    ]);
    original[0] = 99;
    expect(updated.content.assets![`${directory}/assets/${name}`]).toEqual(new Uint8Array([1, 2, 255]));
    expect(updated.content.graphText).toBe(created.content.graphText);
    expect(updated.content.graph).toBe(created.content.graph);
  });

  it('updates readable Markdown while retaining unrelated damage and opaque data', () => {
    const graph = JSON.stringify({ schema: WORKSPACE_SCHEMA, document: { title: 'T', description: 'opaque' },
      graph: { points: [
        { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['keep'] } },
        { id: 'b', data: { label: 'B', document: 'docs/b' } },
      ], hyperedges: [] } });
    const content = parseWorkspaceContent({ graph, documents: {
      'docs/a/document.md': { status: 'ready', text: 'old' },
      'docs/b/document.md': { status: 'error', message: 'unrelated' },
    } });
    const updated = updateObjectDocument(content, { object: { kind: 'concept', id: 'a' }, source: 'new' });
    expect(updated.content.diagnostics).toEqual([{ path: 'docs/b/document.md', message: 'unrelated' }]);
    expect(JSON.parse(updated.content.graphText).graph.points[0].data.tags).toEqual(['keep']);
    expect(updated.content.documents['docs/a/document.md']).toEqual({ status: 'ready', text: 'new' });
    expect(Object.keys(updated.content.documents).every((path) => path.endsWith('/document.md'))).toBe(true);
  });

  it('rejects unknown objects, unreadable source, invalid images and asset collisions', () => {
    const made = createConcept(createWorkspace({ title: 'Test' }).content, { label: 'A' });
    const created = made.content;
    const id = made.objectId;
    const directory = created.graph.points[0].data.document;
    expect(() => updateObjectDocument(created, { object: { kind: 'concept', id: 'missing' }, source: '' })).toThrow(/missing/);
    const damaged = parseWorkspaceContent({ graph: created.graphText, documents: {
      ...created.documents, [`${directory}/document.md`]: { status: 'error', message: 'unreadable source' },
    } });
    expect(() => updateObjectDocument(damaged, { object: { kind: 'concept', id }, source: '' })).toThrow(/unreadable source/);
    for (const name of ['../x.png', 'folder/x.png', '.hidden.png', 'x.txt', 'x\0.png', 'not-a-uuid.png']) {
      expect(() => updateObjectDocument(created, { object: { kind: 'concept', id }, source: '',
        assets: [{ name, content: new Uint8Array([1]) }] })).toThrow(/文件名/);
    }
    const withAsset = parseWorkspaceContent({ graph: created.graphText, documents: created.documents,
      assets: { [`${directory}/assets/123e4567-e89b-42d3-a456-426614174000.webp`]: new Uint8Array([8]) } });
    expect(() => updateObjectDocument(withAsset, { object: { kind: 'concept', id }, source: '',
      assets: [{ name: '123e4567-e89b-42d3-a456-426614174000.webp', content: new Uint8Array([9]) }] })).toThrow(/已存在/);
  });
});

describe('creating derivations as workspace content', () => {
  const twoConcepts = () => {
    const base = createWorkspace({ title: 'T' }).content;
    return createConcept(createConcept(base, { label: 'A' }).content, { label: 'B' }).content;
  };

  it('creates a derivation with its owned document in one operation', () => {
    const base = twoConcepts();
    const a = idOf(base, 'A');
    const b = idOf(base, 'B');
    const created = createDerivation(base, { tails: [a, a], head: b, weight: 1.5 });
    const manifest = parseWorkspaceManifest(created.changes.graph!).manifest;
    const edge = manifest.graph.hyperedges[0];

    expect(created.objectId).toMatch(/^h-[23456789abcdefghjkmnpqrstvwxyz]{6}$/);
    // Duplicate premises are collapsed instead of being written into the manifest.
    expect(edge).toEqual({ id: created.objectId, weight: 1.5, tails: [a], head: b, data: {
      document: `docs/derivation-${created.objectId.slice(2)}`,
    } });
    expect(created.changes.documents).toEqual([
      { path: `${edge.data.document}/document.md`, content: '', createOnly: true },
    ]);
    expect(created.content.documents[`${edge.data.document}/document.md`]).toEqual({ status: 'ready', text: '' });
    expect(created.content.diagnostics).toEqual([]);
    expect(base.graph.hyperedges).toEqual([]);
  });

  it('allows empty premises, cycles and parallel derivations', () => {
    const base = twoConcepts();
    const a = idOf(base, 'A');
    const b = idOf(base, 'B');

    expect(() => createDerivation(base, { tails: [], head: a, weight: 0 })).not.toThrow();
    // A cycle: B → A while A → B exists is legal graph content.
    const first = createDerivation(base, { tails: [a], head: b, weight: 1 });
    expect(() => createDerivation(first.content, { tails: [b], head: a, weight: 1 })).not.toThrow();
    // Parallel derivations differ only by their generated ids.
    const second = createDerivation(first.content, { tails: [a], head: b, weight: 2 });
    expect(second.content.graph.hyperedges).toHaveLength(2);
    expect(second.objectId).not.toBe(first.objectId);
  });

  it('rejects unknown heads, dangling tails and invalid weights without modifying content', () => {
    const base = twoConcepts();
    const a = idOf(base, 'A');

    expect(() => createDerivation(base, { tails: [], head: 'ghost', weight: 1 })).toThrow('结果概念 ghost 不存在');
    expect(() => createDerivation(base, { tails: ['ghost'], head: a, weight: 1 })).toThrow('前提概念 ghost 不存在');
    expect(() => createDerivation(base, { tails: [], head: a, weight: -1 })).toThrow();
    expect(() => createDerivation(base, { tails: [], head: a, weight: 0.25 })).toThrow();
    expect(base.graph.hyperedges).toEqual([]);
  });
});

describe('tags as workspace content', () => {
  const tagged = () => {
    const base = createConcept(createWorkspace({ title: 'T' }).content, { label: 'A' }).content;
    return createConcept(base, { label: 'B' }).content;
  };

  it('declares tags and attaches them to concepts through complete content changes', () => {
    const declared = updateTagDeclarations(tagged(), [{ id: 'basics', label: '基础' }]).content;
    expect(declared.tags).toEqual([{ id: 'basics', label: '基础' }]);
    const attached = updateConceptTags(declared, { conceptId: idOf(declared, 'A'), tags: ['basics', 'basics', ' '] });
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
    const base = createConcept(createWorkspace({ title: 'T' }).content, { label: 'A' }).content;
    return updateTagDeclarations(createConcept(base, { label: 'B' }).content,
      [{ id: 'basics', label: '基础' }]).content;
  };
  const config = (content: WorkspaceContent, points: string[]): OrientationConfig => ({
    schema: ORIENTATION_SCHEMA,
    seed: { targets: [idOf(content, 'B')], known: [idOf(content, 'A')] },
    questions: [{ id: 'why', prompt: '为什么来', select: 'one', options: [
      { id: 'o', label: '学 B', actions: [{ op: 'set-targets', points }], next: 'finish' },
    ] }],
  });

  it('is absent by default and leaves the workspace valid', () => {
    expect(workspace().orientation).toEqual({ status: 'absent' });
  });

  it('writes the companion document without touching the manifest', () => {
    const content = workspace();
    const change = updateOrientation(content, config(content, [idOf(content, 'B')]));
    expect(change.changes.graph).toBeUndefined();
    expect(change.changes.companionMetadata).toEqual([
      { path: '.derivon/orientation.json', content: expect.stringContaining('"derivon.orientation/v1"') },
    ]);
    expect(change.content.graphText).toBe(content.graphText);
    expect(change.content.orientation).toEqual({ status: 'ready', config: config(content, [idOf(content, 'B')]), diagnostics: [] });
    expect(updateOrientation(change.content, null).changes.companionMetadata)
      .toEqual([{ path: '.derivon/orientation.json', content: null }]);
    expect(updateOrientation(change.content, null).content.orientation).toEqual({ status: 'absent' });
  });

  it('refuses to accept a configuration that would put a dangling reference into a route', () => {
    const content = workspace();
    expect(() => updateOrientation(content, config(content, ['gone']))).toThrow(/gone/);
    expect(content.orientation).toEqual({ status: 'absent' });
  });

  it('keeps an on-disk configuration with errors out of effective orientation, with diagnostics', () => {
    const content = workspace();
    const broken = parseWorkspaceContent({ graph: content.graphText, documents: content.documents,
      companionMetadata: { '.derivon/orientation.json': { status: 'ready', text: JSON.stringify(config(content, ['gone'])) } } });
    expect(broken.orientation.status).toBe('invalid');
    expect(broken.orientation.status === 'invalid' && broken.orientation.diagnostics.map((item) => item.code))
      .toEqual(['dangling-concept', 'empty-action']);
    expect(broken.diagnostics).toContainEqual({ path: '.derivon/orientation.json', message: expect.stringContaining('路线') });
  });

  it('reports which orientation references a concept deletion would break', () => {
    const base = workspace();
    const a = idOf(base, 'A');
    const b = idOf(base, 'B');
    const configured = updateOrientation(base, config(base, [b])).content;
    expect(orientationConceptImpact(configured, [a])).toEqual([
      { conceptId: a, at: { field: 'seed.known' } },
    ]);
    expect(orientationConceptImpact(configured, [b])).toEqual([
      { conceptId: b, at: { field: 'seed.targets' } },
      { conceptId: b, at: { field: 'action', questionId: 'why', optionId: 'o' } },
    ]);
    expect(orientationConceptImpact(configured, ['other'])).toEqual([]);
  });
});
