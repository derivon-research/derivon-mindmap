import Fuse from 'fuse.js';
import { objectDocumentHref, resolveWorkspaceReference } from './workspace/references';

export type EditorReferenceTarget = {
  kind: 'concept' | 'derivation';
  id: string;
  label: string;
  detail: string;
  document: string;
  searchTerms: string[];
};

/** The editor writes the same object links the workspace module reads. */
export const relativeReferenceHref = objectDocumentHref;

export function resolveReferenceTarget(
  documentPath: string,
  href: string,
  targets: readonly EditorReferenceTarget[],
): EditorReferenceTarget | null {
  const resolved = resolveWorkspaceReference(documentPath, href, '链接');
  if (resolved.kind !== 'workspace') return null;
  return targets.find((target) => `${target.document}/document.md` === resolved.path) ?? null;
}

export function validateEditorLinkHref(documentPath: string, href: string): string | null {
  const resolved = resolveWorkspaceReference(documentPath, href, '链接');
  return resolved.kind === 'invalid' ? resolved.reason : null;
}

export function searchReferenceTargets(
  targets: readonly EditorReferenceTarget[],
  query: string,
  limit = 12,
): EditorReferenceTarget[] {
  const value = query.trim().toLocaleLowerCase();
  if (!value) return targets.slice(0, limit);

  const fuse = new Fuse([...targets], {
    keys: ['label', 'id', 'searchTerms'],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 1,
    includeScore: true,
  });
  const fuzzyScore = new Map(fuse.search(value).map(({ item, score }) => [item.id, score ?? 1]));
  return targets
    .map((target, index) => {
      const id = target.id.toLocaleLowerCase();
      const label = target.label.toLocaleLowerCase();
      let rank: number;
      if (id === value) rank = 0;
      else if (label === value) rank = 1;
      else if (id.startsWith(value)) rank = 2;
      else if (label.startsWith(value)) rank = 3;
      else {
        const score = fuzzyScore.get(target.id);
        rank = score === undefined ? Number.POSITIVE_INFINITY : 4 + score;
      }
      return { target, index, rank };
    })
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map(({ target }) => target);
}
