import { Extension, InputRule, type Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { FileHandler } from '@tiptap/extension-file-handler';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import {
  Bold,
  Check,
  Code2,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Sigma,
  SquareFunction,
  Strikethrough,
  SquareCode,
  Table,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import 'katex/dist/katex.min.css';
import { createEditorImage, type EditorImageResolver } from './editorImage';
import { prepareMarkdownForEditor } from './editorMarkdown';
import { EditorSchemaGuard } from './editorSchemaGuard';
import { RawHtmlBlock } from './RawHtmlBlock';
import { TOUR_FEATURES, notifyTourAction, tourTarget } from './onboarding';

type DocumentEditorProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  resolveImage: EditorImageResolver;
  storeImage: (file: File) => Promise<{ source: string; alt: string }>;
  onImageError: (error: unknown) => void;
};

const HTML_WIDGET_TEMPLATE = `<!-- HTML 交互示例：这里的 HTML、CSS 和 JavaScript 都可以自由改写 -->
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #17231d; background: #f7faf7; font-family: Inter, system-ui, sans-serif; }
  .html-demo { min-height: 218px; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(150px, 0.75fr); gap: 20px; align-items: center; padding: 18px 22px; }
  .demo-badge { display: inline-flex; padding: 4px 7px; border: 1px solid #26785b; background: #e4f2eb; color: #18553f; font-size: 10px; font-weight: 800; }
  h2 { margin: 9px 0 4px; font-size: 19px; letter-spacing: 0; }
  p { margin: 0 0 14px; color: #5a6861; font-size: 12px; }
  label { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; font-weight: 700; }
  input { width: 100%; accent-color: #df624c; }
  .demo-stage { height: 150px; display: grid; place-items: center; border: 1px solid #cad4cd; background: #fff; overflow: hidden; }
  .demo-shape { width: 86px; height: 86px; display: grid; place-items: center; border: 7px solid #f1c44e; background: #287a85; color: #fff; font-size: 18px; font-weight: 850; transition: width 120ms ease, height 120ms ease, border-radius 120ms ease, background 120ms ease; }
  @media (max-width: 520px) { .html-demo { grid-template-columns: 1fr; padding: 14px; } .demo-stage { display: none; } }
</style>
<section class="html-demo">
  <div>
    <span class="demo-badge">HTML 交互示例</span>
    <h2>拖动滑块，改变图形</h2>
    <p>这里的 HTML、CSS 和 JavaScript 都可以自由改写。</p>
    <label for="demo-level">变化强度 <output id="demo-output">64</output>%</label>
    <input id="demo-level" aria-label="变化强度" type="range" min="0" max="100" value="64">
  </div>
  <div class="demo-stage" aria-hidden="true"><div class="demo-shape">64</div></div>
</section>
<script>
  const slider = document.querySelector('#demo-level');
  const output = document.querySelector('#demo-output');
  const shape = document.querySelector('.demo-shape');
  const render = () => {
    const value = Number(slider.value);
    output.value = String(value);
    shape.textContent = String(value);
    shape.style.width = String(58 + value * 0.72) + 'px';
    shape.style.height = String(58 + value * 0.72) + 'px';
    shape.style.borderRadius = String(value / 2) + '%';
    shape.style.background = value > 66 ? '#b74758' : value > 33 ? '#287a85' : '#315f9b';
  };
  slider.addEventListener('input', render);
  render();
</script>`;

type FormulaSelection = {
  kind: 'inline' | 'block';
  pos: number;
  latex: string;
};

type ImageSelection = {
  pos: number | null;
  source: string;
  alt: string;
};

const PASTED_IMAGE_TYPES = ['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];

function countMathNodes(document: Editor['state']['doc']): number {
  let count = 0;
  document.descendants((node) => {
    if (node.type.name === 'inlineMath' || node.type.name === 'blockMath') count += 1;
  });
  return count;
}

const TourEditorShortcuts = Extension.create({
  name: 'tourEditorShortcuts',
  priority: 1_000,
  addKeyboardShortcuts() {
    const run = (command: () => boolean, action: 'document-formatted' | 'editor-history-used') => {
      const applied = command();
      if (applied) notifyTourAction(action);
      return applied;
    };
    return {
      'Mod-b': () => run(() => this.editor.commands.toggleBold(), 'document-formatted'),
      'Mod-i': () => run(() => this.editor.commands.toggleItalic(), 'document-formatted'),
      'Mod-z': () => run(() => this.editor.commands.undo(), 'editor-history-used'),
      'Shift-Mod-z': () => run(() => this.editor.commands.redo(), 'editor-history-used'),
      'Mod-y': () => run(() => this.editor.commands.redo(), 'editor-history-used'),
    };
  },
});

const MarkdownInlineMath = InlineMath.extend({
  addInputRules() {
    return [new InputRule({
      find: /(?<!\$)\$([^$\n]+)\$$/,
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match[1].trim() }));
      },
    })];
  },
});

const MarkdownBlockMath = BlockMath.extend({
  addInputRules() {
    return [new InputRule({
      find: /^\$\$([^$\n]+)\$\$$/,
      handler: ({ state, range, match }) => {
        const { tr } = state;
        const $from = state.doc.resolve(range.from);
        const node = this.type.create({ latex: match[1].trim() });
        const consumesTextblock = $from.depth > 0
          && $from.parent.isTextblock
          && range.from === $from.start()
          && range.to === $from.end();
        const canReplaceTextblock = consumesTextblock
          && $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), this.type);
        if (!canReplaceTextblock) return;
        tr.replaceWith($from.before(), $from.after(), node);
      },
    })];
  },
});

function createExtensions(
  onEditMath: (formula: FormulaSelection) => void,
  resolveImage: EditorImageResolver,
  storeImage: DocumentEditorProps['storeImage'],
  onImageError: DocumentEditorProps['onImageError'],
) {
  return [
    EditorSchemaGuard,
    TourEditorShortcuts,
    StarterKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true } }),
    createEditorImage(resolveImage),
    FileHandler.configure({
      allowedMimeTypes: PASTED_IMAGE_TYPES,
      consumePasteEvent: true,
      onPaste: (editor, files) => {
        const initialPosition = editor.state.selection.from;
        void (async () => {
          let position = initialPosition;
          for (const file of files) {
            try {
              const stored = await storeImage(file);
              if (editor.isDestroyed) return;
              const maximumPosition = editor.state.doc.content.size;
              editor.chain()
                .focus()
                .setTextSelection(Math.min(position, maximumPosition))
                .setImage({ src: stored.source, alt: stored.alt })
                .run();
              position = editor.state.selection.to;
              notifyTourAction('document-formatted');
            } catch (error) {
              onImageError(error);
            }
          }
        })();
      },
    }),
    MarkdownInlineMath.configure({
      katexOptions: { displayMode: false, throwOnError: false, strict: false },
      onClick: (node, pos) => onEditMath({ kind: 'inline', pos, latex: String(node.attrs.latex ?? '') }),
    }),
    MarkdownBlockMath.configure({
      katexOptions: { displayMode: true, throwOnError: false, strict: false },
      onClick: (node, pos) => onEditMath({ kind: 'block', pos, latex: String(node.attrs.latex ?? '') }),
    }),
    RawHtmlBlock,
    Markdown.configure({ markedOptions: { gfm: true } }),
  ];
}

function EditorToolbar({ editor, onEditImage }: { editor: Editor; onEditImage: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      codeBlock: current.isActive('codeBlock'),
      image: current.isActive('image'),
      blockquote: current.isActive('blockquote'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      taskList: current.isActive('taskList'),
      heading: current.isActive('heading') ? Number(current.getAttributes('heading').level) : 0,
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const editLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt('链接地址', 'https://');
    if (href && href !== 'https://') {
      editor.chain().focus().setLink({ href }).run();
      notifyTourAction('document-formatted');
    }
  };
  const format = (command: () => void) => {
    command();
    notifyTourAction('document-formatted');
  };
  const useHistory = (command: () => boolean) => {
    if (command()) notifyTourAction('editor-history-used');
  };

  return (
    <header className="markdown-toolbar" {...tourTarget(TOUR_FEATURES.documentFormat)}>
      <div className="markdown-actions" role="toolbar" aria-label="Markdown 格式">
        <select
          aria-label="段落样式"
          title="段落样式"
          value={state.heading}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
            notifyTourAction('document-formatted');
          }}
        >
          <option value="0">正文</option>
          <option value="1">标题 1</option>
          <option value="2">标题 2</option>
          <option value="3">标题 3</option>
          <option value="4">标题 4</option>
          <option value="5">标题 5</option>
          <option value="6">标题 6</option>
        </select>
        <span className="toolbar-separator" />
        <button type="button" className={state.bold ? 'is-active' : ''} title="粗体 (Command / Ctrl + B)" aria-label="粗体" onClick={() => format(() => editor.chain().focus().toggleBold().run())}><Bold size={16} /></button>
        <button type="button" className={state.italic ? 'is-active' : ''} title="斜体 (Command / Ctrl + I)" aria-label="斜体" onClick={() => format(() => editor.chain().focus().toggleItalic().run())}><Italic size={16} /></button>
        <button type="button" className={state.strike ? 'is-active' : ''} title="删除线" aria-label="删除线" onClick={() => format(() => editor.chain().focus().toggleStrike().run())}><Strikethrough size={16} /></button>
        <button type="button" className={state.code ? 'is-active' : ''} title="行内代码" aria-label="行内代码" onClick={() => format(() => editor.chain().focus().toggleCode().run())}><Code2 size={16} /></button>
        <button type="button" className={state.codeBlock ? 'is-active' : ''} title="代码块" aria-label="代码块" onClick={() => format(() => editor.chain().focus().toggleCodeBlock().run())}><SquareCode size={16} /></button>
        <button type="button" title="链接" aria-label="链接" onClick={editLink}><Link size={16} /></button>
        <button type="button" className={state.image ? 'is-active' : ''} title={state.image ? '修改图片' : '插入图片'} aria-label={state.image ? '修改图片' : '插入图片'} onClick={onEditImage}><ImagePlus size={16} /></button>
        <span className="toolbar-separator" />
        <button type="button" className={state.blockquote ? 'is-active' : ''} title="引用" aria-label="引用" onClick={() => format(() => editor.chain().focus().toggleBlockquote().run())}><Quote size={16} /></button>
        <button type="button" className={state.bulletList ? 'is-active' : ''} title="无序列表" aria-label="无序列表" onClick={() => format(() => editor.chain().focus().toggleBulletList().run())}><List size={16} /></button>
        <button type="button" className={state.orderedList ? 'is-active' : ''} title="有序列表" aria-label="有序列表" onClick={() => format(() => editor.chain().focus().toggleOrderedList().run())}><ListOrdered size={16} /></button>
        <button type="button" className={state.taskList ? 'is-active' : ''} title="任务清单" aria-label="任务清单" onClick={() => format(() => editor.chain().focus().toggleTaskList().run())}><ListChecks size={16} /></button>
        <button type="button" title="分隔线" aria-label="分隔线" onClick={() => format(() => editor.chain().focus().setHorizontalRule().run())}><Minus size={16} /></button>
        <button type="button" title="插入表格" aria-label="插入表格" {...tourTarget(TOUR_FEATURES.insertTable)} onClick={() => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); notifyTourAction('table-inserted'); }}><Table size={16} /></button>
        <button type="button" title="插入行内公式 ($...$)" aria-label="插入行内公式" {...tourTarget(TOUR_FEATURES.insertFormula)} onClick={() => editor.chain().focus().insertInlineMath({ latex: 'E = mc^2' }).run()}><Sigma size={16} /></button>
        <button type="button" title="插入块级公式 ($$...$$)" aria-label="插入块级公式" {...tourTarget(TOUR_FEATURES.insertFormula)} onClick={() => editor.chain().focus().insertBlockMath({ latex: '\\int_0^1 x^2 \\, dx' }).run()}><SquareFunction size={16} /></button>
        <button
          type="button"
          title="插入 HTML 交互示例"
          aria-label="插入 HTML 交互示例"
          {...tourTarget(TOUR_FEATURES.insertHtml)}
          onClick={() => {
            editor.chain().focus().insertContent([
              { type: 'rawHtml', attrs: { source: HTML_WIDGET_TEMPLATE } },
              { type: 'paragraph' },
            ]).run();
            notifyTourAction('html-inserted');
          }}
        >
          <Code2 size={16} />
        </button>
      </div>
      <div className="editor-history" role="group" aria-label="编辑历史" {...tourTarget(TOUR_FEATURES.editorHistory)}>
        <button type="button" disabled={!state.canUndo} title="撤回" aria-label="编辑器撤回" onClick={() => useHistory(() => editor.chain().focus().undo().run())}><Undo2 size={16} /></button>
        <button type="button" disabled={!state.canRedo} title="重做" aria-label="编辑器重做" onClick={() => useHistory(() => editor.chain().focus().redo().run())}><Redo2 size={16} /></button>
      </div>
    </header>
  );
}

function FormulaSourceEditor({
  editor,
  formula,
  onChange,
  onClose,
}: {
  editor: Editor;
  formula: FormulaSelection;
  onChange: (formula: FormulaSelection) => void;
  onClose: () => void;
}) {
  const delimiter = formula.kind === 'inline' ? '$' : '$$';
  const updateLatex = (latex: string) => {
    onChange({ ...formula, latex });
    const chain = editor.chain().setNodeSelection(formula.pos);
    if (formula.kind === 'inline') chain.updateInlineMath({ latex }).run();
    else chain.updateBlockMath({ latex }).run();
  };
  const removeFormula = () => {
    const chain = editor.chain().setNodeSelection(formula.pos);
    if (formula.kind === 'inline') chain.deleteInlineMath().run();
    else chain.deleteBlockMath().run();
    onClose();
  };

  return (
    <div className="formula-source-editor" role="region" aria-label="KaTeX 公式编辑器">
      <span className="formula-kind">KaTeX</span>
      <code>{delimiter}</code>
      <input
        autoFocus
        aria-label={`${formula.kind === 'inline' ? '行内' : '块级'}公式源码`}
        spellCheck={false}
        value={formula.latex}
        onChange={(event) => updateLatex(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') onClose();
        }}
      />
      <code>{delimiter}</code>
      <button type="button" title="删除公式" aria-label="删除公式" onClick={removeFormula}><Trash2 size={15} /></button>
      <button type="button" title="关闭公式编辑" aria-label="关闭公式编辑" onClick={onClose}><X size={15} /></button>
    </div>
  );
}

function ImageSourceEditor({
  editor,
  image,
  onChange,
  onClose,
}: {
  editor: Editor;
  image: ImageSelection;
  onChange: (image: ImageSelection) => void;
  onClose: () => void;
}) {
  const applyImage = () => {
    const source = image.source.trim();
    if (!source) return;
    const attributes = { src: source, alt: image.alt.trim() || null };
    const selectedNode = image.pos === null ? null : editor.state.doc.nodeAt(image.pos);
    if (image.pos !== null && selectedNode?.type.name === 'image') {
      editor.chain().focus().setNodeSelection(image.pos).updateAttributes('image', attributes).run();
    } else {
      editor.chain().focus().setImage({ src: source, alt: attributes.alt ?? undefined }).run();
    }
    notifyTourAction('document-formatted');
    onClose();
  };
  const handleEscape = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onClose();
  };

  return (
    <form className="image-source-editor" aria-label="图片设置" onSubmit={(event) => { event.preventDefault(); applyImage(); }}>
      <span className="image-kind">IMAGE</span>
      <input
        autoFocus
        aria-label="图片地址"
        placeholder="HTTP(S) 或工作区相对路径"
        spellCheck={false}
        value={image.source}
        onChange={(event) => onChange({ ...image, source: event.target.value })}
        onKeyDown={handleEscape}
      />
      <input
        aria-label="图片替代文字"
        placeholder="替代文字"
        value={image.alt}
        onChange={(event) => onChange({ ...image, alt: event.target.value })}
        onKeyDown={handleEscape}
      />
      <button type="submit" disabled={!image.source.trim()} title="应用图片设置" aria-label="应用图片设置"><Check size={15} /></button>
      <button type="button" title="关闭图片设置" aria-label="关闭图片设置" onClick={onClose}><X size={15} /></button>
    </form>
  );
}

export function DocumentEditor({
  value,
  onChange,
  label,
  resolveImage,
  storeImage,
  onImageError,
}: DocumentEditorProps) {
  const onChangeRef = useRef(onChange);
  const lastEmittedValue = useRef(value);
  const [formula, setFormula] = useState<FormulaSelection | null>(null);
  const [image, setImage] = useState<ImageSelection | null>(null);
  const extensions = useMemo(() => createExtensions(
    (selection) => { setImage(null); setFormula(selection); },
    resolveImage,
    storeImage,
    onImageError,
  ), [onImageError, resolveImage, storeImage]);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions,
    content: prepareMarkdownForEditor(value),
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        'aria-label': 'Markdown 正文',
        'data-tour-feature': TOUR_FEATURES.documentBody.id,
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      const markdown = current.getMarkdown();
      lastEmittedValue.current = markdown;
      onChangeRef.current(markdown);
      if (countMathNodes(current.state.doc) > countMathNodes(transaction.before)) {
        notifyTourAction('formula-inserted');
      }
    },
  });

  const openImageSettings = () => {
    if (!editor) return;
    const selected = editor.isActive('image');
    const attributes = selected ? editor.getAttributes('image') : {};
    setFormula(null);
    setImage({
      pos: selected ? editor.state.selection.from : null,
      source: String(attributes.src ?? ''),
      alt: String(attributes.alt ?? ''),
    });
  };

  useEffect(() => {
    if (!editor || value === lastEmittedValue.current) return;
    setFormula(null);
    setImage(null);
    if (editor.getMarkdown() !== value) {
      editor.commands.setContent(prepareMarkdownForEditor(value), {
        contentType: 'markdown',
        emitUpdate: false,
      });
    }
    lastEmittedValue.current = value;
  }, [editor, value]);

  return (
    <section className={`markdown-editor ${formula ? 'has-source-editor has-formula-editor' : ''} ${image ? 'has-source-editor has-image-editor' : ''}`} aria-label={`${label} 文档编辑器`}>
      {editor && <EditorToolbar editor={editor} onEditImage={openImageSettings} />}
      {editor && formula && (
        <FormulaSourceEditor editor={editor} formula={formula} onChange={setFormula} onClose={() => setFormula(null)} />
      )}
      {editor && image && (
        <ImageSourceEditor editor={editor} image={image} onChange={setImage} onClose={() => setImage(null)} />
      )}
      <div className="tiptap-editor-body">
        <EditorContent editor={editor} />
      </div>
    </section>
  );
}
