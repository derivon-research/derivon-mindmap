import { Ban, Check, ChevronRight, LoaderCircle, OctagonAlert } from 'lucide-react';
import { lazy, Suspense } from 'react';
import type { ToolPartStatus, TranscriptPart } from './transcript';

/**
 * The Markdown and KaTeX pipeline, fetched when a finished answer needs it.
 *
 * A dynamic `import()` rather than a static one so the transcript's own module graph does not
 * carry it: #127 requires the panel not to drag the Markdown and formula implementation in,
 * and a static import here would make the panel the thing that carries it.
 */
const RichText = lazy(async () => ({ default: (await import('./RichText')).RichText }));

/**
 * How each tool state reads, and what marks it.
 *
 * `refused` is deliberately not red: a call the guard declined, or one the command surface
 * answered with `status: "diagnostics"`, is a normal outcome the model reads and retries.
 * Drawing it like a crash is the confusion #127 exists to remove.
 */
const TOOL_STATES: Record<ToolPartStatus, { readonly label: string; readonly Icon: typeof Check }> = {
  running: { label: '运行中', Icon: LoaderCircle },
  ok: { label: '完成', Icon: Check },
  refused: { label: '已拒绝', Icon: Ban },
  failed: { label: '失败', Icon: OctagonAlert },
};

/**
 * One part of one turn.
 *
 * A part is a discriminated union, so this is where a new kind becomes visible — and the
 * only place that has to change when one is added. What a part *is* is the transcript's
 * decision; how it looks is this module's.
 */
export function TurnPart({ part, complete }: {
  readonly part: TranscriptPart;
  /** See `partIsComplete`: false while this part is still being appended to. */
  readonly complete: boolean;
}) {
  if (part.kind === 'text') return <TextPart text={part.text} complete={complete} />;
  if (part.kind === 'error') return <div className="conversation-error" role="note">
    <span className="conversation-error-tag">错误</span>
    <p>{part.message}</p>
  </div>;
  return <ToolRow part={part} />;
}

/**
 * One stretch of prose.
 *
 * Streaming text stays plain. Re-parsing Markdown on every delta would re-render the whole
 * segment per token, and a half-written formula, table or code fence has no meaning to render
 * yet — so the renderer is asked for a segment only once nothing more is being appended to it.
 *
 * While that renderer is on its way the segment reads as plain text, which is the honest
 * loading state rather than a placeholder: it is exactly what those words looked like a moment
 * ago, so nothing shifts out from under the reader.
 */
function TextPart({ text, complete }: { readonly text: string; readonly complete: boolean }) {
  const plain = <p className="conversation-text">{text}</p>;
  if (!complete || !text.trim()) return plain;
  return <Suspense fallback={plain}><RichText markdown={text} /></Suspense>;
}

/**
 * A collapsible tool row.
 *
 * `<details>` rather than React state on purpose: expansion is DOM state, so it survives
 * every streaming re-render of the turn as long as the row's key — the call's own id —
 * does not change. A React `open` flag would either fight the user's clicks or need
 * lifting into the transcript, and #127 asks for stable identity instead.
 */
function ToolRow({ part }: { part: Extract<TranscriptPart, { kind: 'tool' }> }) {
  const { label, Icon } = TOOL_STATES[part.status];
  return <details className={`conversation-tool is-${part.status}`}>
    <summary>
      <ChevronRight size={13} className="conversation-tool-twisty" aria-hidden="true" />
      <Icon size={13} className="conversation-tool-icon" aria-hidden="true" />
      <span className="conversation-tool-name">{part.name}</span>
      {part.summary && <span className="conversation-tool-summary">{part.summary}</span>}
      <span className="conversation-tool-status">{label}</span>
    </summary>
    <div className="conversation-tool-body">
      {part.summary && <section><h6>输入</h6><pre>{part.summary}</pre></section>}
      {/* The envelope's own text, verbatim: the model reads `issues[].code` here, and so
          does whoever is checking what the Agent actually did. */}
      <section><h6>结果</h6><pre>{part.detail ?? '（没有输出）'}</pre></section>
    </div>
  </details>;
}
