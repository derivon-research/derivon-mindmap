import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import { parseWorkspaceGraph, type WorkspaceGraph } from '../../workspace/index';
import type { GraphEvent, GraphObject, GraphView } from '../../rendering';
import './learning.css';

const GraphRenderer = lazy(async () => ({ default: (await import('../../rendering')).GraphRenderer }));

export function LearningMode({ workspace, targetIds }: LearningModeProps) {
  const [content, setContent] = useState<WorkspaceGraph>();
  const [failure, setFailure] = useState<string>();
  const [selected, setSelected] = useState<GraphObject | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(undefined);
    setFailure(undefined);
    setSelected(null);
    void workspace.source.readGraph().then((text) => {
      const graph = parseWorkspaceGraph(text);
      if (!cancelled) setContent(graph);
    }).catch((error: unknown) => {
      if (!cancelled) setFailure(String(error));
    });
    return () => { cancelled = true; };
  }, [workspace]);

  const view = useMemo<GraphView>(() => ({
    kind: 'overview',
    concepts: content?.points.map((point) => ({
      id: point.id, label: point.data.label, marks: targetIds.includes(point.id) ? ['target'] : [],
    })) ?? [],
    hyperedges: content?.hyperedges.map((edge) => ({
      id: edge.id, tails: edge.tails, head: edge.head, weight: edge.weight, marks: [],
    })) ?? [],
  }), [content, targetIds]);

  const handleEvent = (event: GraphEvent) => setSelected(event.object);
  const selectedLabel = selected?.kind === 'concept'
    ? content?.points.find((point) => point.id === selected.id)?.data.label
    : undefined;

  return (
    <section className="learning-graph" data-derivon-mode="learning"
      data-learning-targets={targetIds.join(' ')} aria-label="学习侧">
      <header className="learning-graph-header">
        <h1>全图</h1>
        <span>{view.concepts.length} 个概念</span>
        <output aria-label="Selected concept">{selectedLabel}</output>
      </header>
      <div className="learning-graph-canvas">
        {failure ? <p role="alert">{failure}</p> : !content ? <div role="status">正在载入…</div> : (
          <Suspense fallback={<div role="status">正在载入…</div>}>
            <GraphRenderer view={view} onEvent={handleEvent} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
