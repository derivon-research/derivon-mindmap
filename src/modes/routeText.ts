/**
 * The sentences both modes use to describe a route and its steps, so a route reads the same in
 * the editor, the authoring route list and the learning shelf.
 */
import type { RouteReading, WorkspaceGraph } from '../workspace/index';
import { labelOf } from './ConceptPicker';

/**
 * "3 步 · 成本 4.5 · 现算": how many steps, what they cost, and whether the order is written.
 * Both numbers are the reading's — steps the graph has, each counted once — so a route with a
 * dangling or repeated entry shows the same count everywhere.
 */
export function routeTally(reading: RouteReading): string {
  return `${reading.order.length} 步 · 成本 ${reading.cost} · ${reading.orderSource === 'written' ? '已写定' : '现算'}`;
}

/** "需要 A + B", or "不需要前提": what a derivation needs, the reason a step sits where it does. */
export function premisesText(graph: WorkspaceGraph, premises: readonly string[]): string {
  return premises.length ? `需要 ${premises.map((id) => labelOf(graph, id)).join(' + ')}` : '不需要前提';
}
