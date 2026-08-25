import { useRef, useState, type ReactNode } from 'react';
import {
  Bold,
  Code2,
  Columns2,
  Eye,
  Heading1,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  PenLine,
  Quote,
  Strikethrough,
  Table,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DocumentFormat } from './domain';

type EditorMode = 'write' | 'split' | 'preview';

type DocumentEditorProps = {
  value: string;
  format: DocumentFormat;
  onChange: (value: string) => void;
  label: string;
};

type EditAction = {
  title: string;
  icon: ReactNode;
  prefix: string;
  suffix?: string;
  placeholder?: string;
  block?: boolean;
};

const markdownActions: EditAction[] = [
  { title: '一级标题', icon: <Heading1 size={16} />, prefix: '# ', placeholder: '标题', block: true },
  { title: '粗体', icon: <Bold size={16} />, prefix: '**', suffix: '**', placeholder: '粗体文本' },
  { title: '斜体', icon: <Italic size={16} />, prefix: '*', suffix: '*', placeholder: '斜体文本' },
  { title: '删除线', icon: <Strikethrough size={16} />, prefix: '~~', suffix: '~~', placeholder: '删除线文本' },
  { title: '链接', icon: <Link size={16} />, prefix: '[', suffix: '](https://)', placeholder: '链接文本' },
  { title: '行内代码', icon: <Code2 size={16} />, prefix: '`', suffix: '`', placeholder: '代码' },
  { title: '引用', icon: <Quote size={16} />, prefix: '> ', placeholder: '引用', block: true },
  { title: '无序列表', icon: <List size={16} />, prefix: '- ', placeholder: '列表项', block: true },
  { title: '有序列表', icon: <ListOrdered size={16} />, prefix: '1. ', placeholder: '列表项', block: true },
  { title: '表格', icon: <Table size={16} />, prefix: '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |', block: true },
  { title: '分隔线', icon: <Minus size={16} />, prefix: '---', block: true },
];

const htmlActions: EditAction[] = [
  { title: '一级标题', icon: <Heading1 size={16} />, prefix: '<h1>', suffix: '</h1>', placeholder: '标题' },
  { title: '粗体', icon: <Bold size={16} />, prefix: '<strong>', suffix: '</strong>', placeholder: '粗体文本' },
  { title: '斜体', icon: <Italic size={16} />, prefix: '<em>', suffix: '</em>', placeholder: '斜体文本' },
  { title: '删除线', icon: <Strikethrough size={16} />, prefix: '<del>', suffix: '</del>', placeholder: '删除线文本' },
  { title: '链接', icon: <Link size={16} />, prefix: '<a href="https://">', suffix: '</a>', placeholder: '链接文本' },
  { title: '行内代码', icon: <Code2 size={16} />, prefix: '<code>', suffix: '</code>', placeholder: '代码' },
  { title: '引用', icon: <Quote size={16} />, prefix: '<blockquote>', suffix: '</blockquote>', placeholder: '引用', block: true },
  { title: '无序列表', icon: <List size={16} />, prefix: '<ul>\n  <li>', suffix: '</li>\n</ul>', placeholder: '列表项', block: true },
  { title: '有序列表', icon: <ListOrdered size={16} />, prefix: '<ol>\n  <li>', suffix: '</li>\n</ol>', placeholder: '列表项', block: true },
  { title: '表格', icon: <Table size={16} />, prefix: '<table>\n  <thead><tr><th>列 1</th><th>列 2</th></tr></thead>\n  <tbody><tr><td>内容</td><td>内容</td></tr></tbody>\n</table>', block: true },
  { title: '分隔线', icon: <Minus size={16} />, prefix: '<hr>', block: true },
];

export function DocumentEditor({ value, format, onChange, label }: DocumentEditorProps) {
  const [mode, setMode] = useState<EditorMode>('split');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const actions = format === 'html' ? htmlActions : markdownActions;

  const apply = (action: EditAction) => {
    const element = textarea.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || action.placeholder || '';
    const lineStart = action.block && start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const lineEnd = action.block && end < value.length && value[end] !== '\n' ? '\n' : '';
    const replacement = `${lineStart}${action.prefix}${selected}${action.suffix ?? ''}${lineEnd}`;
    onChange(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
    const selectionStart = start + lineStart.length + action.prefix.length;
    window.requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(selectionStart, selectionStart + selected.length);
    });
  };

  return (
    <section className={`markdown-editor mode-${mode}`} aria-label={`${label} 文档编辑器`}>
      <header className="markdown-toolbar">
        <div className="markdown-actions" role="toolbar" aria-label={`${format === 'html' ? 'HTML' : 'Markdown'} 格式`}>
          {actions.map((action) => (
            <button type="button" key={action.title} title={action.title} aria-label={action.title} onClick={() => apply(action)}>
              {action.icon}
            </button>
          ))}
        </div>
        <div className="editor-mode" role="group" aria-label="编辑器视图">
          <button type="button" className={mode === 'write' ? 'is-active' : ''} title="编辑" aria-label="编辑" onClick={() => setMode('write')}><PenLine size={16} /></button>
          <button type="button" className={mode === 'split' ? 'is-active' : ''} title="分屏" aria-label="分屏" onClick={() => setMode('split')}><Columns2 size={16} /></button>
          <button type="button" className={mode === 'preview' ? 'is-active' : ''} title="预览" aria-label="预览" onClick={() => setMode('preview')}><Eye size={16} /></button>
        </div>
      </header>
      <div className="markdown-body">
        {mode !== 'preview' && (
          <textarea
            ref={textarea}
            aria-label={`${format === 'html' ? 'HTML' : 'Markdown'} 正文`}
            spellCheck={format === 'markdown'}
            wrap={format === 'html' ? 'off' : 'soft'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
        {mode !== 'write' && (format === 'markdown' ? (
          <article className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </article>
        ) : (
          <iframe
            className="html-preview"
            title={`${label} HTML 预览`}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            srcDoc={value}
          />
        ))}
      </div>
    </section>
  );
}
