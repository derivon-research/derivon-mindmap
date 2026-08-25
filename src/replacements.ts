import type { AuthoringDocument, ViewReplacement } from './domain';

export type ReplacementIssue = {
  code: string;
  message: string;
};

export type ReplacementAnalysis = {
  valid: boolean;
  issues: ReplacementIssue[];
};

const issue = (code: string, message: string): ReplacementIssue => ({ code, message });

export function analyzeReplacement(
  document: AuthoringDocument,
  replacement: ViewReplacement,
): ReplacementAnalysis {
  const issues: ReplacementIssue[] = [];
  const conceptIds = new Set(document.graph.concepts.map((concept) => concept.id));
  const other = document.view.replacements.filter((item) => item.replaceWith !== replacement.replaceWith);
  const ownerByPoint = new Map<string, string>();
  other.forEach((item) => item.points.forEach((id) => ownerByPoint.set(id, item.replaceWith)));

  if (!replacement.points.length) issues.push(issue('empty', '至少选择一个概念'));
  if (!conceptIds.has(replacement.replaceWith)) issues.push(issue('target', '替换点不存在'));
  if (replacement.points.includes(replacement.replaceWith)) issues.push(issue('self', '替换点不能位于所选点集中'));
  if (document.view.replacements.some((item) => item.replaceWith === replacement.replaceWith)) {
    issues.push(issue('target', `${replacement.replaceWith} 已经是一条替换关系的结果`));
  }
  const claimed = replacement.points.find((id) => ownerByPoint.has(id));
  if (claimed) issues.push(issue('overlap', `${claimed} 已属于 ${ownerByPoint.get(claimed)} 的替换点集`));

  const parentByPoint = new Map(ownerByPoint);
  replacement.points.forEach((id) => parentByPoint.set(id, replacement.replaceWith));
  let cursor: string | undefined = replacement.replaceWith;
  const visited = new Set<string>();
  while (cursor && parentByPoint.has(cursor)) {
    if (visited.has(cursor)) {
      issues.push(issue('cycle', '替换关系不能形成循环'));
      break;
    }
    visited.add(cursor);
    cursor = parentByPoint.get(cursor);
  }
  return { valid: issues.length === 0, issues };
}

export function replacementFromSelection(
  document: AuthoringDocument,
  selectedIds: Iterable<string>,
  replaceWith: string,
): { replacement: ViewReplacement | null; analysis: ReplacementAnalysis } {
  const selected = new Set(selectedIds);
  const points = document.graph.concepts.filter((concept) => selected.has(concept.id)).map((concept) => concept.id);
  const replacement: ViewReplacement = { points, replaceWith, show: 'points' };
  const analysis = analyzeReplacement(document, replacement);
  return { replacement: analysis.valid ? replacement : null, analysis };
}
