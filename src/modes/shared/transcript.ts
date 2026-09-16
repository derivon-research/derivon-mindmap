import type { ConversationEvent, ToolCallStatus } from '../../ports/ConversationProvider';

/**
 * One turn's assistant surface, as an ordered list of typed parts.
 *
 * Everything the panel shows comes from here, and this module is the only place that
 * knows how a turn grows: which part a delta lands in, which part a tool call updates,
 * where an error goes. The pane renders a part; it does not decide what a part is.
 *
 * See CONTEXT.md, 会话回合.
 */
export type TurnStatus = 'streaming' | 'done' | 'error' | 'stopped';

export type TurnRole = 'user' | 'assistant';

/** A part of one turn. A discriminated union, so a new kind is a new renderer, not a new branch. */
export type TranscriptPart =
  | { readonly id: string; readonly kind: 'text'; readonly text: string }
  | {
    readonly id: string;
    readonly kind: 'tool';
    readonly toolCallId: string;
    readonly name: string;
    readonly status: ToolPartStatus;
    /** Readable input, shown when the row is expanded. */
    readonly summary?: string;
    /** The result envelope's own text, verbatim. */
    readonly detail?: string;
  }
  | { readonly id: string; readonly kind: 'error'; readonly message: string };

/** A tool row's state. `running` is the only one that is not yet a `ToolCallStatus`. */
export type ToolPartStatus = 'running' | ToolCallStatus;

export type TranscriptTurn = {
  readonly id: string;
  readonly role: TurnRole;
  readonly status: TurnStatus;
  readonly parts: readonly TranscriptPart[];
};

export type Transcript = {
  /** Turns in arrival order: a user request then its assistant response, repeatedly. */
  readonly turns: readonly TranscriptTurn[];
  /**
   * The turn currently being written to, or nothing when none is.
   *
   * Only the end of a turn clears it — an `agent_settled`, or an abort. An intermediate
   * assistant message does not, because an agent that calls a tool between two messages
   * still has one turn on screen, and its later deltas belong to the same turn.
   */
  readonly activeTurnId?: string;
};

export const emptyTranscript: Transcript = { turns: [] };

/**
 * Open a turn: the user's request, then an empty streaming response.
 *
 * The turn ids are handed in, never made here; a part's id is derived from the turn it is in
 * and from the call it belongs to, so it is the same id every time that part is updated.
 * React keys come from them, so minting a new one on every update would remount a streaming
 * node and drop its expansion state, scroll position and focus — see #127.
 */
export function beginTurn(transcript: Transcript, turn: {
  readonly userId: string;
  readonly assistantId: string;
  readonly prompt: string;
}): Transcript {
  return {
    turns: [
      ...transcript.turns,
      textTurn({ id: turn.userId, role: 'user', status: 'done', text: turn.prompt }),
      { id: turn.assistantId, role: 'assistant', status: 'streaming', parts: [] },
    ],
    activeTurnId: turn.assistantId,
  };
}

/**
 * Append an already-finished turn without touching the active one.
 *
 * A quick question is answered from the graph's own documents, not by the model, so it
 * arrives whole and must not steal the turn a stream is in.
 */
export function appendTurn(transcript: Transcript, turn: {
  readonly id: string;
  readonly role: TurnRole;
  readonly text: string;
}): Transcript {
  return {
    turns: [...transcript.turns, textTurn({ ...turn, status: 'done' })],
    activeTurnId: transcript.activeTurnId,
  };
}

/**
 * Fold one port event into the transcript.
 *
 * An event with no active turn is ignored rather than opening one: the port is not
 * allowed to decide when a turn begins.
 */
export function applyEvent(transcript: Transcript, event: ConversationEvent): Transcript {
  const turn = activeTurn(transcript);
  if (!turn) return transcript;
  switch (event.kind) {
    case 'delta':
      return writeTurn(transcript, turn, {
        // A failed turn does not come back to life: a delta after an error would only repaint
        // the turn that has already said it failed. A `done` turn does resume streaming,
        // because an agent that calls a tool between two messages still has one turn.
        status: turn.status === 'error' ? 'error' : 'streaming',
        parts: withTailText(turn, event.text, 'append'),
      });
    case 'message':
      // A turn can hold several assistant messages, with tool calls between them, so this
      // marks the turn finished without ending it: a later delta belongs to the same turn.
      return writeTurn(transcript, turn, { status: 'done', parts: withTailText(turn, event.text, 'replace') });
    case 'tool-start':
      return writeTurn(transcript, turn, {
        parts: upsertTool(turn.parts, {
          toolCallId: event.toolCallId,
          name: event.name,
          status: 'running',
          ...(event.summary === undefined ? {} : { summary: event.summary }),
        }),
      });
    case 'tool-end':
      // A call whose start never arrived still gets a row, finished rather than lost.
      return writeTurn(transcript, turn, {
        parts: upsertTool(turn.parts, {
          toolCallId: event.toolCallId,
          name: event.name,
          status: event.status,
          ...(event.detail === undefined ? {} : { detail: event.detail }),
        }),
      });
    case 'error':
      // The turn keeps the text it already streamed; the failure is one more part of it.
      return writeTurn(transcript, turn, {
        status: 'error',
        parts: [...turn.parts, { id: `${turn.id}.${turn.parts.length}`, kind: 'error', message: event.message }],
      });
    case 'settled':
      return endTurn(transcript, turn, turn.status === 'streaming' ? 'done' : turn.status);
    default:
      // An event kind this module does not know changes nothing, rather than opening a turn.
      return transcript;
  }
}

/**
 * Stop the turn that is being written to, and end it.
 *
 * A stopped turn takes no further text: the provider may still report the turn it was
 * interrupted in, and that report must not reopen what the user just stopped.
 */
export function stopActiveTurn(transcript: Transcript): Transcript {
  const turn = activeTurn(transcript);
  if (!turn || turn.status !== 'streaming') return transcript;
  return endTurn(transcript, turn, 'stopped');
}

/**
 * The assistant turn that most recently stopped streaming, or nothing while one is running.
 *
 * A screen reader gets one announcement per turn rather than one per token, and this names the
 * turn due one: the id changes exactly when a turn finishes, so an announcement keyed on it
 * fires once instead of on every later render of the same turn.
 */
export function lastFinishedTurn(transcript: Transcript): TranscriptTurn | undefined {
  for (let index = transcript.turns.length - 1; index >= 0; index -= 1) {
    const turn = transcript.turns[index];
    if (turn.role === 'assistant' && turn.status !== 'streaming') return turn;
  }
  return undefined;
}

/**
 * What a finished turn says when it is announced as a whole.
 *
 * The same words the transcript shows — this is the one announcement that stands in for the
 * per-token ones, so leaving the prose out would leave it unspoken entirely. A turn that
 * failed or was interrupted says so too, because its status is not visible in the prose.
 */
export function turnAnnouncement(turn: TranscriptTurn): string {
  const text = turnText(turn);
  if (turn.status === 'error') {
    const failure = turn.parts.find((part) => part.kind === 'error');
    return [text, failure?.message].filter(Boolean).join(' ') || '回答失败。';
  }
  if (turn.status === 'stopped') return [text, '回答已停止。'].filter(Boolean).join(' ');
  return text;
}

function activeTurn(transcript: Transcript): TranscriptTurn | undefined {
  const id = transcript.activeTurnId;
  return id === undefined ? undefined : transcript.turns.find((turn) => turn.id === id);
}

/** A turn's prose, with its non-text parts left out. The question the panel was asked, and what it said. */
export function turnText(turn: TranscriptTurn): string {
  return turn.parts.map((part) => (part.kind === 'text' ? part.text : '')).join('');
}

function textTurn(turn: { readonly id: string; readonly role: TurnRole; readonly status: TurnStatus; readonly text: string }): TranscriptTurn {
  return { id: turn.id, role: turn.role, status: turn.status, parts: [{ id: `${turn.id}.0`, kind: 'text', text: turn.text }] };
}

/**
 * Create or update one tool row, keyed by the call's own id.
 *
 * The id is the row's identity in both senses: it is the React key that keeps the row's
 * expanded state across a stream, and it is what stops a second event for the same call
 * from becoming a second row.
 */
function upsertTool(parts: readonly TranscriptPart[], next: {
  readonly toolCallId: string;
  readonly name: string;
  readonly status: ToolPartStatus;
  readonly summary?: string;
  readonly detail?: string;
}): readonly TranscriptPart[] {
  const at = parts.findIndex((part) => part.kind === 'tool' && part.toolCallId === next.toolCallId);
  if (at < 0) return [...parts, { id: `tool:${next.toolCallId}`, kind: 'tool', ...next }];
  const existing = parts[at] as Extract<TranscriptPart, { kind: 'tool' }>;
  return [...parts.slice(0, at), { ...existing, ...next }, ...parts.slice(at + 1)];
}

/** Rewrite the turn, keeping the turn open. */
function writeTurn(transcript: Transcript, turn: TranscriptTurn, next: Partial<TranscriptTurn>): Transcript {
  return {
    turns: transcript.turns.map((candidate) => (candidate.id === turn.id ? { ...turn, ...next } : candidate)),
    activeTurnId: transcript.activeTurnId,
  };
}

/** Rewrite the turn as finished: nothing more is written to it. */
function endTurn(transcript: Transcript, turn: TranscriptTurn, status: TurnStatus): Transcript {
  return {
    turns: transcript.turns.map((candidate) => (candidate.id === turn.id ? { ...turn, status } : candidate)),
  };
}

/**
 * Write text at the end of the turn, when the end is text.
 *
 * A tool row ends the segment. The prose after one belongs to a later assistant message —
 * the same turn, but not the same paragraph — so it starts a text part of its own; folding
 * it back into the earlier part would render the second half of an answer above the call
 * that produced it.
 */
function withTailText(turn: TranscriptTurn, text: string, mode: 'append' | 'replace'): readonly TranscriptPart[] {
  const tail = turn.parts.at(-1);
  if (tail?.kind !== 'text') {
    return [...turn.parts, { id: `${turn.id}.${turn.parts.length}`, kind: 'text', text }];
  }
  const written = mode === 'append' ? tail.text + text : text;
  return [...turn.parts.slice(0, -1), { ...tail, text: written }];
}
