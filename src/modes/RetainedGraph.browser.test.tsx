import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { commands, page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GraphView } from '../rendering';
import { findCanvasPixel } from '../testing/canvasPixels';
import { RetainedGraph } from './RetainedGraph';

let container: HTMLDivElement;
let root: Root;
const view: GraphView = { kind: 'overview', concepts: [{ id: 'a', label: 'A', marks: [] }], hyperedges: [] };
const onEvent = vi.fn();

beforeEach(() => {
  container = document.createElement('div');
  container.id = 'retained-graph-test';
  container.style.cssText = 'width:100%;height:440px';
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
});

function render(active: boolean, content = view) {
  flushSync(() => root.render(<div hidden={!active} style={{ width: '100%', height: '100%' }}>
    <RetainedGraph active={active} view={content} onEvent={onEvent} />
  </div>));
}

it.each([360, 1000])('preserves a panned unchanged viewport and invalidates hidden topology at %i px', async (width) => {
  await page.viewport(width, 700);
  render(true);
  await expect.element(page.getByRole('img')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => findCanvasPixel()).toBeDefined();
  const original = findCanvasPixel()!;
  const canvas = container.querySelector('canvas');
  await commands.dragPointer('#retained-graph-test [role="img"]', { x: 20, y: 20 }, { x: 80, y: 65 });
  await expect.poll(() => findCanvasPixel()?.x).not.toBe(original.x);
  const panned = findCanvasPixel()!;
  render(false);
  expect(container.querySelector('canvas')).toBe(canvas);
  render(true);
  await expect.poll(() => findCanvasPixel()).toEqual(panned);
  expect(container.querySelector('canvas')).toBe(canvas);

  const latest: GraphView = { ...view, concepts: [{ id: 'latest', label: 'Latest', marks: ['known'] }] };
  render(false, latest);
  await expect.poll(() => container.querySelector('canvas')).toBeNull();
  render(true, latest);
  await expect.element(page.getByRole('img')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => findCanvasPixel({ color: [37, 99, 235] })).toBeDefined();
  await page.getByRole('img').click({ position: findCanvasPixel({ color: [37, 99, 235] })! });
  expect(onEvent).toHaveBeenLastCalledWith({ type: 'select', object: { kind: 'concept', id: 'latest' } });
});
