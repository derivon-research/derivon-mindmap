import { describe, expect, it } from 'vitest';
import { encodeRawHtml, prepareMarkdownForEditor, RAW_HTML_ATTRIBUTE } from './editorMarkdown';

describe('prepareMarkdownForEditor', () => {
  it('preserves block HTML as an encoded raw HTML node', () => {
    const html = '<div class="widget">\n<button>Run</button>\n<script>run()</script>\n</div>';
    const prepared = prepareMarkdownForEditor(`# Title\n\n${html}\n\nAfter`);

    expect(prepared).toContain('# Title');
    expect(prepared).toContain(`${RAW_HTML_ATTRIBUTE}="${encodeRawHtml(html)}"`);
    expect(prepared).toContain('After');
    expect(prepared).not.toContain('<script>run()</script>');
  });

  it('keeps semantic inline HTML available to the normal Tiptap parser', () => {
    const markdown = 'Text <strong>bold</strong> after';
    expect(prepareMarkdownForEditor(markdown)).toBe(markdown);
  });

  it('preserves standalone interactive inline elements as HTML blocks', () => {
    const html = '<button type="button">Run</button>';
    expect(prepareMarkdownForEditor(html)).toContain(encodeRawHtml(html));
  });

  it('preserves styled inline HTML that the rich-text schema cannot represent', () => {
    const html = 'Before <span class="metric" data-value="42">42</span> after';
    expect(prepareMarkdownForEditor(html)).toContain(encodeRawHtml(html));
  });

  it('wraps a legacy complete HTML document as one raw block', () => {
    const html = '<!doctype html>\n<html><body><button>Run</button></body></html>';
    const prepared = prepareMarkdownForEditor(html);
    expect(prepared.match(new RegExp(RAW_HTML_ATTRIBUTE, 'g'))).toHaveLength(1);
    expect(prepared).toContain(encodeRawHtml(html));
  });
});
