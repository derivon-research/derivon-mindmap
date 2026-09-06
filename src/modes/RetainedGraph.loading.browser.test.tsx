import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { GraphView } from '../rendering';
import { RetainedGraph } from './RetainedGraph';

const load = vi.hoisted(() => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  return { pending, release, mounts: vi.fn() };
});
vi.mock('../rendering', async () => {
  await load.pending;
  return { GraphRenderer: () => { load.mounts(); return <div>Loaded graph</div>; } };
});

it('does not mount a lazy graph that finishes loading after its mode was hidden', async () => {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const view: GraphView = { kind: 'overview', concepts: [], hyperedges: [] };
  try {
    await act(async () => root.render(<RetainedGraph active view={view} onEvent={vi.fn()} />));
    expect(container.textContent).toContain('正在载入图');
    await act(async () => root.render(<RetainedGraph active={false} view={view} onEvent={vi.fn()} />));
    await act(async () => { load.release(); await import('../rendering'); });
    expect(load.mounts).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
    await act(async () => root.render(<RetainedGraph active view={view} onEvent={vi.fn()} />));
    await expect.poll(() => container.textContent).toBe('Loaded graph');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
