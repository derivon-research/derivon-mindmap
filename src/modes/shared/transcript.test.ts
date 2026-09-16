import { describe, expect, it } from 'vitest';
import {
  appendTurn,
  applyEvent,
  beginTurn,
  clearTranscript,
  emptyTranscript,
  stopActiveTurn,
  turnText,
  type Transcript,
} from './transcript';

/** The ids the pane hands in; the module never makes its own, so keys stay stable. */
const ids = { userId: 'u1', assistantId: 'a1' } as const;

function started(prompt = '这一步为什么成立？'): Transcript {
  return beginTurn(emptyTranscript, { ...ids, prompt });
}

describe('beginTurn', () => {
  it('appends the user turn and a streaming assistant turn, and makes the assistant active', () => {
    const transcript = started();
    expect(transcript.turns.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(transcript.turns[0].parts).toEqual([{ id: 'u1.0', kind: 'text', text: '这一步为什么成立？' }]);
    expect(transcript.turns[1]).toMatchObject({ id: 'a1', status: 'streaming', parts: [] });
    expect(transcript.activeTurnId).toBe('a1');
  });

  it('leaves the turns already in the transcript alone', () => {
    const first = started();
    const second = beginTurn(appendTurn(first, { id: 'q1', role: 'user', text: '先问一句' }), {
      userId: 'u2',
      assistantId: 'a2',
      prompt: '再问一句',
    });
    expect(second.turns.map((turn) => turn.id)).toEqual(['u1', 'a1', 'q1', 'u2', 'a2']);
    expect(second.activeTurnId).toBe('a2');
  });
});

describe('applyEvent', () => {
  it('appends a delta to the active turn and keeps the text part id stable', () => {
    const first = applyEvent(started(), { kind: 'delta', text: '先' });
    const partId = first.turns[1].parts[0].id;
    const second = applyEvent(first, { kind: 'delta', text: '这样' });
    expect(second.turns[1].parts).toEqual([{ id: partId, kind: 'text', text: '先这样' }]);
    expect(second.turns[1].status).toBe('streaming');
  });

  it('replaces the streamed text with the settled message and marks the turn done', () => {
    const streamed = applyEvent(started(), { kind: 'delta', text: '先这样' });
    const settled = applyEvent(streamed, { kind: 'message', text: '完整的回答' });
    expect(settled.turns[1]).toMatchObject({ status: 'done' });
    expect(settled.turns[1].parts).toEqual([{ id: 'a1.0', kind: 'text', text: '完整的回答' }]);
  });

  it('marks the active turn failed on an error', () => {
    const failed = applyEvent(started(), { kind: 'error', message: '模型返回错误' });
    expect(failed.turns[1].status).toBe('error');
  });

  it('settles a streaming turn but leaves a stopped one stopped', () => {
    const stopped = stopActiveTurn(started());
    expect(applyEvent(stopped, { kind: 'settled' }).turns[1].status).toBe('stopped');
    expect(applyEvent(started(), { kind: 'settled' }).turns[1].status).toBe('done');
  });

  it('keeps the turn open across an assistant message, because a turn may hold several', () => {
    const settled = applyEvent(started(), { kind: 'message', text: '先看第一步。' });
    expect(settled.activeTurnId).toBe('a1');
    const continued = applyEvent(settled, { kind: 'delta', text: '再看第二步。' });
    expect(continued.turns[1].status).toBe('streaming');
    expect(turnText(continued.turns[1])).toBe('先看第一步。再看第二步。');
  });

  it('ends the turn on settled, so a late event is ignored', () => {
    const done = applyEvent(started(), { kind: 'settled' });
    expect(done.activeTurnId).toBeUndefined();
    expect(applyEvent(done, { kind: 'delta', text: 'x' })).toEqual(done);
  });

  it('ignores an event when no turn is active', () => {
    const idle: Transcript = { turns: [] };
    expect(applyEvent(idle, { kind: 'delta', text: 'x' })).toEqual(idle);
    expect(applyEvent(idle, { kind: 'message', text: 'x' })).toEqual(idle);
    expect(applyEvent(idle, { kind: 'error', message: 'x' })).toEqual(idle);
    expect(applyEvent(idle, { kind: 'settled' })).toEqual(idle);
  });

  it('changes only the active turn, leaving earlier turns identical by reference', () => {
    const transcript = started();
    const next = applyEvent(transcript, { kind: 'delta', text: 'x' });
    expect(next.turns[0]).toBe(transcript.turns[0]);
    expect(next.turns[1]).not.toBe(transcript.turns[1]);
  });
});

describe('stopActiveTurn', () => {
  it('marks the active turn stopped and ends it', () => {
    const stopped = stopActiveTurn(started());
    expect(stopped.turns[1].status).toBe('stopped');
    expect(stopped.activeTurnId).toBeUndefined();
  });

  it('takes no further text, so a late report cannot reopen what the user stopped', () => {
    const stopped = stopActiveTurn(started());
    expect(applyEvent(stopped, { kind: 'delta', text: 'x' })).toEqual(stopped);
    expect(applyEvent(stopped, { kind: 'message', text: 'x' })).toEqual(stopped);
    expect(applyEvent(stopped, { kind: 'settled' })).toEqual(stopped);
  });

  it('does nothing when no turn is active', () => {
    const idle: Transcript = { turns: [] };
    expect(stopActiveTurn(idle)).toEqual(idle);
  });
});

describe('appendTurn', () => {
  it('appends a finished turn without taking over the active one', () => {
    const transcript = appendTurn(started(), { id: 'q1', role: 'assistant', text: '图中的答案' });
    expect(transcript.turns[2]).toMatchObject({ id: 'q1', role: 'assistant', status: 'done' });
    expect(transcript.turns[2].parts).toEqual([{ id: 'q1.0', kind: 'text', text: '图中的答案' }]);
    expect(transcript.activeTurnId).toBe('a1');
  });
});

describe('clearTranscript', () => {
  it('returns a transcript with no turns and no active turn', () => {
    expect(clearTranscript()).toEqual({ turns: [] });
  });
});
describe('tool parts', () => {
  const start = (toolCallId: string, name = 'add-concept', summary?: string) =>
    ({ kind: 'tool-start', toolCallId, name, ...(summary === undefined ? {} : { summary }) }) as const;

  it('opens one running row per call', () => {
    const transcript = applyEvent(started(), start('call-1', 'add-concept', 'name: 二次型'));
    expect(transcript.turns[1].parts).toEqual([
      { id: 'tool:call-1', kind: 'tool', toolCallId: 'call-1', name: 'add-concept', status: 'running', summary: 'name: 二次型' },
    ]);
  });

  it('updates that row in place when the call ends, rather than stacking a second one', () => {
    const running = applyEvent(started(), start('call-1', 'add-concept', 'name: 二次型'));
    const done = applyEvent(running, {
      kind: 'tool-end',
      toolCallId: 'call-1',
      name: 'add-concept',
      status: 'ok',
      detail: '{"status":"ok"}',
    });
    expect(done.turns[1].parts).toHaveLength(1);
    expect(done.turns[1].parts[0]).toEqual({
      id: 'tool:call-1',
      kind: 'tool',
      toolCallId: 'call-1',
      name: 'add-concept',
      status: 'ok',
      summary: 'name: 二次型',
      detail: '{"status":"ok"}',
    });
  });

  it('keeps the call\'s own id as the part id, so an expanded row survives the stream', () => {
    const running = applyEvent(started(), start('call-1'));
    const done = applyEvent(running, { kind: 'tool-end', toolCallId: 'call-1', name: 'add-concept', status: 'ok' });
    expect(done.turns[1].parts[0].id).toBe(running.turns[1].parts[0].id);
  });

  it('gives a call whose start never arrived a row of its own, finished', () => {
    const transcript = applyEvent(started(), {
      kind: 'tool-end',
      toolCallId: 'call-9',
      name: 'bash',
      status: 'refused',
      detail: 'Refused: …',
    });
    expect(transcript.turns[1].parts).toEqual([
      { id: 'tool:call-9', kind: 'tool', toolCallId: 'call-9', name: 'bash', status: 'refused', detail: 'Refused: …' },
    ]);
  });

  it('does not fold two different calls into one row', () => {
    const transcript = applyEvent(applyEvent(started(), start('call-1')), start('call-2', 'bash'));
    expect(transcript.turns[1].parts.map((part) => part.id)).toEqual(['tool:call-1', 'tool:call-2']);
  });

  it('lets a refused call leave the turn status alone, because it is an ordinary outcome', () => {
    const refused = applyEvent(applyEvent(started(), start('call-1', 'bash')), {
      kind: 'tool-end',
      toolCallId: 'call-1',
      name: 'bash',
      status: 'refused',
    });
    expect(refused.turns[1].status).toBe('streaming');
  });

  it('starts a new text part after a tool row, so prose keeps its order', () => {
    const transcript = applyEvent(applyEvent(applyEvent(
      started(),
      { kind: 'delta', text: '先读一下。' },
    ), start('call-1')), { kind: 'delta', text: '读完了。' });
    expect(transcript.turns[1].parts).toEqual([
      { id: 'a1.0', kind: 'text', text: '先读一下。' },
      { id: 'tool:call-1', kind: 'tool', toolCallId: 'call-1', name: 'add-concept', status: 'running' },
      { id: 'a1.2', kind: 'text', text: '读完了。' },
    ]);
  });

  it('keeps streaming into the same text part while the tail is still text', () => {
    const transcript = applyEvent(applyEvent(
      started(),
      { kind: 'delta', text: '前半段。' },
    ), { kind: 'delta', text: '后半段。' });
    expect(transcript.turns[1].parts).toHaveLength(1);
    expect(transcript.turns[1].parts[0]).toMatchObject({ text: '前半段。后半段。' });
  });
});

describe('a failure as a part', () => {
  it('keeps the prose the turn already streamed', () => {
    const transcript = applyEvent(applyEvent(started(), { kind: 'delta', text: '前半段。' }), {
      kind: 'error',
      message: '模型返回错误',
    });
    expect(transcript.turns[1].status).toBe('error');
    expect(transcript.turns[1].parts).toEqual([
      { id: 'a1.0', kind: 'text', text: '前半段。' },
      { id: 'a1.1', kind: 'error', message: '模型返回错误' },
    ]);
  });
});
