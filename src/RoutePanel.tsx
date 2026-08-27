import { Eraser, Play, X } from 'lucide-react';
import { formatWeight, type AuthoringDocument } from './domain';
import type { RouteSelection } from './route';

type RoutePanelProps = {
  document: AuthoringDocument;
  selection: RouteSelection;
  solving: boolean;
  error: string | null;
  onToggleStart: (pointId: string) => void;
  onTargetChange: (pointId: string | null) => void;
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
  onTargetChange,
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

      <label>
        目标概念
        <select
          aria-label="目标概念"
          value={selection.targetPointId ?? ''}
          onChange={(event) => onTargetChange(event.target.value || null)}
        >
          <option value="">未选择</option>
          {document.graph.points.map((point) => (
            <option value={point.id} key={point.id}>{point.data.label} · {point.id}</option>
          ))}
        </select>
      </label>

      <fieldset className="route-starts">
        <legend>已经掌握 · {selection.startPointIds.length}</legend>
        <div>
          {document.graph.points.map((point) => (
            <label key={point.id}>
              <input
                type="checkbox"
                checked={selection.startPointIds.includes(point.id)}
                onChange={() => onToggleStart(point.id)}
              />
              <span>{point.data.label}<small>{point.id}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        className="route-solve-button"
        type="button"
        disabled={solving || !selection.targetPointId}
        onClick={onSolve}
      >
        <Play size={15} />
        <span>{solving ? '正在求解' : '开始求解'}</span>
      </button>

      {error && <p className="route-error" role="alert">{error}</p>}

      {result?.reachable && (
        <section className="route-result" aria-label="路线结果">
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
          <header><div><span>不可达</span><strong>{label(selection.targetPointId ?? '')}</strong></div></header>
          <div className="route-blocking">
            <span>阻塞概念</span>
            <ul>{result.blockingPointIds.map((id) => <li key={id}>{label(id)}<small>{id}</small></li>)}</ul>
          </div>
          {!!result.cycles.length && (
            <div className="route-cycles">
              <span>阻塞环</span>
              {result.cycles.map((cycle) => <code key={cycle.join(':')}>{cycle.map(label).join(' → ')}</code>)}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
