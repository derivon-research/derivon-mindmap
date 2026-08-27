import { Eraser, Play, X } from 'lucide-react';
import { ConceptMultiSelect } from './ConceptMultiSelect';
import { formatWeight, type AuthoringDocument } from './domain';
import { TOUR_FEATURES, tourTarget } from './onboarding';
import type { RouteSelection } from './route';

type RoutePanelProps = {
  document: AuthoringDocument;
  selection: RouteSelection;
  solving: boolean;
  error: string | null;
  onToggleStart: (pointId: string) => void;
  onToggleTarget: (pointId: string) => void;
  onSolve: () => void;
  onClear: () => void;
  onClose: () => void;
};

export function RoutePanel({
  document,
  selection,
  solving,
  error,
  onToggleStart,
  onToggleTarget,
  onSolve,
  onClear,
  onClose,
}: RoutePanelProps) {
  const result = selection.result;
  const pointById = new Map(document.graph.points.map((point) => [point.id, point]));
  const edgeById = new Map(document.graph.hyperedges.map((edge) => [edge.id, edge]));
  const label = (id: string) => pointById.get(id)?.data.label ?? id;

  return (
    <aside className="inspector route-panel" aria-label="路线">
      <div className="inspector-heading">
        <div><span className="eyebrow">Derivation</span><strong>路线</strong></div>
        <div className="heading-actions">
          <button type="button" title="清除路线" aria-label="清除路线" onClick={onClear}><Eraser size={16} /></button>
          <button type="button" title="关闭路线模式" aria-label="关闭路线模式" onClick={onClose}><X size={16} /></button>
        </div>
      </div>

      <ConceptMultiSelect
        id="route-start-search"
        label="已经掌握"
        points={document.graph.points}
        selectedIds={selection.startPointIds}
        tone="start"
        tourFeatureId={TOUR_FEATURES.routeStart.id}
        onToggle={onToggleStart}
      />

      <ConceptMultiSelect
        id="route-target-search"
        label="目标概念"
        points={document.graph.points}
        selectedIds={selection.targetPointIds}
        tone="target"
        tourFeatureId={TOUR_FEATURES.routeTarget.id}
        onToggle={onToggleTarget}
      />

      <button
        className="route-solve-button"
        type="button"
        {...tourTarget(TOUR_FEATURES.routeSolve)}
        disabled={solving || !selection.targetPointIds.length}
        onClick={onSolve}
      >
        <Play size={15} />
        <span>{solving ? '正在求解' : '开始求解'}</span>
      </button>

      {error && <p className="route-error" role="alert">{error}</p>}

      {result?.reachable && (
        <section className="route-result" aria-label="路线结果" {...tourTarget(TOUR_FEATURES.routeResult)}>
          <header>
            <div>
              <span>{result.provenOptimal ? '已证明最优' : '当前最佳'}</span>
              <strong>{formatWeight(result.cost ?? 0)}</strong>
            </div>
            <small>{result.nodes} nodes · {result.millis} ms</small>
          </header>
          {!result.provenOptimal && (
            <div className="route-bounds">
              <span>下界 <strong>{result.lower === null ? '—' : formatWeight(result.lower)}</strong></span>
              <span>上界 <strong>{result.upper === null ? '—' : formatWeight(result.upper)}</strong></span>
            </div>
          )}
          <ol className="route-steps">
            {result.executableOrder.map((id) => {
              const edge = edgeById.get(id);
              if (!edge) return null;
              return (
                <li key={id}>
                  <span>{edge.tails.length ? edge.tails.map(label).join(' + ') : '∅'}</span>
                  <strong>{label(edge.head)}</strong>
                  <small>{id} · {formatWeight(edge.weight)}</small>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {result && !result.reachable && (
        <section className="route-result is-unreachable" aria-label="不可达诊断">
          <header><div><span>不可达</span><strong>{result.targetDiagnoses.length} 个目标</strong></div></header>
          {result.targetDiagnoses.map((diagnosis) => (
            <div className="route-target-diagnosis" key={diagnosis.targetPointId}>
              <strong>{label(diagnosis.targetPointId)}</strong>
              <div className="route-blocking">
                <span>阻塞概念</span>
                <ul>{diagnosis.blockingPointIds.map((id) => <li key={id}>{label(id)}<small>{id}</small></li>)}</ul>
              </div>
              {!!diagnosis.cycles.length && (
                <div className="route-cycles">
                  <span>阻塞环</span>
                  {diagnosis.cycles.map((cycle) => <code key={cycle.join(':')}>{cycle.map(label).join(' → ')}</code>)}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}
