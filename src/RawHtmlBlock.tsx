import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { Code2, Eye, Trash2 } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { decodeRawHtml, encodeRawHtml, RAW_HTML_ATTRIBUTE } from './editorMarkdown';

const RAW_HTML_RESIZE_MESSAGE = 'derivon:raw-html-resize';
const INITIAL_PREVIEW_HEIGHT = 32;
const MAX_PREVIEW_HEIGHT = 100_000;

type RawHtmlResizeMessage = {
  type: typeof RAW_HTML_RESIZE_MESSAGE;
  previewId: string;
  height: number;
};

function previewBridge(previewId: string): string {
  return `<script>
(() => {
  const previewId = ${JSON.stringify(previewId)};
  let frame = 0;
  const measure = () => {
    frame = 0;
    const body = document.body;
    if (!body) return;
    const style = getComputedStyle(body);
    const marginTop = Number.parseFloat(style.marginTop) || 0;
    const marginBottom = Number.parseFloat(style.marginBottom) || 0;
    const bodyRect = body.getBoundingClientRect();
    let contentBottom = Math.max(body.scrollHeight, body.offsetHeight, bodyRect.height);
    for (const element of body.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      contentBottom = Math.max(contentBottom, rect.bottom - bodyRect.top);
    }
    parent.postMessage({
      type: '${RAW_HTML_RESIZE_MESSAGE}',
      previewId,
      height: Math.ceil(marginTop + contentBottom + marginBottom),
    }, '*');
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(document.documentElement);
  resizeObserver.observe(document.body);
  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  addEventListener('load', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
})();
</script>`;
}

export function rawHtmlPreviewDocument(source: string, previewId: string): string {
  const bridge = previewBridge(previewId);
  const closingBody = source.toLowerCase().lastIndexOf('</body>');
  if (closingBody < 0) return `${source}\n${bridge}`;
  return `${source.slice(0, closingBody)}${bridge}\n${source.slice(closingBody)}`;
}

function isResizeMessage(value: unknown): value is RawHtmlResizeMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<RawHtmlResizeMessage>;
  return message.type === RAW_HTML_RESIZE_MESSAGE
    && typeof message.previewId === 'string'
    && typeof message.height === 'number'
    && Number.isFinite(message.height);
}

function RawHtmlView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const [editing, setEditing] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(INITIAL_PREVIEW_HEIGHT);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewId = useId();
  const source = String(node.attrs.source ?? '');
  const previewDocument = useMemo(() => rawHtmlPreviewDocument(source, previewId), [previewId, source]);

  useLayoutEffect(() => {
    if (editing) return undefined;
    setPreviewHeight(INITIAL_PREVIEW_HEIGHT);
    const receiveHeight = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow || !isResizeMessage(event.data)) return;
      if (event.data.previewId !== previewId) return;
      const nextHeight = Math.max(1, Math.min(MAX_PREVIEW_HEIGHT, Math.ceil(event.data.height)));
      setPreviewHeight((current) => current === nextHeight ? current : nextHeight);
    };
    window.addEventListener('message', receiveHeight);
    return () => window.removeEventListener('message', receiveHeight);
  }, [editing, previewDocument, previewId]);

  return (
    <NodeViewWrapper className="raw-html-block" contentEditable={false}>
      <header>
        <span><Code2 size={15} />HTML 自定义组件</span>
        <div role="group" aria-label="HTML 元素视图">
          <button
            type="button"
            className={editing ? 'is-active' : ''}
            title="编辑 HTML 元素"
            aria-label="编辑 HTML 元素"
            onClick={() => setEditing(true)}
          >
            <Code2 size={15} />
          </button>
          <button
            type="button"
            className={!editing ? 'is-active' : ''}
            title="预览 HTML 元素"
            aria-label="预览 HTML 元素"
            onClick={() => setEditing(false)}
          >
            <Eye size={15} />
          </button>
          <button type="button" title="删除 HTML 元素" aria-label="删除 HTML 元素" onClick={deleteNode}>
            <Trash2 size={15} />
          </button>
        </div>
      </header>
      {editing ? (
        <textarea
          aria-label="HTML 元素源码"
          spellCheck={false}
          value={source}
          onChange={(event) => updateAttributes({ source: event.target.value })}
        />
      ) : (
        <iframe
          ref={frameRef}
          title="HTML 元素预览"
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          scrolling="no"
          style={{ height: `${previewHeight}px` }}
          srcDoc={previewDocument}
        />
      )}
    </NodeViewWrapper>
  );
}

export const RawHtmlBlock = Node.create({
  name: 'rawHtml',
  group: 'block',
  atom: true,
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      source: {
        default: '',
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{
      tag: `div[${RAW_HTML_ATTRIBUTE}]`,
      getAttrs: (element) => ({
        source: decodeRawHtml((element as HTMLElement).getAttribute(RAW_HTML_ATTRIBUTE) ?? ''),
      }),
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      [RAW_HTML_ATTRIBUTE]: encodeRawHtml(String(node.attrs.source ?? '')),
    })];
  },

  renderMarkdown(node) {
    return String(node.attrs?.source ?? '').trimEnd();
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawHtmlView);
  },
});
