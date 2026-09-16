import { MarkdownPreview } from '../../app/DocumentPreview';

/**
 * One finished answer segment, as Markdown with formulas.
 *
 * Reuses the object-document pipeline rather than growing a second one: `marked` plus
 * `marked-katex-extension`, rendered into a sandboxed frame. That is not only for the
 * formulas — an answer's Markdown may contain raw HTML, `marked` does not sanitise, and the
 * frame is what stops model output from reaching the application's own DOM. The frame runs
 * no scripts, so nothing in there can reach back out either.
 *
 * This module exists to be *imported on demand*. It is the only thing in the transcript that
 * needs the Markdown and KaTeX pipeline, and `TurnPart` reaches it through a dynamic import,
 * so mounting the panel does not pull that pipeline in — see #127.
 */
export function RichText({ markdown }: { markdown: string }) {
  return <MarkdownPreview
    title="Agent 回答"
    markdown={markdown}
    documentPath=""
    className="conversation-markdown"
    style={ANSWER_STYLE}
    autoHeight />;
}

/**
 * The sidebar's own rendering of an answer.
 *
 * A document is a page and wants a page's measure: an 820px column with 32px of margin. An
 * answer is one block in a narrow column beside the graph, so this drops the column, the
 * padding and the document heading scale, and takes the transcript's own text size.
 *
 * It is a whole stylesheet with literal colours rather than a patch on the page's, because
 * the frame is a separate document: the application's CSS variables and rules do not cross
 * the frame boundary. The values are the transcript's — ink, muted, line and accent from
 * `app.css` — repeated here because they have to be.
 */
const ANSWER_STYLE = `
:root { color: #24272d; background: transparent; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; padding: 0; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
p { margin: 0 0 8px; }
p:last-child { margin-bottom: 0; }
h1, h2, h3, h4, h5, h6 { margin: 10px 0 6px; font-size: 1em; font-weight: 600; line-height: 1.3; }
h1 { font-size: 1.15em; }
h2 { font-size: 1.08em; }
ul, ol { margin: 0 0 8px; padding-left: 1.4em; }
li + li { margin-top: 2px; }
a { color: #18705e; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; background: #f1f3f5; border-radius: 4px; padding: 1px 4px; }
pre { margin: 0 0 8px; overflow: auto; padding: 8px; background: #f4f5f2; border-radius: 6px; }
pre code { background: none; padding: 0; }
blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 2px solid #799084; color: #717782; }
table { width: 100%; border-collapse: collapse; font-size: .95em; }
th, td { padding: 4px 6px; border: 1px solid #e0e3e8; text-align: left; }
img { max-width: 100%; }
hr { margin: 10px 0; border: 0; border-top: 1px solid #e0e3e8; }
.katex-display { margin: 6px 0; padding: 2px 0; overflow-x: auto; overflow-y: hidden; }
`.trim();
