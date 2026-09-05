import { useEffect, useState } from 'react';
import { resolveWorkspaceImageReference, imageMimeType } from '../workspace/imageReference';
import type { ResolvedEditorImage, EditorImageResolver } from '../editorImage';

function imageDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Sandboxed object HTML; workspace images use the reader, never a native URL. */
export function DocumentPreview({ html, title, documentPath, readAsset, resolveImage, className, allowScripts = false }: {
  html: string; title: string; documentPath: string; className?: string; allowScripts?: boolean;
  readAsset?: (path: string) => Promise<Uint8Array>; resolveImage?: EditorImageResolver;
}) {
  const [prepared, setPrepared] = useState('');
  useEffect(() => {
    let cancelled = false;
    const releases: Array<() => void> = [];
    async function resolve(source: string): Promise<ResolvedEditorImage> {
      if (resolveImage) {
        const resource = await resolveImage(source);
        if (!resource.url.startsWith('blob:')) return resource;
        // Opaque-origin frames cannot load a parent-origin blob URL.
        try { return { url: await imageDataUrl(await (await fetch(resource.url)).blob()) }; }
        finally { resource.release?.(); }
      }
      const resolved = resolveWorkspaceImageReference(documentPath, source);
      if (resolved.kind === 'invalid') throw new Error(resolved.reason);
      if (resolved.kind === 'remote') return { url: resolved.url };
      if (!readAsset) throw new Error('工作区图片读取不可用');
      return { url: await imageDataUrl(new Blob([new Uint8Array(await readAsset(resolved.path))], { type: imageMimeType(resolved.path) })) };
    }
    void (async () => {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      await Promise.all([...parsed.querySelectorAll('img')].map(async (image) => {
        try {
          const resource = await resolve(image.getAttribute('src') ?? '');
          if (cancelled) { resource.release?.(); return; }
          if (resource.release) releases.push(resource.release);
          image.src = resource.url;
          image.removeAttribute('srcset');
        } catch {
          image.removeAttribute('src');
          image.removeAttribute('srcset');
          image.alt = `${image.alt || '图片'}（无法加载）`;
        }
      }));
      if (!cancelled) setPrepared(parsed.documentElement.outerHTML);
    })();
    return () => { cancelled = true; releases.forEach((release) => release()); };
  }, [documentPath, html, readAsset, resolveImage]);
  return <iframe title={title} className={className} sandbox={allowScripts ? 'allow-scripts' : ''} srcDoc={prepared} />;
}
