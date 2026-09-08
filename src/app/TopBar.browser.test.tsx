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
  hasTargets?: boolean;
  onEnterMode?: (mode: AppMode) => void;
  onEnterView?: (view: LearningView) => void;
} = {}) {
  const { modes = ['learning', 'authoring'], mode = 'learning', view = 'orientation', hasTargets = true,
    onEnterMode = vi.fn(), onEnterView = vi.fn() } = over;
  root = createRoot(container);
  act(() => root?.render(<TopBar workspaceName="工作区" modes={modes} mode={mode} onEnterMode={onEnterMode}
    learning={{ view, hasTargets, onEnterView }} />));
  return { onEnterMode, onEnterView };
}

it('keeps the learning views out of the mode control: they are places inside one mode', () => {
  render();
  const segmented = container.querySelector('[aria-label="模式"]')!;
  expect([...segmented.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['学习', '创作']);

  const views = container.querySelector('[aria-label="学习流程"]')!;
  expect(views.closest('[aria-label="模式"]')).toBeNull();
  expect([...views.querySelectorAll('button')].map((button) => button.textContent))
    .toEqual(['改目标 / 已知', '路线学习', '大图浏览']);
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

it('treats the confirmation screen as part of the route entry rather than a fourth place', () => {
  render({ view: 'preview' });
  const route = page.getByRole('button', { name: '路线学习' }).element();
  expect(route.getAttribute('aria-pressed')).toBe('true');
});

it('offers to re-read the route from inside it, instead of restarting where the learner already is', async () => {
  const { onEnterView } = render({ view: 'route' });
  await page.getByRole('button', { name: '再看一遍路线' }).click();
  expect(onEnterView).toHaveBeenLastCalledWith('preview');
});

it('will not offer a route before there is a target to route towards', () => {
  render({ hasTargets: false });
  expect((page.getByRole('button', { name: '路线学习' }).element() as HTMLButtonElement).disabled).toBe(true);
  // Browsing needs nothing settled, so it stays open.
  expect((page.getByRole('button', { name: '大图浏览' }).element() as HTMLButtonElement).disabled).toBe(false);
});
