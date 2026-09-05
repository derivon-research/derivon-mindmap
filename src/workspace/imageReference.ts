export const IMAGE_FILE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/avif': 'avif', 'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/png': 'png',
  'image/svg+xml': 'svg', 'image/webp': 'webp',
};
export const EDITOR_IMAGE_MIME_TYPES = Object.keys(IMAGE_FILE_EXTENSIONS);
export function imageMimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  return Object.entries(IMAGE_FILE_EXTENSIONS).find(([, candidate]) => candidate === extension)?.[0]
    ?? (extension === 'jpeg' ? 'image/jpeg' : 'application/octet-stream');
}

export type WorkspaceImageReference =
  | { kind: 'remote'; url: string }
  | { kind: 'workspace'; path: string }
  | { kind: 'invalid'; reason: string };

export function resolveWorkspaceImageReference(documentPath: string, source: string): WorkspaceImageReference {
  const value = source.trim();
  if (/^https?:\/\//i.test(value)) return { kind: 'remote', url: value };
  if (!value) return { kind: 'invalid', reason: '图片地址为空' };
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    return { kind: 'invalid', reason: '只允许 HTTP(S) 或工作区相对图片路径' };
  }
  const pathOnly = value.split(/[?#]/, 1)[0];
  const parts = documentPath.split('/').slice(0, -1).filter(Boolean);
  for (const encodedSegment of pathOnly.split('/')) {
    let segment: string;
    try { segment = decodeURIComponent(encodedSegment); }
    catch { return { kind: 'invalid', reason: '图片路径包含无效的 URL 编码' }; }
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!parts.length) return { kind: 'invalid', reason: '图片路径超出工作区范围' };
      parts.pop();
      continue;
    }
    if (segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
      return { kind: 'invalid', reason: '图片路径包含无效字符' };
    }
    parts.push(segment);
  }
  if (!parts.length) return { kind: 'invalid', reason: '图片路径没有指向文件' };
  return { kind: 'workspace', path: parts.join('/') };
}
