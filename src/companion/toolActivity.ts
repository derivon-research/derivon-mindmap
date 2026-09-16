import type { ToolCallStatus } from '../ports/ConversationProvider';
import { REFUSAL_PREFIX } from './guard';

/**
 * What one tool call looks like to the panel: a readable input line, and an ending.
 *
 * Pi hands the session `tool_execution_start` / `tool_execution_end` with arguments and a
 * result, and a result is not one thing: a granted script command answers inside its own
 * `derivon.command-result/v1` envelope, the guard refuses before anything runs, and a
 * genuine failure throws. Only the first two are ordinary — the model reads either and
 * retries — so telling them apart is this module's whole job, and the panel renders the
 * difference (#127).
 */

/** How much of an input or a result the collapsed line shows. The rest is in the expansion. */
const SUMMARY_LIMIT = 140;

/**
 * A readable one-line summary of a call's input.
 *
 * The shapes differ by tool and are not worth a table per tool: a shell names its command, a
 * graph query names its argv, and everything else is short scalar arguments. Whatever is
 * summarised is also what the expanded row shows in full, so a bad summary costs readability
 * and never information.
 */
export function summarizeToolInput(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const fields = args as Record<string, unknown>;
  // A shell call is its command; quoting it again would only make it harder to read.
  if (typeof fields.command === 'string' && fields.command.trim()) return truncate(fields.command);
  if (Array.isArray(fields.argv)) return truncate(fields.argv.map((word) => String(word)).join(' '));
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(typeof value === 'object' ? `${key}: {…}` : `${key}: ${String(value)}`);
  }
  return parts.length ? truncate(parts.join(' · ')) : undefined;
}

/**
 * How a call ended, and the result text the row expands to.
 *
 * A command surface refusal is a **successful** call: exit 1 with
 * `status: "diagnostics"`, because the model has to be able to read `issues[].code` and try
 * again. It is drawn as declined, not as a crash. A guard refusal is an error from Pi's side
 * — `isError` is true — and is recognised by the prefix the guard's own reason carries.
 */
export function classifyToolEnd(result: unknown, isError: boolean): {
  readonly status: ToolCallStatus;
  readonly detail?: string;
} {
  const detail = resultText(result);
  const withDetail = detail ? { detail } : {};
  if (!isError) {
    return envelopeStatus(result) === 'diagnostics'
      ? { status: 'refused', ...withDetail }
      : { status: 'ok', ...withDetail };
  }
  if (detail.startsWith(REFUSAL_PREFIX)) return { status: 'refused', ...withDetail };
  return { status: 'failed', ...withDetail };
}

/** The text a tool result carries: what Pi shows the model, and what the expanded row shows. */
export function resultText(result: unknown): string {
  if (typeof result !== 'object' || result === null) return typeof result === 'string' ? result : '';
  const content = (result as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type: 'text'; text: string } =>
      typeof part === 'object' && part !== null
      && (part as { type?: unknown }).type === 'text'
      && typeof (part as { text?: unknown }).text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

/** The command surface's own verdict, when the result carries an envelope. */
function envelopeStatus(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const details = (result as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return undefined;
  const status = (details as { status?: unknown }).status;
  return typeof status === 'string' ? status : undefined;
}

function truncate(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > SUMMARY_LIMIT ? `${single.slice(0, SUMMARY_LIMIT - 1)}…` : single;
}
