import Fuse from 'fuse.js';

export type EditorReferenceTarget = {
  kind: 'concept' | 'derivation';
  id: string;
  label: string;
  detail: string;
  document: string;
  searchTerms: string[];
};

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function decodePathSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0') ? null : decoded;
  } catch {
    return null;
  }
}

function resolveWorkspacePath(documentPath: string, href: string): string | null {
  const pathOnly = href.split(/[?#]/, 1)[0];
  const parts = pathSegments(documentPath).slice(0, -1);
  for (const encodedSegment of pathOnly.split('/')) {
    if (!encodedSegment || encodedSegment === '.') continue;
    const segment = decodePathSegment(encodedSegment);
    if (segment === null) return null;
    if (segment === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.length ? parts.join('/') : null;
}

export function relativeReferenceHref(documentPath: string, targetDirectory: string): string {
  const source = pathSegments(documentPath).slice(0, -1);
  const target = [...pathSegments(targetDirectory), 'index.html'];
  let shared = 0;
  while (shared < source.length && shared < target.length && source[shared] === target[shared]) shared += 1;
  const relative = [
    ...Array.from({ length: source.length - shared }, () => '..'),
    ...target.slice(shared).map((segment) => encodeURIComponent(segment)),
  ];
  return relative.join('/') || 'index.html';
}

export function resolveReferenceTarget(
  documentPath: string,
  href: string,
  targets: readonly EditorReferenceTarget[],
): EditorReferenceTarget | null {
  const value = href.trim();
  if (!value || value.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    return null;
  }
  const resolved = resolveWorkspacePath(documentPath, value);
  if (!resolved) return null;
  return targets.find((target) => `${target.document}/index.html` === resolved) ?? null;
}

export function validateEditorLinkHref(documentPath: string, href: string): string | null {
  const value = href.trim();
  if (!value) return '链接地址为空';
  if (/^https?:\/\//i.test(value) || /^mailto:[^\s@]+@[^\s@]+$/i.test(value) || /^#[^\s]+$/.test(value)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    return '只允许 HTTP(S)、邮箱、页面锚点或工作区相对路径';
  }
  return resolveWorkspacePath(documentPath, value) ? null : '链接路径超出工作区范围或包含无效编码';
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
