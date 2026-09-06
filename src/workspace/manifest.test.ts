import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_SCHEMA,
  conceptTags,
  conceptsWithTag,
  parseWorkspaceManifest,
  serializeWorkspaceManifest,
  validateWorkspaceManifest,
} from './manifest';

const v1 = (extra: Record<string, unknown> = {}) => JSON.stringify({
  schema: WORKSPACE_SCHEMA,
  document: { title: 'Linear algebra', description: '' },
  tags: [{ id: 'algebra', label: '代数', description: '基础代数' }],
  graph: {
    points: [
      { id: 'a', data: { label: 'A', document: 'docs/a', format: 'markdown', tags: ['algebra'] } },
      { id: 'b', data: { label: 'B', document: 'docs/b', format: 'html' } },
    ],
    hyperedges: [{ id: 'h', weight: 2, tails: ['a'], head: 'b', data: { document: 'docs/h', format: 'markdown' } }],
  },
  ...extra,
});

describe('derivon.workspace/v1 manifest', () => {
  it('parses a v1 manifest with declared tags and per-concept tags', () => {
    const parsed = parseWorkspaceManifest(v1());
    expect(parsed.dialect).toBeNull();
    expect(parsed.requiresConsent).toBe(false);
    expect(parsed.droppedLegacyFields).toEqual([]);
    expect(parsed.manifest.tags).toEqual([{ id: 'algebra', label: '代数', description: '基础代数' }]);
    expect(conceptTags(parsed.manifest.graph.points[0])).toEqual(['algebra']);
    expect(conceptTags(parsed.manifest.graph.points[1])).toEqual([]);
    expect(conceptsWithTag(parsed.manifest.graph, 'algebra').map((point) => point.id)).toEqual(['a']);
  });

  it('reads derivon.authoring/v0.3.0 as an input dialect without asking for consent', () => {
    const parsed = parseWorkspaceManifest(JSON.stringify({
      schema: 'derivon.authoring/v0.3.0',
      document: { title: 'Old', description: '' },
      graph: { points: [{ id: 'a', data: { label: 'A', document: 'docs/a', format: 'markdown' } }], hyperedges: [] },
      view: { replacements: [] },
    }));
    expect(parsed.dialect).toBe('derivon.authoring/v0.3.0');
    expect(parsed.requiresConsent).toBe(false);
    expect(parsed.manifest.schema).toBe(WORKSPACE_SCHEMA);
    expect(parsed.manifest.tags).toEqual([]);
    expect(parsed.droppedLegacyFields).toEqual([]);
  });

  it('reports retired replacement views as dropped rather than dropping them silently', () => {
    const parsed = parseWorkspaceManifest(JSON.stringify({
      schema: 'derivon.authoring/v0.3.0',
      document: { title: 'Old', description: '' },
      graph: { points: [
        { id: 'a', data: { label: 'A', document: 'docs/a', format: 'markdown' } },
        { id: 'x', data: { label: 'X', document: 'docs/x', format: 'markdown' } },
      ], hyperedges: [] },
      view: { replacements: [{ points: ['a'], replaceWith: 'x', show: 'points' }] },
    }));
    expect(parsed.droppedLegacyFields).toEqual(['view.replacements']);
    expect(serializeWorkspaceManifest(parsed.manifest)).not.toContain('replacements');
  });

  it('still requires consent for the schema before the last compatible dialect', () => {
    const parsed = parseWorkspaceManifest(JSON.stringify({
      schema: 'derivon.authoring/v0.2.0',
      document: { title: 'Older', description: '', updatedAt: 'x' },
      graph: { points: [], hyperedges: [] },
      view: { replacements: [] },
    }));
    expect(parsed.dialect).toBe('derivon.authoring/v0.2.0');
    expect(parsed.requiresConsent).toBe(true);
  });

  it('rejects a v1 manifest that still carries a replacement view', () => {
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
    expect(JSON.parse(text).graph.points[1].data).not.toHaveProperty('tags');
    expect(parseWorkspaceManifest(text).manifest).toEqual(parsed.manifest);
  });

  it('reports structural failures instead of throwing an opaque error', () => {
    expect(() => parseWorkspaceManifest('{')).toThrow();
    expect(() => parseWorkspaceManifest(JSON.stringify({ schema: 'derivon.workspace/v2' }))).toThrow(/schema/);
  });
});
