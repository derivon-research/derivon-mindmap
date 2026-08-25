import { describe, expect, it } from 'vitest';
import { markdownToHtml } from './documentContent';

describe('markdownToHtml', () => {
  it('renders inline and block KaTeX into the published HTML document', () => {
    const html = markdownToHtml(`Inline $E = mc^2$.

$$
\\int_0^1 x^2 \\, dx
$$`, 'Formula document');

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('katex@0.18.0/dist/katex.min.css');
    expect(html).not.toContain('$E = mc^2$');
  });
});
