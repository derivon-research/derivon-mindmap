import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConversationEvent, ConversationModel, ConversationProvider } from '../../ports/ConversationProvider';
import { ConversationPane } from './ConversationPane';

let container: HTMLDivElement;
let root: Root | undefined;

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
  diagnosis: string | undefined;
  readonly models: readonly ConversationModel[] = [
    { providerId: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    // No catalog name: the picker must show this one by its id.
    { providerId: 'openai', modelId: 'gpt-5-codex' },
  ];
  selected: ConversationModel | undefined = this.models[0];
  readonly listModels = vi.fn(async () => ({
    models: this.models,
    selected: this.selected,
    ...(this.diagnosis ? { diagnosis: this.diagnosis } : {}),
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
      mode="learning"
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

  await expect.element(page.getByText('Hello')).toBeVisible();
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
  await expect.element(page.getByText('Hello')).toBeVisible();

  await page.getByRole('button', { name: '新对话' }).click();
  await expect.element(page.getByText('卡在哪一步？说出来。')).toBeVisible();
  expect(provider.newConversation).toHaveBeenCalledTimes(1);
});

it('shows why the catalog is the way it is instead of only an empty list', async () => {
  const provider = new FakeProvider();
  provider.diagnosis = '未找到 models.json：/tmp/derivon/models.json';
  await render(provider);

  await page.getByRole('button', { name: /Claude Sonnet 4\.5/ }).click();
  await expect.element(page.getByText('未找到 models.json：/tmp/derivon/models.json')).toBeVisible();
});

it('reports a provider that rejects rather than silently emptying the picker', async () => {
  const provider = new FakeProvider();
  provider.listModels.mockRejectedValueOnce(new Error('Pi companion exited unexpectedly'));
  await render(provider);

  await page.getByRole('button', { name: '选择模型' }).click();
  await expect.element(page.getByText('Pi companion exited unexpectedly')).toBeVisible();
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
      mode="learning"
      provider={provider}
      placeholder="卡在哪一步？说出来。"
      fallbackMessage="未连接模型。"
      quickQuestions={[{ label: '这一步的前提是什么？', answer: '取自图上文档的答案。' }]}
    />));

  await page.getByRole('button', { name: '这一步的前提是什么？' }).click();

  // The answer is sourced from the workspace, so the model is not asked to regenerate it.
  await expect.element(page.getByText('取自图上文档的答案。')).toBeVisible();
  expect(provider.send).not.toHaveBeenCalled();
});

/** Renders a pane whose turn is gated on a drain the test controls. */
async function renderWithDrain(provider: FakeProvider, drain: () => Promise<void>) {
  root = createRoot(container);
  await act(async () => root?.render(
    <ConversationPane
      mode="authoring"
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
  await expect.element(page.getByText('Hello')).toBeVisible();
  expect(provider.send).toHaveBeenCalledWith('照样开始');
});
