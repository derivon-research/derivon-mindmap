import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConversationEvent, ConversationModel, ConversationProvider, Notice } from '../../ports/ConversationProvider';
import { ConversationPane } from './ConversationPane';

let container: HTMLDivElement;
let root: Root | undefined;

/**
 * What the transcript says.
 *
 * Not a bare `getByText`: the announcer mirrors the finished turn for screen readers, so the
 * same words exist twice in the document by design.
 */
const transcriptText = () => container.querySelector('.conversation-transcript')?.textContent ?? '';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  localStorage.clear();
});

class FakeProvider implements ConversationProvider {
  readonly listeners = new Set<(event: ConversationEvent) => void>();
  readonly send = vi.fn(async () => {
    this.emit({ kind: 'delta', text: 'He' });
    this.emit({ kind: 'delta', text: 'llo' });
    this.emit({ kind: 'message', text: 'Hello' });
    this.emit({ kind: 'settled' });
  });
  readonly abort = vi.fn(async () => {
    this.emit({ kind: 'settled' });
  });
  readonly newConversation = vi.fn(async () => {});
  readonly setWorkspace = vi.fn(async () => {});
  readonly setModel = vi.fn(async (model: ConversationModel) => { this.selected = model; });
  notices: readonly Notice[] = [];
  readonly models: readonly ConversationModel[] = [
    { providerId: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    // No catalog name: the picker must show this one by its id.
    { providerId: 'openai', modelId: 'gpt-5-codex' },
  ];
  selected: ConversationModel | undefined = this.models[0];
  readonly listModels = vi.fn(async () => ({
    models: this.models,
    selected: this.selected,
    notices: this.notices,
  }));

  emit(event: ConversationEvent) {
    act(() => {
      for (const listener of this.listeners) listener(event);
    });
  }

  subscribe(listener: (event: ConversationEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

async function render(provider?: FakeProvider) {
  const value = provider ?? new FakeProvider();
  root = createRoot(container);
  await act(async () => root?.render(
    <ConversationPane
      provider={value}
      placeholder="卡在哪一步？说出来。"
      fallbackMessage="未连接模型。"
    />));
  return value;
}

it('streams a reply and marks the turn complete', async () => {
  const provider = await render();
  await page.getByRole('textbox', { name: 'Agent 消息' }).fill('这一步为什么成立？');
  await page.getByRole('button', { name: '发送消息' }).click();

  await expect.poll(transcriptText).toContain('Hello');
  expect(provider.send).toHaveBeenCalledWith('这一步为什么成立？');
});

it('lists and selects a model from the provider catalog', async () => {
  const provider = await render();
  await page.getByRole('button', { name: /Claude Sonnet 4\.5/ }).click();
  await page.getByRole('textbox', { name: '搜索模型' }).fill('codex');
  await page.getByRole('button', { name: 'gpt-5-codex' }).click();

  await expect.element(page.getByRole('button', { name: 'gpt-5-codex' })).toBeVisible();
  expect(provider.setModel).toHaveBeenCalledWith(expect.objectContaining({
    providerId: 'openai',
    modelId: 'gpt-5-codex',
  }));
});

it('shows a named model by name over id, and an unnamed one by id alone', async () => {
  await render();
  await page.getByRole('button', { name: /Claude Sonnet 4\.5/ }).click();

  const named = page.getByRole('button', { name: /Claude Sonnet 4\.5/ }).last();
  await expect.element(named).toHaveTextContent('Claude Sonnet 4.5');
  await expect.element(named).toHaveTextContent('claude-sonnet-4-5');

  // An unnamed model is not given a fabricated label; its id stands in the name's place.
  await expect.element(page.getByRole('button', { name: 'gpt-5-codex' })).toBeVisible();
});

it('starts a new conversation without keeping the old transcript', async () => {
  const provider = await render();
  await page.getByRole('textbox', { name: 'Agent 消息' }).fill('这一步为什么成立？');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect.poll(transcriptText).toContain('Hello');

  await page.getByRole('button', { name: '新对话' }).click();
  await expect.element(page.getByText('卡在哪一步？说出来。')).toBeVisible();
  expect(provider.newConversation).toHaveBeenCalledTimes(1);
});

/** What each configuration state is called where the operator reads it, in order. */
const noticeScopes = () => [...container.querySelectorAll('.conversation-notice-scope')]
  .map((element) => element.textContent);

/** #127: a configuration state is view state, not something you have to open a menu to find. */
it('shows why the catalog is the way it is without opening the model menu', async () => {
  const provider = new FakeProvider();
  provider.notices = [{ scope: 'models', text: '未找到 models.json：/tmp/derivon/models.json' }];
  await render(provider);

  await expect.element(page.getByText('未找到 models.json：/tmp/derivon/models.json')).toBeVisible();
  expect(noticeScopes()).toEqual(['模型']);
});

/** #121: the session's own configuration states travel on the same channel, each named. */
it('keeps each configuration state separable instead of joining them into one paragraph', async () => {
  const provider = new FakeProvider();
  provider.notices = [
    { scope: 'models', text: '未找到 models.json：/tmp/derivon/models.json' },
    { scope: 'command-surface', text: '没有发现命令面。' },
    { scope: 'extensions', text: '项目级扩展未加载：/work/graph 未受信任。' },
  ];
  await render(provider);

  await expect.element(page.getByText(/项目级扩展未加载：\/work\/graph/)).toBeVisible();
  // Three facts, three scopes: no single string was parsed back apart to draw this.
  expect(noticeScopes()).toEqual(['模型', '命令面', '扩展']);
});

it('reports a provider that rejects rather than silently emptying the picker', async () => {
  const provider = new FakeProvider();
  provider.listModels.mockRejectedValueOnce(new Error('Pi companion exited unexpectedly'));
  await render(provider);

  // The scope says which side of the process boundary went quiet.
  await expect.element(page.getByText('Pi companion exited unexpectedly')).toBeVisible();
  expect(noticeScopes()).toEqual(['会话']);
});

it('sends on Enter, leaves Shift+Enter to the textarea, and waits for the IME', async () => {
  const provider = await render();
  const composer = page.getByRole('textbox', { name: 'Agent 消息' });
  await composer.fill('第一行');

  /** Returns whether the pane took the key; an untaken key keeps its native behaviour. */
  const press = async (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    await act(async () => { composer.element().dispatchEvent(event); });
    return event.defaultPrevented;
  };

  // Mid-composition Enter belongs to the input method, not to sending.
  expect(await press({ isComposing: true } as KeyboardEventInit)).toBe(false);
  expect(provider.send).not.toHaveBeenCalled();

  // Shift+Enter stays with the textarea, which inserts the line break itself.
  expect(await press({ shiftKey: true })).toBe(false);
  expect(provider.send).not.toHaveBeenCalled();

  expect(await press({})).toBe(true);
  expect(provider.send).toHaveBeenCalledWith('第一行');
});

it('answers a quick question from the graph even when a model is connected', async () => {
  const provider = new FakeProvider();
  root = createRoot(container);
  await act(async () => root?.render(
    <ConversationPane
      provider={provider}
      placeholder="卡在哪一步？说出来。"
      fallbackMessage="未连接模型。"
      quickQuestions={[{ label: '这一步的前提是什么？', answer: '取自图上文档的答案。' }]}
    />));

  await page.getByRole('button', { name: '这一步的前提是什么？' }).click();

  // The answer is sourced from the workspace, so the model is not asked to regenerate it.
  await expect.poll(transcriptText).toContain('取自图上文档的答案。');
  expect(provider.send).not.toHaveBeenCalled();
});

/** Renders a pane whose turn is gated on a drain the test controls. */
async function renderWithDrain(provider: FakeProvider, drain: () => Promise<void>) {
  root = createRoot(container);
  await act(async () => root?.render(
    <ConversationPane
      provider={provider}
      placeholder="描述你想完成的修改…"
      fallbackMessage="未连接模型。"
      drainPendingChanges={drain}
    />));
}

it('drains pending changes before the turn reaches the provider', async () => {
  const provider = new FakeProvider();
  const order: string[] = [];
  provider.send.mockImplementation(async () => { order.push('send'); });
  let release!: () => void;
  const drain = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  await renderWithDrain(provider, drain);

  await page.getByRole('textbox', { name: 'Agent 消息' }).fill('这一步为什么成立？');
  await page.getByRole('button', { name: '发送消息' }).click();

  // The message is already in the transcript; what waits is the Agent being asked.
  await expect.element(page.getByText('这一步为什么成立？')).toBeVisible();
  expect(drain).toHaveBeenCalledTimes(1);
  expect(provider.send).not.toHaveBeenCalled();

  await act(async () => { release(); });
  await expect.poll(() => order).toEqual(['send']);
});

it('starts the turn even when the drain fails', async () => {
  const provider = new FakeProvider();
  await renderWithDrain(provider, async () => { throw new Error('保存失败'); });

  await page.getByRole('textbox', { name: 'Agent 消息' }).fill('照样开始');
  await page.getByRole('button', { name: '发送消息' }).click();

  // A failed drain adds no refusal path of its own: the save banner is the whole explanation.
  await expect.poll(transcriptText).toContain('Hello');
  expect(provider.send).toHaveBeenCalledWith('照样开始');
});

/** A turn whose conversation the test drives event by event. */
async function sendAwaitingEvents(provider: FakeProvider, prompt = '把这些加到图上') {
  root = createRoot(container);
  await act(async () => root?.render(
    <ConversationPane
      provider={provider}
      placeholder="卡在哪一步？说出来。"
      fallbackMessage="未连接模型。"
    />));
  await page.getByRole('textbox', { name: 'Agent 消息' }).fill(prompt);
  await page.getByRole('button', { name: '发送消息' }).click();
}

const toolRows = () => container.querySelectorAll('.conversation-tool');

it('holds one row per tool call and updates it in place', async () => {
  const provider = new FakeProvider();
  // The turn stays open: the call is what this test is about, not the reply.
  provider.send.mockImplementation(async () => {
    provider.emit({ kind: 'tool-start', toolCallId: 'call-1', name: 'add-concept', summary: 'name: 二次型' });
  });
  await sendAwaitingEvents(provider);

  expect(toolRows().length).toBe(1);
  expect(toolRows()[0].className).toContain('is-running');
  await expect.element(page.getByText('运行中')).toBeVisible();

  provider.emit({ kind: 'tool-end', toolCallId: 'call-1', name: 'add-concept', status: 'ok', detail: '{"status":"ok","issues":[]}' });

  // Same call, same row: a later event replaced it rather than stacking a second one.
  expect(toolRows().length).toBe(1);
  expect(toolRows()[0].className).toContain('is-ok');
  await expect.element(page.getByText('完成')).toBeVisible();
});

it('shows the call\'s input and the envelope verbatim once the row is expanded', async () => {
  const provider = new FakeProvider();
  provider.send.mockImplementation(async () => {
    // A nested argument is the payload of a command tool, so it crosses the port as itself.
    provider.emit({ kind: 'tool-start', toolCallId: 'call-1', name: 'write-document', summary: 'conceptId: c-1 · stdin: {"markdown":"# 二次型"}' });
    provider.emit({ kind: 'tool-end', toolCallId: 'call-1', name: 'write-document', status: 'ok', detail: '{"status":"ok","issues":[]}' });
  });
  await sendAwaitingEvents(provider);

  // Collapsed by default: the row is a line while it runs, and the detail is on demand.
  expect(toolRows()[0].querySelector('.conversation-tool-body')).not.toBeVisible();
  await page.getByText('write-document').click();
  await expect.poll(() => toolRows()[0].querySelector('.conversation-tool-body')!.textContent)
    .toContain('"markdown":"# 二次型"');
  await expect.poll(() => toolRows()[0].querySelector('.conversation-tool-body')!.textContent)
    .toContain('"status":"ok"');
});

/** #127: a diagnostics refusal is a declined call, not a crash. */
it('renders a declined call as declined, and keeps the prose the turn already streamed', async () => {
  const provider = new FakeProvider();
  provider.send.mockImplementation(async () => {
    provider.emit({ kind: 'delta', text: '我先试着改一下。' });
    provider.emit({ kind: 'tool-start', toolCallId: 'call-1', name: 'add-concept', summary: 'name: 二次型' });
    // The command surface answered `status: "diagnostics"`: a successful call that refused.
    provider.emit({ kind: 'tool-end', toolCallId: 'call-1', name: 'add-concept', status: 'refused', detail: '{"status":"diagnostics","issues":[{"code":"duplicate-name"}]}' });
    provider.emit({ kind: 'message', text: '这个名字已经有了，我没有改。' });
    provider.emit({ kind: 'settled' });
  });
  await sendAwaitingEvents(provider);

  expect(toolRows()[0].className).toContain('is-refused');
  expect(toolRows()[0].className).not.toContain('is-failed');
  await expect.element(page.getByText('已拒绝')).toBeVisible();
  // Nothing was drawn as an error, and the streamed prose is still there.
  expect(container.querySelectorAll('.conversation-error').length).toBe(0);
  await expect.poll(transcriptText).toContain('我先试着改一下。');
  await expect.poll(transcriptText).toContain('这个名字已经有了，我没有改。');
});

/** #127: the failure belongs to the turn and does not swallow what it already said. */
it('adds a failure as a part of the turn instead of replacing its prose', async () => {
  const provider = new FakeProvider();
  provider.send.mockImplementation(async () => {
    provider.emit({ kind: 'delta', text: '前半段已经流出来了。' });
    provider.emit({ kind: 'error', message: '模型返回错误' });
    provider.emit({ kind: 'settled' });
  });
  await sendAwaitingEvents(provider);

  expect(container.querySelectorAll('.conversation-error').length).toBe(1);
  await expect.poll(transcriptText).toContain('模型返回错误');
  await expect.poll(transcriptText).toContain('前半段已经流出来了。');
});

/** #127: streaming rewrites the trailing text in place; a remount would drop scroll and focus. */
it('rewrites the streaming text in place instead of adding a row per delta', async () => {
  const provider = new FakeProvider();
  provider.send.mockImplementation(async () => {
    provider.emit({ kind: 'delta', text: '第一段' });
  });
  await sendAwaitingEvents(provider);

  const textNodes = () => container.querySelectorAll('.conversation-assistant .conversation-text');
  expect(textNodes().length).toBe(1);
  const first = textNodes()[0];

  provider.emit({ kind: 'delta', text: '，第二段' });

  // The same node, holding more text — not a second paragraph and not a new turn.
  expect(textNodes().length).toBe(1);
  expect(textNodes()[0]).toBe(first);
  await expect.poll(() => first.textContent).toBe('第一段，第二段');
});

/** #127: streaming is silent, and the finished turn is announced once, from its own region. */
it('keeps the transcript silent and announces the finished turn once from a separate region', async () => {
  const provider = new FakeProvider();
  provider.send.mockImplementation(async () => {
    provider.emit({ kind: 'delta', text: '正在写' });
  });
  await sendAwaitingEvents(provider);

  const transcript = container.querySelector('.conversation-transcript')!;
  expect(transcript.getAttribute('role')).toBe('log');
  // `role="log"` on its own implies a polite live region, which would read every delta.
  expect(transcript.getAttribute('aria-live')).toBe('off');
  expect(transcript.querySelector('[aria-live]')).toBeNull();
  expect(transcript.querySelector('.conversation-assistant[role]')).toBeNull();

  // Nothing is said while the turn is still streaming.
  const announcer = container.querySelector('.conversation-announcer')!;
  expect(announcer.getAttribute('aria-live')).toBe('polite');
  expect(announcer.textContent).toBe('');

  provider.emit({ kind: 'settled' });
  await expect.poll(() => announcer.textContent).toBe('正在写');
});
