import { describe, expect, it } from 'vitest';
import nativeRouteFixture from '../../src-tauri/tests/fixtures/complete-workspace/.derivon/workspace.json';
import {
  WORKSPACE_SCHEMA,
  conceptTags,
  conceptsWithTag,
  isValidWorkspaceId,
  parseWorkspaceManifest,
  serializeWorkspaceManifest,
  validateWorkspaceManifest,
} from './manifest';

const v1 = (extra: Record<string, unknown> = {}) => JSON.stringify({
  schema: WORKSPACE_SCHEMA,
  id: 'test-workspace',
  document: { title: 'Linear algebra', description: '' },
  tags: [{ id: 'algebra', label: '代数' }],
  graph: {
    points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', tags: ['algebra'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b' } },
    ],
    hyperedges: [{ id: 'h', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/h' } }],
  },
  ...extra,
});

describe('derivon.workspace/v1 manifest', () => {
  it('parses a v1 manifest with declared tags and per-concept tags', () => {
    const parsed = parseWorkspaceManifest(v1());
    expect(parsed.manifest.tags).toEqual([{ id: 'algebra', label: '代数' }]);
    expect(conceptTags(parsed.manifest.graph.points[0])).toEqual(['algebra']);
    expect(conceptTags(parsed.manifest.graph.points[1])).toEqual([]);
    expect(conceptsWithTag(parsed.manifest.graph, 'algebra').map((point) => point.id)).toEqual(['a']);
  });

  it('carries the workspace id as identity, and the display title stays separate', () => {
    const parsed = parseWorkspaceManifest(v1());
    expect(parsed.manifest.id).toBe('test-workspace');
    expect(parsed.manifest.document.title).toBe('Linear algebra');
  });

  it('reports a manifest with no id as a broken workspace, and refuses to read that manifest', () => {
    const manifest = JSON.parse(v1()) as Record<string, unknown>;
    delete manifest.id;
    expect(validateWorkspaceManifest(manifest)).toEqual([
      { path: 'id', message: expect.stringContaining('缺少工作区 id') },
    ]);
    expect(() => parseWorkspaceManifest(JSON.stringify(manifest))).toThrow(/缺少工作区 id/);
  });

  it('refuses an id that is not one filesystem-safe path segment, naming the rule', () => {
    for (const id of ['a/b', 'a\\b', 'a b', '..', '.hidden', '', '工作区']) {
      expect(isValidWorkspaceId(id)).toBe(false);
      expect(validateWorkspaceManifest(JSON.parse(v1({ id })))).toEqual([
        { path: 'id', message: expect.stringContaining('路径名') },
      ]);
    }
  });

  it('reports an id that is not a string at all, and never reads it as one', () => {
    for (const id of [null, 42, true, {}, [], ['a']]) {
      expect(isValidWorkspaceId(id)).toBe(false);
      expect(validateWorkspaceManifest(JSON.parse(v1({ id })))).toEqual([
        { path: 'id', message: expect.stringContaining('路径名') },
      ]);
    }
  });

  /* Case is not folded anywhere, so two ids differing only in case cannot both exist: any
   * uppercase letter is refused, and the collision the rule forbids cannot be expressed. */
  it('refuses every case variant of an id instead of folding it', () => {
    for (const id of ['My-Workspace', 'MY-WORKSPACE', 'my-Workspace']) {
      expect(isValidWorkspaceId(id)).toBe(false);
      expect(validateWorkspaceManifest(JSON.parse(v1({ id })))).toEqual([
        { path: 'id', message: expect.stringContaining('路径名') },
      ]);
    }
  });

  it('refuses an id a hyphen would leave without a letter or digit at either end', () => {
    for (const id of ['-a', 'a-', '-', '--']) {
      expect(isValidWorkspaceId(id)).toBe(false);
    }
  });

  /* An id becomes a directory name, and Windows will not create these as directories at all. */
  it('refuses an id Windows refuses as a directory name', () => {
    for (const id of ['con', 'nul', 'prn', 'aux', 'com1', 'com9', 'lpt1', 'lpt9']) {
      expect(isValidWorkspaceId(id), id).toBe(false);
      expect(validateWorkspaceManifest(JSON.parse(v1({ id }))), id).toEqual([
        { path: 'id', message: expect.stringContaining('保留的设备名') },
      ]);
    }
    for (const id of ['console', 'com', 'com10', 'lpt', 'lpt10', 'aux-2']) {
      expect(isValidWorkspaceId(id), id).toBe(true);
    }
  });

  it('refuses an unusable id at the reading seam too, not only in the validator', () => {
    expect(() => parseWorkspaceManifest(v1({ id: 'My-Workspace' }))).toThrow(/路径名/);
    expect(() => parseWorkspaceManifest(v1({ id: 'con' }))).toThrow(/保留的设备名/);
  });

  /* The literal lengths, not WORKSPACE_ID_MAX_LENGTH: the spec fixes the limit at 64 characters,
   * so a boundary read off the constant could not disagree with the code. */
  it('accepts an id of exactly 64 characters and refuses the 65th', () => {
    const atLimit = 'a'.repeat(64);
    expect(isValidWorkspaceId(atLimit)).toBe(true);
    expect(validateWorkspaceManifest(JSON.parse(v1({ id: atLimit })))).toEqual([]);

    const overLimit = `${atLimit}b`;
    expect(isValidWorkspaceId(overLimit)).toBe(false);
    expect(validateWorkspaceManifest(JSON.parse(v1({ id: overLimit })))).toEqual([
      { path: 'id', message: expect.stringContaining('路径名') },
    ]);
  });

  it('reports a top-level key the protocol does not define', () => {
    expect(validateWorkspaceManifest(JSON.parse(v1({ extra: true }))))
      .toEqual([{ path: 'extra', message: expect.stringContaining('顶层') }]);
  });

  it('refuses a schema string it does not know', () => {
    for (const schema of ['derivon.authoring/v0.3.0', 'derivon.authoring/v0.2.0']) {
      expect(() => parseWorkspaceManifest(JSON.stringify({
        schema,
        document: { title: 'Old', description: '' },
        graph: { points: [], hyperedges: [] },
        view: { replacements: [] },
      }))).toThrow(/schema/);
    }
  });

  it('rejects a manifest that still carries a replacement view', () => {
    expect(validateWorkspaceManifest(JSON.parse(v1({ view: { replacements: [] } }))))
      .toEqual([{ path: 'view', message: expect.stringContaining('替换视图') }]);
  });

  it('rejects malformed tag declarations, concept tags and duplicates', () => {
    const issues = validateWorkspaceManifest(JSON.parse(v1({
      tags: [{ id: 'algebra', label: '代数' }, { id: 'algebra', label: '重复' }, { id: '', label: 'x' }, { id: 'c', label: 4 }],
    })));
    expect(issues.map((issue) => issue.path)).toEqual(['tags[1].id', 'tags[2].id', 'tags[3].label']);
  });

  it('requires concept tags to be a list of non-empty strings, and keeps tags off derivations', () => {
    const manifest = JSON.parse(v1()) as {
      graph: { points: { data: Record<string, unknown> }[]; hyperedges: { data: Record<string, unknown> }[] };
    };
    manifest.graph.points[0].data.tags = ['ok', '', 7];
    manifest.graph.hyperedges[0].data.tags = ['algebra'];
    expect(validateWorkspaceManifest(manifest).map((issue) => issue.path))
      .toEqual(['graph.points[0].data.tags[1]', 'graph.points[0].data.tags[2]', 'graph.hyperedges[0].data.tags']);
  });

  it('serializes without empty optional collections and round trips', () => {
    const parsed = parseWorkspaceManifest(v1());
    const text = serializeWorkspaceManifest(parsed.manifest);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ schema: 'derivon.workspace/v1', id: 'test-workspace' });
    expect(JSON.parse(text).graph.points[1].data).not.toHaveProperty('tags');
    expect(parseWorkspaceManifest(text).manifest).toEqual(parsed.manifest);
  });

  it('accepts the fixture the native route tests run against, so both sides read one protocol', () => {
    const parsed = parseWorkspaceManifest(JSON.stringify(nativeRouteFixture));
    expect(parsed.manifest.graph.points).toHaveLength(6);
    expect(parsed.manifest.graph.hyperedges).toHaveLength(8);
    expect(parsed.manifest.graph.hyperedges.some((edge) => edge.tails.length === 0)).toBe(true);
    expect(parsed.manifest.graph.hyperedges.some((edge) => edge.tails.length === 2)).toBe(true);
    expect(conceptsWithTag(parsed.manifest.graph, 'given').map((point) => point.id)).toEqual(['A', 'B']);
  });

  it('reports structural failures with their location', () => {
    expect(() => parseWorkspaceManifest('{')).toThrow();
    expect(() => parseWorkspaceManifest(JSON.stringify({ schema: 'derivon.workspace/v2' }))).toThrow(/schema/);
  });
});
