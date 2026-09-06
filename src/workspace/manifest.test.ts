import { describe, expect, it } from 'vitest';
import nativeRouteFixture from '../../src-tauri/tests/fixtures/complete-workspace/.derivon/workspace.json';
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
    expect(parsed.manifest.tags).toEqual([{ id: 'algebra', label: '代数', description: '基础代数' }]);
    expect(conceptTags(parsed.manifest.graph.points[0])).toEqual(['algebra']);
    expect(conceptTags(parsed.manifest.graph.points[1])).toEqual([]);
    expect(conceptsWithTag(parsed.manifest.graph, 'algebra').map((point) => point.id)).toEqual(['a']);
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
