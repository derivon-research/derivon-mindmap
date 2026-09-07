import { resolveWorkspaceReference } from './references';

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

/** An image reads the same paths as any other reference, minus the ones it cannot show. */
export function resolveWorkspaceImageReference(documentPath: string, source: string): WorkspaceImageReference {
  const resolved = resolveWorkspaceReference(documentPath, source, '图片');
  if (resolved.kind === 'workspace') return { kind: 'workspace', path: resolved.path };
  if (resolved.kind === 'remote' && /^https?:/i.test(resolved.url)) return { kind: 'remote', url: resolved.url };
  return { kind: 'invalid', reason: resolved.kind === 'invalid' ? resolved.reason : '只允许 HTTP(S) 或工作区相对图片路径' };
}
