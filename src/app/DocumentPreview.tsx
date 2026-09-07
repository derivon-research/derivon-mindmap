import { useEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { markdownToHtml } from '../documentContent';
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

/** Render only the document being viewed; generated HTML never enters workspace content. */
export function MarkdownPreview({ markdown, ...props }: Omit<ComponentProps<typeof DocumentPreview>, 'html'> & { markdown: string }) {
  const html = useMemo(() => markdownToHtml(markdown, props.title), [markdown, props.title]);
  return <DocumentPreview {...props} html={html} />;
}

/**
 * Grow the frame to its content so the page it sits on is the only thing that scrolls.
 *
 * A document boxed inside its own scroller reads as a widget, not a page: two scrollbars,
 * and whatever follows the document can never sit at its end. Measuring needs the frame's
 * own document, which needs `allow-same-origin` — safe only because scripts stay off, so
 * nothing in there can run and reach back out.
 *
 * What is measured is the body box, and what is watched is the body. The frame's own
 * scroll height is clamped to the height we last gave it, so a page that measured tall
 * once could never come back down: turning to a shorter document would leave screens of
 * blank between its last line and whatever follows.
 */
function useContentHeight(frame: RefObject<HTMLIFrameElement | null>, markup: string | undefined, enabled: boolean) {
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const iframe = frame.current;
    if (!enabled || !iframe || markup === undefined) return;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      const view = iframe.contentWindow;
      const body = iframe.contentDocument?.body;
      const root = iframe.contentDocument?.documentElement;
      if (!view || !body || !root) return;
      const style = view.getComputedStyle(body);
      // Both boxes are content-sized, so both can shrink. The body's own margins may
      // collapse out of it and only show up on the root, hence the larger of the two.
      setHeight(Math.ceil(Math.max(
        root.getBoundingClientRect().height,
        body.getBoundingClientRect().height
          + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0),
      )));
    };
    const attach = () => {
      const view = iframe.contentWindow as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
      const body = iframe.contentDocument?.body;
      if (!view?.ResizeObserver || !body) return;
      measure();
      observer?.disconnect();
      // Web fonts, images and KaTeX metrics land after the first paint and change the height.
      const watch = new view.ResizeObserver(measure);
      observer = watch;
      watch.observe(body);
      void iframe.contentDocument?.fonts?.ready.then(measure).catch(() => {});
    };
    iframe.addEventListener('load', attach);
    attach();
    return () => { iframe.removeEventListener('load', attach); observer?.disconnect(); };
  }, [enabled, frame, markup]);
  return enabled ? height : undefined;
}

/** Sandboxed object HTML; workspace images use the reader, never a native URL. */
export function DocumentPreview({ html, title, documentPath, readAsset, resolveImage, className, allowScripts = false, autoHeight = false }: {
  html: string; title: string; documentPath: string; className?: string; allowScripts?: boolean;
  /** Size the frame to its content instead of its container, for a page that scrolls as one. */
  autoHeight?: boolean;
  readAsset?: (path: string) => Promise<Uint8Array>; resolveImage?: EditorImageResolver;
}) {
  const [prepared, setPrepared] = useState<{
    source: string; path: string; markup: string; reader: typeof readAsset; resolver: typeof resolveImage;
  } | null>(null);
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
      if (!cancelled) setPrepared({ source: html, path: documentPath, markup: parsed.documentElement.outerHTML,
        reader: readAsset, resolver: resolveImage });
    })();
    return () => { cancelled = true; releases.forEach((release) => release()); };
  }, [documentPath, html, readAsset, resolveImage]);
  const current = prepared?.source === html && prepared?.path === documentPath
    && prepared?.reader === readAsset && prepared?.resolver === resolveImage;
  const frame = useRef<HTMLIFrameElement>(null);
  // Scripts and same-origin together would take the sandbox apart, so measuring is only
  // ever offered to the frames that run nothing.
  const measured = autoHeight && !allowScripts;
  const height = useContentHeight(frame, current ? prepared.markup : undefined, measured);
  return <iframe ref={frame} title={title} className={className} aria-busy={!current}
    sandbox={allowScripts ? 'allow-scripts' : measured ? 'allow-same-origin' : ''}
    srcDoc={current ? prepared.markup : ''}
    style={height === undefined ? undefined : { height }} />;
}
