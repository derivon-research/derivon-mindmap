import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { Code2, Eye, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { decodeRawHtml, encodeRawHtml, RAW_HTML_ATTRIBUTE } from './editorMarkdown';

function RawHtmlView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const [editing, setEditing] = useState(false);
  const source = String(node.attrs.source ?? '');

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
          title="HTML 元素预览"
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          srcDoc={source}
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
