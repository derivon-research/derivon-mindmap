import { describe, expect, it } from 'vitest';
import {
  relativeReferenceHref,
  resolveReferenceTarget,
  searchReferenceTargets,
  validateEditorLinkHref,
  type EditorReferenceTarget,
} from './editorReferences';

const targets: EditorReferenceTarget[] = [
  {
    kind: 'concept',
    id: 'common-mode-feedback',
    label: '共模反馈环路',
    detail: 'common-mode-feedback',
    document: 'docs/concept-common-mode-feedback',
    searchTerms: ['共模反馈环路', 'common-mode-feedback'],
  },
  {
    kind: 'concept',
    id: 'output-range',
    label: '输出电压范围',
    detail: 'output-range',
    document: 'docs/nested/concept output range',
    searchTerms: ['输出电压范围', 'output-range'],
  },
  {
    kind: 'derivation',
    id: 'derive-cmfb',
    label: '推导 derive-cmfb',
    detail: '共模检测 + 参考电压 → 共模反馈环路',
    document: 'docs/derivation-derive-cmfb',
    searchTerms: ['共模检测', '参考电压', '共模反馈环路'],
  },
];

describe('editor object references', () => {
  it('creates portable links to generated index documents', () => {
    expect(relativeReferenceHref(
      'docs/concept-a/document.md',
      'docs/concept-common-mode-feedback',
    )).toBe('../concept-common-mode-feedback/index.html');
    expect(relativeReferenceHref(
      'docs/nested/concept-a/document.md',
      'docs/concept-common-mode-feedback',
    )).toBe('../../concept-common-mode-feedback/index.html');
    expect(relativeReferenceHref(
      'docs/concept-a/document.md',
      'docs/nested/concept output range',
    )).toBe('../nested/concept%20output%20range/index.html');
  });

  it('resolves only known workspace object links', () => {
    expect(resolveReferenceTarget(
      'docs/concept-a/document.md',
      '../concept-common-mode-feedback/index.html#details',
      targets,
    )?.id).toBe('common-mode-feedback');
    expect(resolveReferenceTarget('docs/concept-a/document.md', '../../outside/index.html', targets)).toBeNull();
    expect(resolveReferenceTarget('docs/concept-a/document.md', 'https://example.com', targets)).toBeNull();
    expect(resolveReferenceTarget('docs/concept-a/document.md', '../notes/index.html', targets)).toBeNull();
  });

  it('validates ordinary links without allowing executable or escaping URLs', () => {
    expect(validateEditorLinkHref('docs/concept-a/document.md', 'https://example.com')).toBeNull();
    expect(validateEditorLinkHref('docs/concept-a/document.md', 'mailto:reader@example.com')).toBeNull();
    expect(validateEditorLinkHref('docs/concept-a/document.md', '#section')).toBeNull();
    expect(validateEditorLinkHref('docs/concept-a/document.md', '../notes/spec.pdf')).toBeNull();
    expect(validateEditorLinkHref('docs/concept-a/document.md', 'javascript:alert(1)')).toContain('只允许');
    expect(validateEditorLinkHref('docs/concept-a/document.md', '../../../outside.pdf')).toContain('超出工作区');
  });

  it('ranks exact ids and prefixes before fuzzy relationship terms', () => {
    expect(searchReferenceTargets(targets, 'derive-cmfb').map((target) => target.id)).toEqual(['derive-cmfb']);
    expect(searchReferenceTargets(targets, '输出').map((target) => target.id)).toEqual(['output-range']);
    expect(searchReferenceTargets(targets, '参考电压').map((target) => target.id)).toContain('derive-cmfb');
    expect(searchReferenceTargets(targets, 'common-mode-feedback')[0]?.id).toBe('common-mode-feedback');
  });
});
