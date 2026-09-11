import { describe, expect, it } from 'vitest';
import { WORKSPACE_SCHEMA } from './manifest';
import { parseWorkspaceContent } from './content';
import { documentReferences, objectDocumentHref, resolveWorkspaceReference } from './references';

const graph = JSON.stringify({
  schema: WORKSPACE_SCHEMA, id: 'test-workspace', document: { title: 'T', description: '' }, tags: [],
  graph: {
    points: [
      { id: 'c-a', data: { label: 'A', document: 'docs/concept-a' } },
      { id: 'c-b', data: { label: 'B', document: 'docs/concept-b' } },
    ],
    hyperedges: [{ id: 'h-1', weight: 1, tails: ['c-a'], head: 'c-b', data: { document: 'docs/derivation-1' } }],
  },
});
const basis = (assets?: Record<string, Uint8Array>) =>
  parseWorkspaceContent({ graph, documents: {}, assets });
const from = 'docs/concept-a/document.md';
const scan = (source: string, assets?: Record<string, Uint8Array>) =>
  documentReferences(basis(assets), from, source);

describe('what a workspace reference may point at', () => {
  it('separates remote URLs, page anchors and workspace-relative paths', () => {
    expect(resolveWorkspaceReference(from, 'https://example.com/a.png')).toEqual({ kind: 'remote', url: 'https://example.com/a.png' });
    expect(resolveWorkspaceReference(from, 'mailto:reader@example.com')).toEqual({ kind: 'remote', url: 'mailto:reader@example.com' });
    expect(resolveWorkspaceReference(from, '#section')).toEqual({ kind: 'anchor', fragment: 'section' });
    expect(resolveWorkspaceReference(from, '../concept-b/document.md#x')).toEqual({ kind: 'workspace', path: 'docs/concept-b/document.md' });
    expect(resolveWorkspaceReference(from, 'assets/a%20b.png')).toEqual({ kind: 'workspace', path: 'docs/concept-a/assets/a b.png' });
  });

  it('refuses paths that leave the workspace or name a capability instead of a file', () => {
    for (const value of ['javascript:alert(1)', 'data:image/png;base64,AA', '/etc/passwd', '\\\\server\\share', '../../../outside.md', 'assets/%zz.png', '']) {
      expect(resolveWorkspaceReference(from, value).kind).toBe('invalid');
    }
  });

  it('writes an object link relative to the document that carries it', () => {
    expect(objectDocumentHref(from, 'docs/concept-b')).toBe('../concept-b/document.md');
    expect(objectDocumentHref(from, 'docs/nested/concept x')).toBe('../nested/concept%20x/document.md');
  });
});

describe('the references a document body carries', () => {
  it('reads Markdown links, images, reference definitions and embedded HTML', () => {
    const report = scan([
      '[到 B](../concept-b/document.md)',
      '![图](assets/123e4567-e89b-42d3-a456-426614174000.png)',
      '<a href="../derivation-1/document.md">推导</a>',
      '<img src="../concept-b/assets/shared.png">',
      '[def]: ../concept-b/document.md',
      '见 [def] 与 <https://example.com>',
    ].join('\n\n'), { 'docs/concept-a/assets/123e4567-e89b-42d3-a456-426614174000.png': new Uint8Array([1]) });

    expect(report.references.map((item) => [item.use, item.syntax, item.raw, item.status, item.objectId])).toEqual([
      ['link', 'markdown', '../concept-b/document.md', 'object', 'c-b'],
      ['image', 'markdown', 'assets/123e4567-e89b-42d3-a456-426614174000.png', 'asset', undefined],
      ['link', 'html', '../derivation-1/document.md', 'object', 'h-1'],
      ['image', 'html', '../concept-b/assets/shared.png', 'unknown', undefined],
      ['link', 'markdown-definition', '../concept-b/document.md', 'object', 'c-b'],
    ]);
    expect(report.uncertainties).toEqual([]);
  });

  it('reports a link to a document no object owns as dangling, and a bad path as unsupported', () => {
    const report = scan('[无主](../concept-gone/document.md) [越界](../../../outside.md) [远端](https://example.com)');
    expect(report.references.map((item) => [item.raw, item.status])).toEqual([
      ['../concept-gone/document.md', 'dangling'],
      ['../../../outside.md', 'unsupported'],
      ['https://example.com', 'remote'],
    ]);
    expect(report.references[0].message).toMatch(/没有对象/);
  });

  it('does not claim a workspace file that effective content cannot decide about', () => {
    const report = scan('![还没读到](assets/earlier.png)');
    expect(report.references[0].status).toBe('unknown');
    expect(report.references[0].path).toBe('docs/concept-a/assets/earlier.png');
  });

  it('reads nothing out of code spans and fenced code', () => {
    const report = scan(['`[代码](../concept-gone/document.md)`', '```md', '[围栏](../concept-gone/document.md)', '```'].join('\n'));
    expect(report.references).toEqual([]);
    expect(report.uncertainties).toEqual([]);
  });

  it('reports a scripted or computed reference source as uncertain, never as no references', () => {
    const report = scan([
      '<script>document.write("<img src=\'assets/x.png\'>")</script>',
      '<img src="{{ page.image }}">',
      '<img data-src="assets/late.png">',
    ].join('\n\n'));
    expect(report.uncertainties.map((item) => item.reason)).toEqual(['script', 'dynamic-attribute', 'dynamic-attribute']);
    expect(report.uncertainties[0].detail).toMatch(/脚本/);
    expect(report.references).toEqual([]);
  });

  it('reports a Markdown link it cannot parse instead of dropping it', () => {
    const report = scan('[标题](../concept b/doc(1).md)');
    expect(report.uncertainties.map((item) => item.reason)).toEqual(['unparsed']);
  });
});
