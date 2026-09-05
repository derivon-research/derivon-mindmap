import { FileText, Network, X } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { DocumentPreview } from '../../app/DocumentPreview';
import type { LearningModeProps } from '../../app/host';
import type { GraphEvent, GraphView } from '../../rendering';
import { objectDocumentPreview, type TextResource } from '../../workspace/index';
import './learning.css';

const GraphRenderer = lazy(async () => ({ default: (await import('../../rendering')).GraphRenderer }));

export function LearningMode({ workspace, content, targetIds, onChangeTargets, readAsset }: LearningModeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => targetIds[0] ?? null);
  const selected = selectedId ? content.graph.points.find((point) => point.id === selectedId) : undefined;
  const view = useMemo<GraphView>(() => ({
    kind: 'overview',
    concepts: content.graph.points.map((point) => ({ id: point.id, label: point.data.label,
      marks: [...(targetIds.includes(point.id) ? ['target' as const] : []), ...(point.id === selectedId ? ['selected' as const] : [])] })),
    hyperedges: content.graph.hyperedges.map((edge) => ({ ...edge, marks: [] })),
  }), [content.graph, selectedId, targetIds]);
  const handleEvent = (event: GraphEvent) => {
    if (event.object === null) setSelectedId(null);
    else if (event.object.kind === 'concept') setSelectedId(event.object.id);
  };
  const toggleTarget = () => {
    if (!selected) return;
    onChangeTargets(targetIds.includes(selected.id) ? targetIds.filter((id) => id !== selected.id) : [...targetIds, selected.id]);
  };

  return <section className="learning-workbench" data-derivon-mode="learning" data-learning-targets={targetIds.join(' ')} aria-label="学习侧">
    <header className="learning-header"><div><Network aria-hidden="true" /><h1>{workspace.name}</h1><span>{view.concepts.length} 个概念</span></div>
      {selected && <div className="learning-selection"><output aria-label="Selected concept">{selected.data.label}</output><button type="button" aria-pressed={targetIds.includes(selected.id)} onClick={toggleTarget}>{targetIds.includes(selected.id) ? '取消目标' : '设为目标'}</button><button type="button" className="learning-icon-button" title="关闭文档" onClick={() => setSelectedId(null)}><X aria-hidden="true" /></button></div>}
    </header>
    <div className={`learning-main${selected ? ' has-document' : ''}`}>
      <div className="learning-graph-canvas"><Suspense fallback={<div role="status">正在载入全图…</div>}><GraphRenderer view={view} onEvent={handleEvent} /></Suspense></div>
      {selected && <section className="learning-document" aria-label={`${selected.data.label} 文档`}><Document title={selected.data.label} documentPath={`${selected.data.document}/index.html`} readAsset={readAsset} resource={objectDocumentPreview(content, selected.data)} /></section>}
    </div>
    {content.diagnostics.length > 0 && <details className="learning-diagnostics"><summary>{content.diagnostics.length} 个本地内容问题</summary>{content.diagnostics.map((item) => <p key={`${item.path}:${item.message}`}><code>{item.path}</code> {item.message}</p>)}</details>}
  </section>;
}

function Document({ title, resource, documentPath, readAsset }: { title: string; resource: TextResource; documentPath: string; readAsset?: LearningModeProps['readAsset'] }) {
  return resource.status === 'ready' ? <DocumentPreview title={`${title} 文档`} html={resource.text} documentPath={documentPath} readAsset={readAsset} />
    : <div className="learning-document-error" role="alert"><FileText aria-hidden="true" /><div><strong>无法读取对象文档</strong><p>{resource.message}</p></div></div>;
}
