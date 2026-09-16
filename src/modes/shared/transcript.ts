import type { ConversationEvent } from '../../ports/ConversationProvider';

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
export type TranscriptPart = {
  readonly id: string;
  readonly kind: 'text';
  readonly text: string;
};

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
 * The ids are handed in, never made here. React keys come from them, so making a new one
 * on every update would remount a streaming node and drop its expansion state, scroll
 * position and focus — see #127.
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
      return writeTurn(transcript, turn, { status: 'streaming', parts: withTailText(turn, event.text, 'append') });
    case 'message':
      // A turn can hold several assistant messages, with tool calls between them, so this
      // marks the turn finished without ending it: a later delta belongs to the same turn.
      return writeTurn(transcript, turn, { status: 'done', parts: withTailText(turn, event.text, 'replace') });
    case 'error':
      return writeTurn(transcript, turn, { status: 'error', parts: withTailText(turn, event.message, 'replace') });
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

/** The turn a new conversation starts from: nothing carried over, including the active one. */
export function clearTranscript(): Transcript {
  return emptyTranscript;
}

export function activeTurn(transcript: Transcript): TranscriptTurn | undefined {
  const id = transcript.activeTurnId;
  return id === undefined ? undefined : transcript.turns.find((turn) => turn.id === id);
}

function textTurn(turn: { readonly id: string; readonly role: TurnRole; readonly status: TurnStatus; readonly text: string }): TranscriptTurn {
  return { id: turn.id, role: turn.role, status: turn.status, parts: [{ id: `${turn.id}.0`, kind: 'text', text: turn.text }] };
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
 * Write text into the turn's tail text part — the last one, not necessarily the last part,
 * because a tool row may have been appended after it.
 *
 * A turn with no text part yet gets one, numbered by the parts already there, so the id is
 * derived from the turn's own shape and stays the same across updates to the same part.
 */
function withTailText(turn: TranscriptTurn, text: string, mode: 'append' | 'replace'): readonly TranscriptPart[] {
  for (let index = turn.parts.length - 1; index >= 0; index -= 1) {
    const part = turn.parts[index];
    if (part.kind !== 'text') continue;
    const written = mode === 'append' ? part.text + text : text;
    return [...turn.parts.slice(0, index), { ...part, text: written }, ...turn.parts.slice(index + 1)];
  }
  return [...turn.parts, { id: `${turn.id}.${turn.parts.length}`, kind: 'text', text }];
}
