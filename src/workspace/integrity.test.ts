import { describe, expect, it } from 'vitest';
import { ORIENTATION_SCHEMA, WORKSPACE_SCHEMA } from './index';
import { parseWorkspaceContent, type WorkspaceContent } from './content';
import {
  deleteObjects, deletionScope, isDeletionSafe, referenceImpact, repairDocumentReferences, restoreObjectDocument,
} from './integrity';

const graph = JSON.stringify({
  schema: WORKSPACE_SCHEMA, id: 'test-workspace', document: { title: 'T', description: '' }, tags: [],
  graph: {
    points: [
      { id: 'c-a', data: { label: 'A', document: 'docs/concept-a' } },
      { id: 'c-b', data: { label: 'B', document: 'docs/concept-b' } },
      { id: 'c-c', data: { label: 'C', document: 'docs/concept-c' } },
    ],
    hyperedges: [{ id: 'h-1', weight: 1, tails: ['c-a'], head: 'c-b', data: { document: 'docs/derivation-1' } }],
  },
});

const body = [
  '# A',
  '见 [B 的文档](../concept-b/document.md)。',
  '![共享图](../concept-b/assets/shared.png)',
  '<a href="../concept-b/document.md">再看一次</a>',
].join('\n\n');

const workspace = (documents: Record<string, { status: 'ready'; text: string } | { status: 'error'; message: string }>,
  companionMetadata?: Record<string, { status: 'ready'; text: string } | null>): WorkspaceContent =>
  parseWorkspaceContent({ graph, documents, companionMetadata });

const whole = (extra: Record<string, string> = {}) => workspace({
  'docs/concept-a/document.md': { status: 'ready', text: body },
  'docs/concept-b/document.md': { status: 'ready', text: '# B' },
  'docs/concept-c/document.md': { status: 'ready', text: '# C' },
  'docs/derivation-1/document.md': { status: 'ready', text: '# 推导' },
  ...Object.fromEntries(Object.entries(extra).map(([path, text]) => [path, { status: 'ready' as const, text }])),
});

describe('what a deletion would take with it', () => {
  it('takes the derivations that touch a deleted concept, with their owned directories', () => {
    const scope = deletionScope(whole(), { conceptIds: ['c-b'] });
    expect(scope.concepts.map((point) => point.id)).toEqual(['c-b']);
    expect(scope.derivations.map((edge) => edge.id)).toEqual(['h-1']);
    expect(scope.directories).toEqual(['docs/concept-b', 'docs/derivation-1']);
    expect(scope.documentPaths).toEqual(['docs/concept-b/document.md', 'docs/derivation-1/document.md']);
  });
});

describe('the references a deletion would break', () => {
  it('reports cross-document links and shared images from surviving documents', () => {
    const impact = referenceImpact(whole(), { conceptIds: ['c-b'] });
    expect(impact.incoming.map((item) => [item.from.documentPath, item.reference.use, item.reference.raw])).toEqual([
      ['docs/concept-a/document.md', 'link', '../concept-b/document.md'],
      ['docs/concept-a/document.md', 'image', '../concept-b/assets/shared.png'],
      ['docs/concept-a/document.md', 'link', '../concept-b/document.md'],
    ]);
    expect(impact.complete).toBe(true);
    // Read in full, but something still points at it: not a safe deletion either.
    expect(isDeletionSafe(impact)).toBe(false);
    expect(isDeletionSafe(referenceImpact(whole(), { conceptIds: ['c-c'] }))).toBe(true);
  });

  it('is not complete when a reference source could not be read', () => {
    const damaged = workspace({
      'docs/concept-a/document.md': { status: 'error', message: 'Permission denied' },
      'docs/concept-b/document.md': { status: 'ready', text: '# B' },
      'docs/derivation-1/document.md': { status: 'ready', text: '' },
    });
    const impact = referenceImpact(damaged, { conceptIds: ['c-b'] });
    expect(impact.unreadable).toEqual([{ path: 'docs/concept-a/document.md', message: 'Permission denied' }]);
    expect(impact.unread).toEqual(['docs/concept-c/document.md']);
    expect(impact.complete).toBe(false);
  });

  it('is not complete when a surviving document computes its references', () => {
    const impact = referenceImpact(whole({ 'docs/concept-c/document.md': '<img src="{{ page.image }}">' }), { conceptIds: ['c-b'] });
    expect(impact.uncertain.map((item) => [item.documentPath, item.uncertainty.reason]))
      .toEqual([['docs/concept-c/document.md', 'dynamic-attribute']]);
    expect(impact.complete).toBe(false);
  });

  it('carries the orientation references the same deletion would break', () => {
    const configured = workspace({ 'docs/concept-a/document.md': { status: 'ready', text: '' },
      'docs/concept-b/document.md': { status: 'ready', text: '' },
      'docs/concept-c/document.md': { status: 'ready', text: '' },
      'docs/derivation-1/document.md': { status: 'ready', text: '' } }, {
      '.derivon/orientation.json': { status: 'ready', text: JSON.stringify({
        schema: ORIENTATION_SCHEMA, seed: { targets: ['c-b'], known: [] }, questions: [] }) },
    });
    expect(referenceImpact(configured, { conceptIds: ['c-b'] }).orientation)
      .toEqual([{ conceptId: 'c-b', at: { field: 'seed.targets' } }]);
  });

  it("does not report a deleted document's references to another deleted document", () => {
    const impact = referenceImpact(whole({ 'docs/derivation-1/document.md': '[B](../concept-b/document.md)' }), { conceptIds: ['c-b'] });
    expect(impact.incoming.every((item) => item.from.documentPath === 'docs/concept-a/document.md')).toBe(true);
  });
});

describe('repairing references through a complete content change', () => {
  const impactOf = (content: WorkspaceContent) => referenceImpact(content, { conceptIds: ['c-b'] });

  it('retargets, unlinks and removes exactly the chosen references', () => {
    const content = whole();
    const [link, image, htmlLink] = impactOf(content).incoming.map((item) => item.reference);
    const repaired = repairDocumentReferences(content, {
      object: { kind: 'concept', id: 'c-a' },
      repairs: [
        { at: link.at, action: 'retarget', target: { kind: 'concept', id: 'c-c' } },
        { at: image.at, action: 'remove' },
        { at: htmlLink.at, action: 'unlink' },
      ],
    });
    const text = repaired.content.documents['docs/concept-a/document.md'];
    expect(text).toEqual({ status: 'ready', text: ['# A', '见 [B 的文档](../concept-c/document.md)。', '', '再看一次'].join('\n\n') });
    expect(repaired.changes.documents).toEqual([{ path: 'docs/concept-a/document.md', content: text.status === 'ready' ? text.text : '' }]);
    expect(referenceImpact(repaired.content, { conceptIds: ['c-b'] }).incoming).toEqual([]);
  });

  it('refuses a repair whose reference is no longer where the plan says it is', () => {
    const content = whole();
    expect(() => repairDocumentReferences(content, { object: { kind: 'concept', id: 'c-a' },
      repairs: [{ at: { start: 0, end: 4 }, action: 'remove' }] })).toThrow(/引用/);
    expect(content.documents['docs/concept-a/document.md']).toEqual({ status: 'ready', text: body });
  });

  it('refuses two repairs for the same reference instead of rewriting it twice', () => {
    const content = whole();
    const link = impactOf(content).incoming[0].reference;
    expect(() => repairDocumentReferences(content, { object: { kind: 'concept', id: 'c-a' },
      repairs: [{ at: link.at, action: 'unlink' }, { at: link.at, action: 'remove' }] })).toThrow(/只能选一种/);
  });

  it('refuses to turn an image into text instead of quietly dropping it', () => {
    const content = whole();
    const image = impactOf(content).incoming[1].reference;
    expect(() => repairDocumentReferences(content, { object: { kind: 'concept', id: 'c-a' },
      repairs: [{ at: image.at, action: 'unlink' }] })).toThrow(/图片/);
  });
});

describe('deleting objects with everything they own', () => {
  const orientationText = JSON.stringify({
    schema: ORIENTATION_SCHEMA,
    seed: { targets: ['c-b'], known: ['c-a'] },
    questions: [{ id: 'q1', prompt: '?', select: 'one', options: [
      { id: 'o1', label: 'B', actions: [{ op: 'add-targets', points: ['c-b'] }] },
      { id: 'o2', label: 'A 与 B', actions: [{ op: 'add-known', points: ['c-a', 'c-b'] }] },
    ] }],
  });
  /** The inventory a host would report: `document.md` plus assets no body mentions. */
  const inventory = {
    'docs/concept-b': ['docs/concept-b/document.md', 'docs/concept-b/assets/shared.png', 'docs/concept-b/notes.txt'],
    'docs/derivation-1': ['docs/derivation-1/document.md'],
    'docs/concept-c': ['docs/concept-c/document.md'],
  };

  it('removes the concept, its derivations, their documents and every owned asset', () => {
    const change = deleteObjects(whole(), { plan: { conceptIds: ['c-c'] },
      ownedFiles: { 'docs/concept-c': inventory['docs/concept-c'] } });
    expect(change.content.graph.points.map((point) => point.id)).toEqual(['c-a', 'c-b']);
    expect(change.changes.documents).toEqual([{ path: 'docs/concept-c/document.md', content: null }]);
    expect(change.content.documents['docs/concept-c/document.md']).toBeUndefined();
  });

  it('deletes assets the document text no longer mentions, because the inventory says they are there', () => {
    const content = whole();
    const [link, image, htmlLink] = referenceImpact(content, { conceptIds: ['c-b'] }).incoming.map((item) => item.reference);
    const change = deleteObjects(content, {
      plan: { conceptIds: ['c-b'] },
      ownedFiles: { 'docs/concept-b': inventory['docs/concept-b'], 'docs/derivation-1': inventory['docs/derivation-1'] },
      repairs: [{ object: { kind: 'concept', id: 'c-a' }, repairs: [
        { at: link.at, action: 'retarget', target: { kind: 'concept', id: 'c-c' } },
        { at: image.at, action: 'remove' },
        { at: htmlLink.at, action: 'unlink' },
      ] }],
    });
    expect(change.changes.assets).toEqual([
      { path: 'docs/concept-b/assets/shared.png', content: null },
      { path: 'docs/concept-b/notes.txt', content: null },
    ]);
    expect(change.changes.documents).toEqual([
      { path: 'docs/concept-a/document.md', content: expect.stringContaining('../concept-c/document.md') },
      { path: 'docs/concept-b/document.md', content: null },
      { path: 'docs/derivation-1/document.md', content: null },
    ]);
    // One change: the graph, the owned files and the repairs travel together.
    expect(change.content.graph.points.map((point) => point.id)).toEqual(['c-a', 'c-c']);
    expect(change.content.graph.hyperedges).toEqual([]);
  });

  it('refuses a file that is not inside a directory being removed', () => {
    expect(() => deleteObjects(whole(), { plan: { conceptIds: ['c-c'] },
      ownedFiles: { 'docs/concept-c': ['docs/concept-c/document.md', 'docs/concept-a/document.md'] } }))
      .toThrow(/docs\/concept-a\/document\.md/);
    expect(() => deleteObjects(whole(), { plan: { conceptIds: ['c-c'] },
      ownedFiles: { 'docs/concept-c': ['docs/concept-c-2/document.md'] } })).toThrow(/不在/);
  });

  it('refuses a plan whose inventory does not cover every directory it removes', () => {
    expect(() => deleteObjects(whole(), { plan: { conceptIds: ['c-b'] },
      ownedFiles: { 'docs/concept-b': inventory['docs/concept-b'] } })).toThrow(/docs\/derivation-1/);
  });

  it('refuses to delete while something still points at it', () => {
    expect(() => deleteObjects(whole(), { plan: { conceptIds: ['c-b'] },
      ownedFiles: { 'docs/concept-b': inventory['docs/concept-b'], 'docs/derivation-1': inventory['docs/derivation-1'] } }))
      .toThrow(/还有 3 处引用/);
  });

  it('refuses to delete when a reference source could not be read', () => {
    const damaged = workspace({
      'docs/concept-a/document.md': { status: 'error', message: 'Permission denied' },
      'docs/concept-b/document.md': { status: 'ready', text: '' },
      'docs/concept-c/document.md': { status: 'ready', text: '' },
      'docs/derivation-1/document.md': { status: 'ready', text: '' },
    });
    expect(() => deleteObjects(damaged, { plan: { conceptIds: ['c-c'] },
      ownedFiles: { 'docs/concept-c': inventory['docs/concept-c'] } })).toThrow(/无法分析|读不出|不完整/);
  });

  it('refuses to delete when an owned body has not been read at all', () => {
    expect(() => deleteObjects(workspace({}), { plan: { conceptIds: ['c-c'] },
      ownedFiles: { 'docs/concept-c': inventory['docs/concept-c'] } })).toThrow(/不完整/);
  });

  it('takes the concept out of the orientation configuration only when that is confirmed', () => {
    const configured = () => workspace({
      'docs/concept-a/document.md': { status: 'ready', text: '' },
      'docs/concept-b/document.md': { status: 'ready', text: '' },
      'docs/concept-c/document.md': { status: 'ready', text: '' },
      'docs/derivation-1/document.md': { status: 'ready', text: '' },
    }, { '.derivon/orientation.json': { status: 'ready', text: orientationText } });
    const plan = { plan: { conceptIds: ['c-b'] },
      ownedFiles: { 'docs/concept-b': inventory['docs/concept-b'], 'docs/derivation-1': inventory['docs/derivation-1'] } };
    expect(() => deleteObjects(configured(), plan)).toThrow(/开局配置/);

    const change = deleteObjects(configured(), { ...plan, repairOrientation: true });
    expect(change.content.orientation.status).toBe('ready');
    const config = change.content.orientation.status === 'ready' ? change.content.orientation.config : null;
    expect(config?.seed).toEqual({ targets: [], known: ['c-a'] });
    // An action left naming nothing would be a broken configuration, so it goes with it;
    // an action that still names another concept keeps that one.
    expect(config?.questions[0].options.map((option) => option.actions)).toEqual([
      [], [{ op: 'add-known', points: ['c-a'] }],
    ]);
    expect(change.changes.companionMetadata?.[0].path).toBe('.derivon/orientation.json');
  });

  it('refuses a plan that names an object the graph does not have', () => {
    expect(() => deleteObjects(whole(), { plan: { conceptIds: ['c-zz'] }, ownedFiles: {} })).toThrow(/c-zz/);
    expect(() => deleteObjects(whole(), { plan: {}, ownedFiles: {} })).toThrow(/没有要删除的对象/);
  });
});

describe('repairing a missing or damaged object document', () => {
  const damaged = () => workspace({
    'docs/concept-a/document.md': { status: 'error', message: '文件不存在' },
    'docs/concept-b/document.md': { status: 'ready', text: '# B' },
    'docs/concept-c/document.md': { status: 'ready', text: '# C' },
    'docs/derivation-1/document.md': { status: 'ready', text: '' },
  });

  it('creates the absent document only when a user asks for it, and only if it is absent', () => {
    const restored = restoreObjectDocument(damaged(), { object: { kind: 'concept', id: 'c-a' } });
    expect(restored.changes.documents).toEqual([{ path: 'docs/concept-a/document.md', content: '', createOnly: true }]);
    expect(restored.content.documents['docs/concept-a/document.md']).toEqual({ status: 'ready', text: '' });
    expect(restored.content.diagnostics).toEqual([]);
  });

  it('overwrites an unreadable document only as its own confirmed decision', () => {
    const overwritten = restoreObjectDocument(damaged(), { object: { kind: 'concept', id: 'c-a' }, overwriteDamaged: true });
    expect(overwritten.changes.documents).toEqual([{ path: 'docs/concept-a/document.md', content: '' }]);
  });

  it('is not a way to blank a readable document, and not an implicit open-time repair', () => {
    expect(() => restoreObjectDocument(damaged(), { object: { kind: 'concept', id: 'c-b' } })).toThrow(/已经可以读取/);
    // An unread document is not a missing one: nothing may be written on a guess.
    expect(() => restoreObjectDocument(workspace({}), { object: { kind: 'concept', id: 'c-a' } })).toThrow(/还没有读取/);
  });
});
