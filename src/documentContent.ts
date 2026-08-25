import { marked } from 'marked';
import TurndownService from 'turndown';
import type { DocumentFormat } from './domain';

const DEFAULT_STYLE = `
:root { color: #202422; background: #fff; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
body { max-width: 820px; margin: 0 auto; padding: 32px; line-height: 1.7; }
h1, h2, h3 { line-height: 1.3; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { overflow: auto; padding: 12px; background: #f4f5f2; }
blockquote { margin-left: 0; padding-left: 14px; border-left: 3px solid #799084; color: #5d6761; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 7px 9px; border: 1px solid #d5d8d3; text-align: left; }
img { max-width: 100%; }
button, input, select, textarea { font: inherit; }
`.trim();

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function htmlDocument(body: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
${DEFAULT_STYLE.split('\n').map((line) => `    ${line}`).join('\n')}
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function markdownToHtml(markdown: string, title: string): string {
  const body = marked.parse(markdown, { async: false, gfm: true }) as string;
  return htmlDocument(body.trim(), title);
}

export function htmlToMarkdown(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, style, template, noscript').forEach((element) => element.remove());
  const turndown = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  return `${turndown.turndown(parsed.body.innerHTML).trim()}\n`;
}

export function convertDocumentContent(
  content: string,
  from: DocumentFormat,
  to: DocumentFormat,
  title: string,
): string {
  if (from === to) return content;
  return to === 'html' ? markdownToHtml(content, title) : htmlToMarkdown(content);
}

export function conceptDocumentTemplate(label: string, format: DocumentFormat): string {
  const markdown = `# ${label || '新概念'}\n\n在这里记录概念定义、性质与示例。\n`;
  return format === 'html' ? markdownToHtml(markdown, label || '新概念') : markdown;
}

export function derivationDocumentTemplate(id: string, format: DocumentFormat): string {
  const markdown = `# 推导 ${id}\n\n## 问题引入\n\n在这里说明推导目标。\n\n## 推导过程\n\n在这里写下完整的推导步骤。\n`;
  return format === 'html' ? markdownToHtml(markdown, `推导 ${id}`) : markdown;
}
