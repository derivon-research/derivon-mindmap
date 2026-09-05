import { Graph } from '@antv/g6';
import { page } from 'vitest/browser';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TopBar } from '../app/TopBar';

let container: HTMLDivElement;
let root: Root | undefined;
let graph: Graph | undefined;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  try {
    if (root) await act(async () => root?.unmount());
    graph?.destroy();
  } finally {
    root = undefined;
    graph = undefined;
    container.remove();
    vi.unstubAllGlobals();
  }
});

it('mounts a module without the application and delivers a real browser click', async () => {
  const onEnterMode = vi.fn();
  root = createRoot(container);
  await act(async () => {
    root?.render(<TopBar workspaceName="Browser fixture" modes={['authoring', 'learning']}
      mode="authoring" onEnterMode={onEnterMode} />);
  });

  const buttons = page.getByRole('button');
  await expect.element(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await buttons.nth(1).click();
  expect(onEnterMode).toHaveBeenCalledExactlyOnceWith('learning');
});

it('mounts the single-mode top bar without a mode switch', async () => {
  root = createRoot(container);
  await act(async () => {
    root?.render(<TopBar workspaceName="Browser fixture" modes={['learning']}
      mode="learning" onEnterMode={vi.fn()} />);
  });

  expect(container.textContent).toContain('Browser fixture');
  expect(container.querySelector('button')).toBeNull();
});

it('renders real G6 pixels without the application or a mock renderer', async () => {
  container.style.width = '320px';
  container.style.height = '200px';
  graph = new Graph({
    container,
    width: 320,
    height: 200,
    animation: false,
    data: {
      nodes: [{ id: 'fixture', style: { x: 160, y: 100 } }],
    },
    node: { style: { size: 32, fill: '#168b72' } },
  });
  await graph.render();

  // G6 uses multiple canvases and paints asynchronously. Check actual node pixels.
  await expect.poll(() => [...container.querySelectorAll('canvas')].some((canvas) => {
    const context = canvas.getContext('2d');
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 22 && pixels[i + 1] === 139 && pixels[i + 2] === 114 && pixels[i + 3] > 0) {
        return true;
      }
    }
    return false;
  })).toBe(true);
});
