/**
 * PROTOTYPE ONLY — throwaway. The draft/save discipline all three editors share, so the
 * variants disagree about layout rather than about when a route may be saved.
 */
import { useEffect, useState } from 'react';
import { RetainedGraph } from '../modes/RetainedGraph';
import { routeGraphView } from '../modes/routePreview';
import { graph, solverDraft } from './data';
import { readRoute, type Route, type RouteReading } from './routeModel';
import { conceptLabel, derivationTitle, issueText } from './shared';

export function useDraft(route: Route) {
  const [draft, setDraft] = useState(route);
  useEffect(() => setDraft(route), [route]);
  const reading = readRoute(graph, draft);
  return { draft, setDraft, reading, dirty: draft !== route };
}

export function SaveBar({ reading, dirty, onSave, onDiscard, saveLabel = '保存' }: {
  readonly reading: RouteReading; readonly dirty: boolean; readonly onSave: () => void; readonly onDiscard: () => void; readonly saveLabel?: string;
}) {
  return <div className="p-savebar">
    <span className={reading.errors ? 'p-status is-error' : 'p-status'}>
      {reading.errors ? `${reading.errors} 个错误：修好之前不能保存` : `${reading.order.length} 步 · 成本 ${reading.cost} · 顺序${reading.orderSource === 'written' ? '已写定' : '现算'}`}
      {reading.warnings > 0 && ` · ${reading.warnings} 个提示`}
    </span>
    <span className="p-flex" />
    {dirty && <button type="button" onClick={onDiscard}>放弃更改</button>}
    <button type="button" className="authoring-primary" disabled={!dirty || reading.errors > 0} onClick={onSave}>{saveLabel}</button>
  </div>;
}

/** Route-level problems (not tied to one step), each with the fix the graph offers. */
export function GapList({ reading, onAdd }: { readonly reading: RouteReading; readonly onAdd?: (derivationId: string) => void }) {
  const gaps = reading.issues.filter((issue) => issue.kind === 'target-unreached' || issue.kind === 'dangling-concept' || issue.kind === 'dangling-derivation');
  if (!gaps.length) return null;
  return <div className="p-gaps" role="alert">
    {gaps.map((issue, index) => <div key={index} className="p-gap">
      <p>{issueText(issue)}</p>
      {issue.kind === 'target-unreached' && issue.missing.map((missing) => <div key={missing.conceptId} className="p-gap-fix">
        <span>「{conceptLabel(missing.conceptId)}」{missing.wantedBy !== missing.conceptId ? `（「${conceptLabel(derivationEdgeHead(missing.wantedBy))}」那一步要用）` : ''}：</span>
        {missing.candidates.length
          ? missing.candidates.map((id) => <button type="button" key={id} disabled={!onAdd} onClick={() => onAdd?.(id)}>补上 {derivationTitle(id)}</button>)
          : <em>图里没有任何推导得到它，只能放进已知</em>}
      </div>)}
    </div>)}
    {reading.blocked > 0 && <p className="p-hint">另有 {reading.blocked} 步因此暂时走不了（补上之后自动恢复，不单独列出）。</p>}
  </div>;
}

const derivationEdgeHead = (id: string) => graph.hyperedges.find((edge) => edge.id === id)?.head ?? id;

export function RouteGraph({ route, reading, active = true }: { readonly route: Route; readonly reading: RouteReading; readonly active?: boolean }) {
  const view = routeGraphView(graph, {
    reachable: reading.errors === 0, conceptIds: reading.conceptIds, derivationIds: reading.order, order: reading.order,
    cost: reading.cost, provenOptimal: false, blocked: [],
  }, route.targets, route.known);
  return <RetainedGraph active={active} view={view} onEvent={() => {}} />;
}

export function resolve(route: Route): Route {
  const solved = solverDraft(route.known, route.targets);
  return { ...route, derivationIds: solved.derivationIds, order: null };
}
