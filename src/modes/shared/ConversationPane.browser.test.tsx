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
  readonly setModel = vi.fn(async () => {});
  readonly listModels = vi.fn(async () => [
    { providerId: 'anthropic', modelId: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { providerId: 'openai', modelId: 'gpt-5', label: 'GPT-5' },
  ] satisfies readonly ConversationModel[]);

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
      variant="learning"
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
  await page.getByRole('button', { name: 'Claude Sonnet 4.5' }).click();
  await page.getByRole('textbox', { name: '搜索模型' }).fill('gpt');
  await page.getByRole('button', { name: 'GPT-5' }).click();

  await expect.element(page.getByRole('button', { name: 'GPT-5' })).toBeVisible();
  expect(provider.setModel).toHaveBeenCalledWith(expect.objectContaining({
    providerId: 'openai',
    modelId: 'gpt-5',
  }));
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
