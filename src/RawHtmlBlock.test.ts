import { describe, expect, it } from 'vitest';
import { rawHtmlPreviewDocument } from './RawHtmlBlock';

describe('rawHtmlPreviewDocument', () => {
  it('adds the resize bridge without changing the authored component', () => {
    const source = '<section><button>Run</button></section>';
    const preview = rawHtmlPreviewDocument(source, 'preview-1');

    expect(preview).toContain(source);
    expect(preview).toContain("type: 'derivon:raw-html-resize'");
    expect(preview).toContain('preview-1');
    expect(preview).toContain('new ResizeObserver(schedule)');
  });

  it('places the bridge inside a complete HTML document body', () => {
    const preview = rawHtmlPreviewDocument(
      '<!doctype html><html><head><title>Demo</title></head><body><main>Content</main></body></html>',
      'complete-document',
    );

    expect(preview.indexOf('derivon:raw-html-resize')).toBeLessThan(preview.indexOf('</body>'));
    expect(preview).toContain('</body></html>');
  });
});
