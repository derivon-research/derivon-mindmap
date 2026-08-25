import { describe, expect, it } from 'vitest';
import { validateDocument } from './domain';
import { sampleDocument, sampleWorkspace } from './sample';
import {
  createDocumentDirectory,
  migrateLegacyDocument,
  parseWorkspaceSnapshot,
  validateWorkspace,
} from './workspace';

describe('authoring workspace', () => {
  it('rejects sharing one document directory between graph objects', () => {
    const invalid = structuredClone(sampleDocument);
    invalid.graph.points[1].data.document = invalid.graph.points[0].data.document;
    expect(validateDocument(invalid)).toContainEqual({
      path: 'graph.points[1].data.document',
      message: 'docs/concept-a 已由 点 A 拥有',
    });
  });

  it('requires every referenced document to exist in the workspace', () => {
    const invalid = structuredClone(sampleWorkspace);
    delete invalid.files['docs/concept-a/index.html'];
    expect(() => validateWorkspace(invalid)).toThrow('工作区缺少文档：docs/concept-a/index.html');
    expect(() => parseWorkspaceSnapshot(JSON.stringify(invalid))).toThrow('工作区缺少文档');

    const missingSource = structuredClone(sampleWorkspace);
    delete missingSource.files['docs/concept-a/document.md'];
    expect(() => validateWorkspace(missingSource)).toThrow('工作区缺少文档：docs/concept-a/document.md');
  });

  it('creates collision-free document directories for web-authored objects', () => {
    expect(createDocumentDirectory('concept', 'C 1', [])).toBe('docs/concept-c-1');
    expect(createDocumentDirectory('concept', 'C 1', ['docs/concept-c-1'])).toBe('docs/concept-c-1-2');
  });

  it('migrates inline v0.1 content to uniquely owned document directories', () => {
    const legacy = {
      schema: 'derivon.authoring/v0.1.0',
      document: { title: '旧文档', description: '', updatedAt: '2026-08-25T00:00:00.000Z' },
      graph: {
        points: [
          { id: 'A', data: { label: '概念 A', definition: 'A 的定义。' } },
          { id: 'B', data: { label: '概念 B', definition: '' } },
        ],
        hyperedges: [{
          id: 'h-1',
          weight: 1,
          tails: ['A'],
          head: 'B',
          data: { introduction: '目标', reasoning: '由 A 得到 B。' },
        }],
      },
      view: { positions: {}, replacements: [] },
    };
    const migrated = migrateLegacyDocument(JSON.stringify(legacy));
    expect(migrated.manifest.graph.points[0].data).toMatchObject({ document: 'docs/concept-a', format: 'markdown' });
    expect(migrated.manifest.graph.hyperedges[0].data).toEqual({ document: 'docs/derivation-h-1', format: 'markdown' });
    expect(migrated.files['docs/concept-a/document.md']).toContain('A 的定义。');
    expect(migrated.files['docs/concept-a/index.html']).toContain('A 的定义。');
    expect(migrated.files['docs/derivation-h-1/document.md']).toContain('由 A 得到 B。');
    expect(migrated.files['docs/derivation-h-1/index.html']).toContain('由 A 得到 B。');
    expect(new Set([
      ...migrated.manifest.graph.points.map((item) => item.data.document),
      ...migrated.manifest.graph.hyperedges.map((item) => item.data.document),
    ]).size).toBe(3);
  });
});
