import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LearningAgentPane } from './LearningAgentPane';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

const QUESTIONS = [
  { label: '「A」是什么来着？', answer: '第 1 步做出来的，靠的是 数域。' },
  { label: '展开写是什么样？', answer: '展开来是：\n$$\n\\dim(U + W) = \\dim U + \\dim W\n$$' },
];

async function render(onWideAnswer = vi.fn()) {
  root = createRoot(container);
  await act(async () => root?.render(
    <LearningAgentPane quickQuestions={QUESTIONS} onWideAnswer={onWideAnswer} />));
  return onWideAnswer;
}

it('says plainly that nothing is connected rather than pretending to answer', async () => {
  await render();
  await page.getByRole('textbox', { name: 'Agent 消息' }).fill('这一步为什么成立？');
  await page.getByRole('button', { name: '发送消息' }).click();

  await expect.element(page.getByText('未连接模型，没有生成任何讲解。')).toBeVisible();
  expect(container.textContent).toContain('错误');
});

it('leaves the panel alone for an answer that reads fine in a narrow column', async () => {
  const onWideAnswer = await render();
  await page.getByRole('button', { name: '「A」是什么来着？' }).click();

  await expect.element(page.getByText('第 1 步做出来的，靠的是 数域。')).toBeVisible();
  expect(onWideAnswer).not.toHaveBeenCalled();
});

it('asks the layout for width when an answer arrives with a formula on its own line', async () => {
  const onWideAnswer = await render();
  await page.getByRole('button', { name: '展开写是什么样？' }).click();

  expect(onWideAnswer).toHaveBeenCalledTimes(1);
});

it('throws the conversation away without touching anything outside it', async () => {
  await render();
  await page.getByRole('button', { name: '「A」是什么来着？' }).click();
  await expect.element(page.getByText('第 1 步做出来的，靠的是 数域。')).toBeVisible();

  await page.getByRole('button', { name: '新对话' }).click();
  await expect.element(page.getByText('卡在哪一步？说出来。')).toBeVisible();
});
