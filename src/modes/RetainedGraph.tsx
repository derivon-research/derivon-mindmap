import { lazy, Suspense, useLayoutEffect, useState } from 'react';
import type { GraphRendererProps, GraphView } from '../rendering';

const GraphRenderer = lazy(async () => ({ default: (await import('../rendering')).GraphRenderer }));

function sameTopology(left: GraphView, right: GraphView): boolean {
  if (left.kind !== right.kind || left.concepts.length !== right.concepts.length
    || left.hyperedges.length !== right.hyperedges.length) return false;
  const concepts = new Set(left.concepts.map(({ id }) => id));
  const edges = new Map(left.hyperedges.map((edge) => [edge.id, edge]));
  return right.concepts.every(({ id }) => concepts.has(id)) && right.hyperedges.every((edge) => {
    const previous = edges.get(edge.id);
    return previous?.head === edge.head && previous.tails.length === edge.tails.length
      && previous.tails.every((tail, index) => tail === edge.tails[index]);
  });
}

function MountedGraph({ onMount, ...props }: GraphRendererProps & { onMount: (mounted: boolean) => void }) {
  useLayoutEffect(() => { onMount(true); return () => onMount(false); }, [onMount]);
  return <GraphRenderer {...props} />;
}

/** Modes retain an unchanged viewport, but never feed hidden content updates to a renderer. */
export function RetainedGraph({ active, view, onEvent }: GraphRendererProps & { active: boolean }) {
  const [retained, setRetained] = useState<GraphView | null>(() => active ? view : null);
  const [mounted, setMounted] = useState(false);
  let displayed = retained;
  if (active) displayed = view;
  else if (!mounted || (retained && !sameTopology(retained, view))) displayed = null;
  if (displayed !== retained) setRetained(displayed);
  return displayed && <Suspense fallback={<span role="status">正在载入图…</span>}>
    <MountedGraph view={displayed} onEvent={onEvent} onMount={setMounted} />
  </Suspense>;
}
