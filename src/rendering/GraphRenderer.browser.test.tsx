import { startTransition, StrictMode, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { createGeneratedRuntimeWorkspace } from '../../benchmarks/fixtures/generated-workspace';
import { createRoot, type Root } from 'react-dom/client';
import { commands, page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GraphRenderer, type GraphEvent, type GraphView } from './index';
import { findCanvasPixel as conceptPixel } from '../testing/canvasPixels';

declare module 'vitest/browser' {
  interface BrowserCommands {
    dragPointer(selector: string, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void>;
  }
}

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  await page.viewport(1000, 700);
  container = document.createElement('div');
  container.style.cssText = 'width:800px;height:500px';
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
});

const single: GraphView = {
  kind: 'overview',
  concepts: [{ id: 'same-id', label: 'A concept', marks: [] }],
  hyperedges: [],
};

it('paints a concept and emits selection and activation from real canvas input', async () => {
  const onEvent = vi.fn();
  flushSync(() => root.render(<GraphRenderer view={single} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel()).toBeDefined();
  const surface = page.getByRole('img', { name: 'Knowledge graph' });
  await surface.click({ position: conceptPixel()! });
  expect(onEvent).toHaveBeenCalledWith({ type: 'select', object: { kind: 'concept', id: 'same-id' } });
  await surface.dblClick({ position: conceptPixel()! });
  expect(onEvent).toHaveBeenCalledWith({ type: 'activate', object: { kind: 'concept', id: 'same-id' } });
});

it.each(['neighbourhood', 'route'] as const)('draws selectable derivations in %s, including an empty tail and colliding concept ID', async (kind) => {
  const onEvent = vi.fn();
  const view: GraphView = { ...single, kind, hyperedges: [
    { id: 'same-id', tails: [], head: 'same-id', weight: 2, marks: [] },
  ] };
  flushSync(() => root.render(<GraphRenderer view={view} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel({ color: [217, 119, 6] })).toBeDefined();
  await page.getByRole('img').click({ position: conceptPixel({ color: [217, 119, 6] })! });
  expect(onEvent).toHaveBeenCalledWith({ type: 'select', object: { kind: 'derivation', id: 'same-id' } });
});

it('diffs a complete model without moving existing nodes and uses the latest event callback', async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const route: GraphView = { ...single, kind: 'route' };
  flushSync(() => root.render(<GraphRenderer view={route} onEvent={first} />));
  await expect.poll(() => conceptPixel()).toBeDefined();
  const position = conceptPixel({ center: true })!;
  flushSync(() => root.render(<GraphRenderer view={{ ...route, concepts: [
    { id: 'same-id', label: 'Renamed', marks: ['known', 'target', 'selected'] },
  ] }} onEvent={latest} />));
  await expect.poll(() => conceptPixel({ color: [37, 99, 235] })).toBeDefined();
  await expect.poll(() => conceptPixel({ color: [147, 51, 234] })).toBeDefined();
  const updated = conceptPixel({ color: [37, 99, 235], center: true })!;
  expect(Math.abs(updated.x - position.x)).toBeLessThan(3);
  expect(Math.abs(updated.y - position.y)).toBeLessThan(3);
  await page.getByRole('img').click({ position: updated });
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith({ type: 'select', object: { kind: 'concept', id: 'same-id' } });
});

it('keeps route progress out of the overview while preserving deliberate marks', async () => {
  flushSync(() => root.render(<GraphRenderer view={{ ...single, concepts: [
    { ...single.concepts[0], marks: ['known', 'target', 'current', 'completed', 'selected'] },
  ] }} onEvent={vi.fn()} />));
  await expect.poll(() => conceptPixel({ color: [37, 99, 235] })).toBeDefined();
  expect(conceptPixel({ color: [217, 119, 6] })).toBeDefined();
  expect(conceptPixel({ color: [21, 128, 61] })).toBeUndefined();
  expect(conceptPixel({ color: [147, 51, 234] })).toBeUndefined();
});

it('does not expose inputs from an uncommitted concurrent render', async () => {
  const committed = vi.fn();
  const pending = vi.fn();
  let suspended = false;
  const never = new Promise<void>(() => {});
  function Suspend(): never { suspended = true; throw never; }
  flushSync(() => root.render(<Suspense fallback={null}>
    <GraphRenderer view={single} onEvent={committed} />
  </Suspense>));
  await expect.poll(() => conceptPixel()).toBeDefined();
  startTransition(() => root.render(<Suspense fallback={null}>
    <GraphRenderer view={{ ...single, concepts: [{ ...single.concepts[0], marks: ['known'] }] }} onEvent={pending} />
    <Suspend />
  </Suspense>));
  await expect.poll(() => suspended).toBe(true);
  await page.getByRole('img').click({ position: conceptPixel()! });
  expect(committed).toHaveBeenCalledWith({ type: 'select', object: { kind: 'concept', id: 'same-id' } });
  expect(pending).not.toHaveBeenCalled();
});

it('lays out replacement topology inside a retained view kind', async () => {
  const onEvent = vi.fn();
  const view: GraphView = { ...single, kind: 'route' };
  flushSync(() => root.render(<GraphRenderer view={view} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel()).toBeDefined();
  flushSync(() => root.render(<GraphRenderer view={{ kind: 'route', concepts: [
    { id: 'a', label: 'A', marks: [] }, { id: 'b', label: 'B', marks: ['known'] },
  ], hyperedges: [{ id: 'h', tails: ['a'], head: 'b', weight: 1, marks: [] }] }} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel({ color: [37, 99, 235] })).toBeDefined();
  await expect.poll(() => {
    const left = conceptPixel({ center: true });
    const right = conceptPixel({ color: [37, 99, 235], center: true });
    return left && right ? right.x - left.x : 0;
  }).toBeGreaterThan(180);
  await page.getByRole('img').click({ position: conceptPixel({ color: [37, 99, 235], center: true })! });
  expect(onEvent).toHaveBeenCalledWith({ type: 'select', object: { kind: 'concept', id: 'b' } });
});

it('keeps source and downstream hover highlights inside the overview across model updates', async () => {
  const onEvent = vi.fn();
  const view: GraphView = { kind: 'overview', concepts: [
    { id: 'a', label: 'Source', marks: [] },
    { id: 'b', label: 'Focus', marks: ['known'] },
    { id: 'c', label: 'Downstream', marks: [] },
  ], hyperedges: [
    { id: 'ab', tails: ['a'], head: 'b', weight: 1, marks: [] },
    { id: 'bc', tails: ['b'], head: 'c', weight: 1, marks: [] },
  ] };
  flushSync(() => root.render(<GraphRenderer view={view} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel({ color: [37, 99, 235] })).toBeDefined();
  const surface = page.getByRole('img');
  await surface.hover({ position: conceptPixel({ color: [37, 99, 235] })! });
  await expect.poll(() => conceptPixel({ color: [180, 83, 9] })).toBeDefined();
  await expect.poll(() => conceptPixel({ color: [3, 105, 161] })).toBeDefined();
  expect(onEvent).not.toHaveBeenCalled();
  flushSync(() => root.render(<GraphRenderer view={{ ...view, concepts: view.concepts.map((concept) =>
    concept.id === 'b' ? { ...concept, label: 'Updated focus', marks: ['known', 'target'] } : concept,
  ) }} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel({ color: [217, 119, 6] })).toBeDefined();
  expect(conceptPixel({ color: [180, 83, 9] })).toBeDefined();
  expect(conceptPixel({ color: [3, 105, 161] })).toBeDefined();
  await surface.hover({ position: { x: 2, y: 2 } });
  await expect.poll(() => conceptPixel({ color: [37, 99, 235] })).toBeDefined();
});

it('survives StrictMode mounting and keeps two instances independent', async () => {
  const left = vi.fn();
  const right = vi.fn();
  flushSync(() => root.render(<StrictMode><div style={{ display: 'flex', height: '100%' }}>
    <GraphRenderer view={single} onEvent={left} />
    <GraphRenderer view={single} onEvent={right} />
  </div></StrictMode>));
  const surfaces = page.getByRole('img');
  await expect.element(surfaces.nth(0)).toHaveAttribute('aria-busy', 'false');
  await expect.element(surfaces.nth(1)).toHaveAttribute('aria-busy', 'false');
  await surfaces.nth(0).click({ position: { x: 200, y: 250 } });
  expect(left).toHaveBeenCalledWith({ type: 'select', object: { kind: 'concept', id: 'same-id' } });
  expect(right).not.toHaveBeenCalled();
  await surfaces.nth(1).click({ position: { x: 200, y: 250 } });
  expect(right).toHaveBeenCalledWith({ type: 'select', object: { kind: 'concept', id: 'same-id' } });
});

it('replaces topology while hovered, removes empty views, and mounts another view kind', async () => {
  const onEvent = vi.fn();
  flushSync(() => root.render(<GraphRenderer view={single} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel()).toBeDefined();
  await page.getByRole('img').hover({ position: conceptPixel()! });
  flushSync(() => root.render(<GraphRenderer view={{ kind: 'overview', concepts: [], hyperedges: [] }} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel()).toBeUndefined();
  const replacement: GraphView = { kind: 'route', concepts: [
    { id: 'a', label: 'A long label that wraps within its knowledge card', marks: [] },
    { id: 'b', label: 'B', marks: ['known'] },
    { id: 'c', label: 'C', marks: ['completed'] },
  ], hyperedges: [
    { id: 'multi', tails: ['a', 'b'], head: 'c', weight: 3, marks: ['current'] },
    { id: 'parallel', tails: ['a', 'b'], head: 'c', weight: 4, marks: [] },
  ] };
  flushSync(() => root.render(<GraphRenderer view={replacement} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel({ color: [217, 119, 6] })).toBeDefined();
  await page.getByRole('img').click({ position: conceptPixel({ color: [217, 119, 6] })! });
  expect(onEvent.mock.lastCall?.[0].object.kind).toBe('derivation');
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('retargets a retained hyperedge when its previous endpoint is removed', async () => {
  const onEvent = vi.fn();
  const initial: GraphView = { kind: 'route', concepts: [
    { id: 'a', label: 'A', marks: [] }, { id: 'b', label: 'B', marks: ['known'] },
  ], hyperedges: [{ id: 'h', tails: ['a'], head: 'b', weight: 1, marks: [] }] };
  flushSync(() => root.render(<GraphRenderer view={initial} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel({ color: [37, 99, 235] })).toBeDefined();
  const next: GraphView = { ...initial, concepts: [initial.concepts[0], { id: 'c', label: 'C', marks: ['completed'] }],
    hyperedges: [{ ...initial.hyperedges[0], head: 'c' }],
  };
  flushSync(() => root.render(<GraphRenderer view={next} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel({ color: [21, 128, 61] })).toBeDefined();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await page.getByRole('img').click({ position: conceptPixel({ color: [21, 128, 61] })! });
  expect(onEvent).toHaveBeenCalledWith({ type: 'select', object: { kind: 'concept', id: 'c' } });
});

it('pans, zooms and resizes without emitting viewport events', async () => {
  const onEvent = vi.fn();
  flushSync(() => root.render(<GraphRenderer view={single} onEvent={onEvent} />));
  await expect.poll(() => conceptPixel()).toBeDefined();
  const surface = page.getByRole('img');
  const before = conceptPixel()!;
  await commands.dragPointer('[role="img"]', { x: 20, y: 20 }, { x: 80, y: 70 });
  await expect.poll(() => conceptPixel()?.x).toBeGreaterThan(before.x + 10);
  const panned = conceptPixel()!;
  await surface.wheel({ delta: { y: 100 } });
  await expect.poll(() => conceptPixel()?.x).not.toBe(panned.x);
  expect(onEvent).not.toHaveBeenCalled();
  container.style.width = '360px';
  container.style.height = '600px';
  await expect.poll(() => container.querySelector('canvas')?.getBoundingClientRect().width).toBe(360);
});

it.each([1, 2, 3])('opens the generated performance graph within 2.5s and selects within 200ms (run %i)', async () => {
  const size = Number(import.meta.env.VITE_PERF_SIZE ?? 1000);
  const fixture = createGeneratedRuntimeWorkspace(size);
  const view: GraphView = { kind: 'overview',
    concepts: fixture.workspace.manifest.graph.points.map((point) => ({ id: point.id, label: point.data.label, marks: [] })),
    hyperedges: fixture.workspace.manifest.graph.hyperedges.map((edge) => ({ ...edge, marks: [] })),
  };
  const samples: number[] = [];
  let started = 0;
  let hoverStarted = 0;
  container.addEventListener('pointermove', (event) => { hoverStarted = event.timeStamp; }, true);
  container.addEventListener('pointerdown', (event) => { started = event.timeStamp; }, true);
  const onEvent = vi.fn((event: GraphEvent) => {
    if (event.type !== 'select') return;
    requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - started)));
  });
  const opened = performance.now();
  flushSync(() => root.render(<GraphRenderer view={view} onEvent={onEvent} />));
  await expect.element(page.getByRole('img')).toHaveAttribute('aria-busy', 'false');
  const openMs = performance.now() - opened;
  expect(openMs).toBeLessThanOrEqual(2500);
  await expect.poll(() => conceptPixel()).toBeDefined();
  const position = conceptPixel()!;
  const surface = page.getByRole('img');
  await surface.hover({ position });
  await expect.poll(() => conceptPixel({ color: [3, 105, 161] }) ?? conceptPixel({ color: [180, 83, 9] }), { interval: 5 }).toBeDefined();
  await new Promise(requestAnimationFrame);
  const hoverInMs = performance.now() - hoverStarted;
  await surface.hover({ position: { x: 2, y: 2 } });
  await expect.poll(() => conceptPixel({ color: [3, 105, 161] }) ?? conceptPixel({ color: [180, 83, 9] }), { interval: 5 }).toBeUndefined();
  await new Promise(requestAnimationFrame);
  const hoverOutMs = performance.now() - hoverStarted;
  const hoverMs = [hoverInMs, hoverOutMs];
  for (let i = 0; i < 3; i++) {
    await page.getByRole('img').click({ position });
    await expect.poll(() => samples.length).toBe(i + 1);
  }
  console.info('Rendering performance', JSON.stringify({ concepts: size, openMs, hoverMs, selectionMs: samples }));
  expect(onEvent.mock.calls.every(([event]) => event.object?.kind === 'concept')).toBe(true);
  expect(Math.max(...samples)).toBeLessThanOrEqual(200);
  expect(Math.max(...hoverMs)).toBeLessThanOrEqual(200);
});
