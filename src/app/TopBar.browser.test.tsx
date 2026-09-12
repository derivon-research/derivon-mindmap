import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppMode, LearningView } from './host';
import { TopBar } from './TopBar';

let container: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); });
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.restoreAllMocks(); });

function render(over: {
  modes?: readonly AppMode[];
  mode?: AppMode;
  view?: LearningView;
  onEnterMode?: (mode: AppMode) => void;
  onEnterView?: (view: LearningView) => void;
} = {}) {
  const { modes = ['learning', 'authoring'], mode = 'learning', view = 'orientation',
    onEnterMode = vi.fn(), onEnterView = vi.fn() } = over;
  root = createRoot(container);
  act(() => root?.render(<TopBar workspaceName="工作区" modes={modes} mode={mode} onEnterMode={onEnterMode}
    learning={{ view, onEnterView }} />));
  return { onEnterMode, onEnterView };
}

it('keeps the learning views out of the mode control: they are places inside one mode', () => {
  render();
  const segmented = container.querySelector('[aria-label="模式"]')!;
  expect([...segmented.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['学习', '创作']);

  const views = container.querySelector('[aria-label="学习流程"]')!;
  expect(views.closest('[aria-label="模式"]')).toBeNull();
  expect([...views.querySelectorAll('button')].map((button) => button.textContent))
    .toEqual(['创建路线', '选择路线', '大图浏览']);
});

it('shows no mode control at all on a host that offers one mode, but still offers the views', () => {
  render({ modes: ['learning'] });
  expect(container.querySelector('[aria-label="模式"]')).toBeNull();
  expect(container.querySelector('[aria-label="学习流程"]')).not.toBeNull();
});

it('hides the learning views while the authoring side is up', () => {
  render({ mode: 'authoring' });
  expect(container.querySelector('[aria-label="学习流程"]')).toBeNull();
});

it('marks the view the learner is standing in, and only that one', async () => {
  render({ view: 'browse' });
  const pressed = [...container.querySelectorAll('[aria-label="学习流程"] button')]
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);
  expect(pressed).toEqual(['大图浏览']);
});

it('names an entry after the screen it opens, and keeps that name whatever is showing', async () => {
  const { onEnterView } = render({ view: 'route' });
  const route = page.getByRole('button', { name: '选择路线' }).element();
  expect(route.getAttribute('aria-pressed')).toBe('true');
  await page.getByRole('button', { name: '选择路线' }).click();
  expect(onEnterView).toHaveBeenLastCalledWith('route');
});

it('always opens creating a route from the entry that creates one', async () => {
  const { onEnterView } = render({ view: 'orientation' });
  const create = page.getByRole('button', { name: '创建路线' }).element();
  expect(create.getAttribute('aria-pressed')).toBe('true');
  await page.getByRole('button', { name: '创建路线' }).click();
  expect(onEnterView).toHaveBeenLastCalledWith('orientation');
});

it('never gates the route stage on a live target, because a confirmed route carries its own', () => {
  render({ view: 'orientation' });
  expect((page.getByRole('button', { name: '选择路线' }).element() as HTMLButtonElement).disabled).toBe(false);
  expect((page.getByRole('button', { name: '大图浏览' }).element() as HTMLButtonElement).disabled).toBe(false);
});
