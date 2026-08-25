import { marked, type Token } from 'marked';

export const RAW_HTML_ATTRIBUTE = 'data-derivon-raw-html';

const RICH_HTML = /<(?:button|canvas|details|dialog|embed|figure|form|iframe|img|input|meter|object|picture|progress|select|textarea|video|audio|script|style|svg|[a-z][\w]*-[\w-]+)\b|\s(?:class|data-[\w-]+|id|on[\w-]+|style)\s*=/i;

export function encodeRawHtml(source: string): string {
  return encodeURIComponent(source);
}

export function decodeRawHtml(source: string): string {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

function rawHtmlWrapper(source: string): string {
  return `<div ${RAW_HTML_ATTRIBUTE}="${encodeRawHtml(source)}"></div>`;
}

function preserveTokenAsHtml(token: Token): boolean {
  if (token.type === 'html') return true;
  return token.type === 'paragraph' && RICH_HTML.test(token.raw);
}

function replaceToken(token: Token): string {
  if (!preserveTokenAsHtml(token)) return token.raw;
  const trailingWhitespace = token.raw.match(/\s*$/)?.[0] ?? '';
  const source = token.raw.slice(0, token.raw.length - trailingWhitespace.length);
  return `${rawHtmlWrapper(source)}${trailingWhitespace}`;
}

/**
 * Tiptap parses known HTML into its schema, which would discard unsupported
 * interactive elements. Wrap block HTML before parsing so RawHtmlBlock can
 * preserve the exact source and render it in an isolated node view.
 */
export function prepareMarkdownForEditor(markdown: string): string {
  if (!markdown.trim()) return markdown;
  if (/^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(markdown)) {
    return rawHtmlWrapper(markdown.trim());
  }
  return marked.lexer(markdown, { gfm: true }).map(replaceToken).join('');
}
