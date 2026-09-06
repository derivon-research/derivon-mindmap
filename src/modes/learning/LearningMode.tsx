import { Compass, FileText, Network, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DocumentPreview } from '../../app/DocumentPreview';
import type { LearningModeProps } from '../../app/host';
import type { GraphEvent, GraphView } from '../../rendering';
import { objectDocumentPreview, type TextResource } from '../../workspace/index';
import { RetainedGraph } from '../RetainedGraph';
import './learning.css';
import { OrientationPanel } from './OrientationPanel';
import {
  applyOrientationIntent, beginOrientation, planOrientation,
  type OrientationIntent, type OrientationRun,
} from './orientation';

export function LearningMode({ active = true, workspace, content, targetIds, knownIds, onChangeTargets, onChangeKnown, routeSolver, readAsset }: LearningModeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => targetIds[0] ?? null);
  const plan = useMemo(() => planOrientation(content), [content]);
  // Targets already in application state came from a mode switch, and orientation is over
  // for this session; otherwise the run starts from the author's seed.
  const [run, setRun] = useState<OrientationRun>(() => (targetIds.length
    ? { ...beginOrientation(plan), targets: [...targetIds], known: [...knownIds], at: -1 }
    : beginOrientation(plan)));
  const [oriented, setOriented] = useState(() => targetIds.length > 0);
  // The seed is a route, not a suggestion: it reaches application state on the first frame,
  // before a single question has been asked. The callbacks are stable application state
  // setters; watching them instead of the run would publish on every render.
  useEffect(() => {
    onChangeTargets(run.targets);
    onChangeKnown(run.known);
  }, [run.known, run.targets]);

  const selected = selectedId ? content.graph.points.find((point) => point.id === selectedId) : undefined;
  const view = useMemo<GraphView>(() => ({
    kind: 'overview',
    concepts: content.graph.points.map((point) => ({ id: point.id, label: point.data.label,
      marks: [...(targetIds.includes(point.id) ? ['target' as const] : []),
        ...(knownIds.includes(point.id) ? ['known' as const] : []),
        ...(point.id === selectedId ? ['selected' as const] : [])] })),
    hyperedges: content.graph.hyperedges.map((edge) => ({ ...edge, marks: [] })),
  }), [content.graph, knownIds, selectedId, targetIds]);
  const handleEvent = (event: GraphEvent) => {
    if (event.object === null) setSelectedId(null);
    else if (event.object.kind === 'concept') setSelectedId(event.object.id);
  };
  const toggleTarget = () => {
    if (!selected) return;
    setRun((current) => applyOrientationIntent(plan, current, { kind: 'set-targets',
      conceptIds: current.targets.includes(selected.id)
        ? current.targets.filter((id) => id !== selected.id) : [...current.targets, selected.id] }));
  };
  // Applied eagerly rather than inside the state updater, so a rejected intent surfaces to
  // the caller that raised it instead of throwing during a later render.
  const intent = (value: OrientationIntent) => setRun(applyOrientationIntent(plan, run, value));

  return <section className="learning-workbench" data-derivon-mode="learning" data-learning-targets={targetIds.join(' ')} data-learning-known={knownIds.join(' ')} aria-label="学习侧">
    <header className="learning-header"><div><Network aria-hidden="true" /><h1>{workspace.name}</h1><span>{view.concepts.length} 个概念</span></div>
      {oriented && <div className="learning-selection">
        {selected && <><output aria-label="Selected concept">{selected.data.label}</output><button type="button" aria-pressed={targetIds.includes(selected.id)} onClick={toggleTarget}>{targetIds.includes(selected.id) ? '取消目标' : '设为目标'}</button><button type="button" className="learning-icon-button" title="关闭文档" onClick={() => setSelectedId(null)}><X aria-hidden="true" /></button></>}
        <button type="button" onClick={() => { setRun(beginOrientation(plan)); setOriented(false); }}><Compass size={15} aria-hidden="true" />重新确定目标</button>
      </div>}
    </header>
    {oriented ? <div className={`learning-main${selected ? ' has-document' : ''}`}>
      <div className="learning-graph-canvas"><RetainedGraph active={active} view={view} onEvent={handleEvent} /></div>
      {selected && <section className="learning-document" aria-label={`${selected.data.label} 文档`}><Document title={selected.data.label} documentPath={`${selected.data.document}/index.html`} readAsset={readAsset} resource={objectDocumentPreview(content, selected.data)} /></section>}
    </div> : <div className="learning-main learning-orientation">
      <OrientationPanel graph={content.graph} tags={content.tags} plan={plan} run={run} routeSolver={routeSolver}
        onIntent={intent} onEnter={() => setOriented(true)} />
    </div>}
    {content.diagnostics.length > 0 && <details className="learning-diagnostics"><summary>{content.diagnostics.length} 个本地内容问题</summary>{content.diagnostics.map((item) => <p key={`${item.path}:${item.message}`}><code>{item.path}</code> {item.message}</p>)}</details>}
  </section>;
}

function Document({ title, resource, documentPath, readAsset }: { title: string; resource: TextResource; documentPath: string; readAsset?: LearningModeProps['readAsset'] }) {
  return resource.status === 'ready' ? <DocumentPreview title={`${title} 文档`} html={resource.text} documentPath={documentPath} readAsset={readAsset} />
    : <div className="learning-document-error" role="alert"><FileText aria-hidden="true" /><div><strong>无法读取对象文档</strong><p>{resource.message}</p></div></div>;
}
