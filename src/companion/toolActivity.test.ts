import { describe, expect, it } from 'vitest';
import { REFUSAL_PREFIX } from './guard';
import { classifyToolEnd, resultText, summarizeToolInput } from './toolActivity';

/** The result shape Pi hands `tool_execution_end`: what a tool's `execute` returned. */
const result = (text: string, details?: unknown) => ({
  content: [{ type: 'text', text }],
  details: details ?? {},
});

describe('summarizeToolInput', () => {
  it('reads a shell call as its command', () => {
    expect(summarizeToolInput({ command: 'rg -n "二次型" objects/' })).toBe('rg -n "二次型" objects/');
  });

  it('reads a graph query as its argv', () => {
    expect(summarizeToolInput({ argv: ['closure', '--target', 'c-1'] })).toBe('closure --target c-1');
  });

  it('reads a command tool as its scalar arguments', () => {
    expect(summarizeToolInput({ name: '二次型', conceptId: 'c-k7f3q2' })).toBe('name: 二次型 · conceptId: c-k7f3q2');
  });

  it('shows a nested argument as its JSON, because for a command tool it is the payload', () => {
    expect(summarizeToolInput({ conceptId: 'c-1', stdin: { markdown: '# x' } }))
      .toBe('conceptId: c-1 · stdin: {"markdown":"# x"}');
  });

  it('says nothing when there is nothing worth saying', () => {
    expect(summarizeToolInput({})).toBeUndefined();
    expect(summarizeToolInput({ name: '' })).toBeUndefined();
    expect(summarizeToolInput(null)).toBeUndefined();
    expect(summarizeToolInput('a string')).toBeUndefined();
  });

  it('keeps one line, and bounds only what is pathological', () => {
    const summary = summarizeToolInput({ command: `echo ${'x'.repeat(400)}` })!;
    expect(summary).not.toContain('\n');
    // A short call is not truncated: CSS truncates the collapsed line, and the expanded
    // row has to show what was actually sent.
    expect(summary.endsWith('…')).toBe(false);
    expect(summary).toContain('x'.repeat(400));

    const huge = summarizeToolInput({ stdin: { markdown: 'y'.repeat(30_000) } })!;
    expect(huge.length).toBeLessThanOrEqual(20_000);
    expect(huge.endsWith('…')).toBe(true);
  });
});

describe('classifyToolEnd', () => {
  /** #127: the command surface's own refusal is a successful call, and is drawn as declined. */
  it('reads a diagnostics envelope as a declined call, not a failure', () => {
    // The content is the command's whole stdout, which is how the model reads issues[].code.
    const envelope = '{"status":"diagnostics","issues":[{"code":"duplicate-name"}]}';
    const ended = classifyToolEnd(result(envelope, { status: 'diagnostics' }), false);
    expect(ended.status).toBe('refused');
    expect(ended.detail).toContain('duplicate-name');
  });

  it('reads a clean envelope as a completed call', () => {
    expect(classifyToolEnd(result('{"status":"ok"}', { status: 'ok', issues: [] }), false).status).toBe('ok');
  });

  it('reads the guard\'s refusal as declined, even though Pi reports it as an error', () => {
    const ended = classifyToolEnd(result(`${REFUSAL_PREFIX}writing a.md would change the workspace`), true);
    expect(ended.status).toBe('refused');
    expect(ended.detail).toContain('would change the workspace');
  });

  it('reads anything else that threw as a failure', () => {
    expect(classifyToolEnd(result('The add-concept command did not return an envelope'), true).status).toBe('failed');
  });

  it('carries the result text verbatim, so the expanded row shows what the model read', () => {
    const envelope = '{"status":"diagnostics","issues":[{"code":"duplicate-name"}]}';
    expect(classifyToolEnd(result(envelope, { status: 'diagnostics' }), false).detail).toBe(envelope);
  });

  it('leaves the detail out when the result said nothing', () => {
    expect(classifyToolEnd({ content: [], details: {} }, true)).toEqual({ status: 'failed' });
  });
});

describe('resultText', () => {
  it('joins a result\'s text parts', () => {
    expect(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'x' }, { type: 'text', text: 'b' }] }))
      .toBe('ab');
  });

  it('reads a bare string result', () => {
    expect(resultText('直接是文本')).toBe('直接是文本');
    expect(resultText({ content: '也是文本' })).toBe('也是文本');
  });

  it('says nothing about a result it cannot read', () => {
    expect(resultText(undefined)).toBe('');
    expect(resultText(42)).toBe('');
    expect(resultText({ content: 42 })).toBe('');
    expect(resultText({ content: [{ type: 'image', data: 'x' }] })).toBe('');
  });
});
