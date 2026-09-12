import { ArrowRight, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RouteRecord } from '../../learner-records';
import { RetainedGraph } from '../RetainedGraph';
import { routeGraphView, routeSolutionOf, routeSteps } from '../routePreview';
import { labelOf } from '../ConceptPicker';
import type { WorkspaceGraph } from '../../workspace/index';

export type ShelfRoute = {
  readonly record: RouteRecord;
  /** The record's `basis` is no longer the basis of the current graph. Reported, never repaired. */
  readonly stale: boolean;
};

export type RouteShelfProps = {
  readonly graph: WorkspaceGraph;
  readonly routes: readonly ShelfRoute[];
  /** An unreadable `routes.json`. Shown rather than swallowed. */
  readonly issue: string | null;
  /** A write that refused. Reported here, because the list on screen is then not the file. */
  readonly error: string | null;
  readonly active: boolean;
  readonly onStart: (routeId: string) => void;
  readonly onDelete: (routeId: string) => void;
  readonly onNewRoute: () => void;
};

/**
 * The route stage with nothing active: the learner's confirmed routes on the left, the one
 * being looked at on the right. This is where the learner chooses — including choosing to go
 * and compute a new one, which is the single action here that is not about an existing route.
 *
 * Nothing here shows progress. How far along a route the learner is comes from mastery
 * composed with the route, and that composition does not exist yet; a number invented here
 * would be a second source of truth for it.
 */
export function RouteShelf({ graph, routes, issue, error, active, onStart, onDelete, onNewRoute }: RouteShelfProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = routes.find((candidate) => candidate.record.id === selectedId) ?? routes[0];
  const steps = useMemo(
    () => (selected ? routeSteps(graph, routeSolutionOf(selected.record)) : []),
    [graph, selected],
  );
  const staleCount = routes.filter((route) => route.stale).length;
  // The record's own order is the route; the steps that can still be drawn are fewer when the
  // graph lost an object the route names. Both are shown, because the difference is the point.
  const undrawable = selected ? selected.record.order.length - steps.length : 0;

  return <div className="route-shelf">
    <aside className="route-shelf-list" aria-label="已确认的路线">
      <header>
        <h1>我的路线</h1>
        <p>{issue
          ? '路线记录读不出来，这里暂时什么都列不出来。'
          : routes.length
            ? `${routes.length} 条已确认的路线${staleCount > 0 ? `，其中 ${staleCount} 条与当前图不一致` : ''}`
            : '还没有确认过路线'}</p>
      </header>
      {issue && <p className="route-shelf-issue" role="alert">路线记录读不出来：{issue}
        —— 没有把空列表当成结果，也没有覆盖它。</p>}
      {error && <p className="route-shelf-issue" role="alert">这次修改没能落盘：{error}</p>}
      <ul>
        {routes.map((route) => <li key={route.record.id}
          className={route.record.id === selected?.record.id ? 'is-current' : ''}>
          <button type="button" aria-current={route.record.id === selected?.record.id ? 'true' : undefined}
            onClick={() => setSelectedId(route.record.id)}>
            <span className="route-shelf-name">
              <strong>{route.record.description}</strong>
              {route.stale && <span className="route-shelf-stale">与当前图不一致</span>}
            </span>
            <span className="route-shelf-meta">
              走到 {route.record.targets.map((id) => labelOf(graph, id)).join('、')}
              {' · '}{route.record.order.length} 步 · 成本 {route.record.cost}
            </span>
          </button>
        </li>)}
      </ul>
      <button type="button" className="route-shelf-new" onClick={onNewRoute}>新建路线</button>
    </aside>

    {selected
      ? <section className="route-shelf-detail" aria-label={selected.record.description}>
        <header>
          <div>
            <h2>{selected.record.description}</h2>
            <p>
              走到 {selected.record.targets.map((id) => labelOf(graph, id)).join('、')}
              {' · '}{selected.record.order.length} 步 · 成本 {selected.record.cost}
            </p>
          </div>
          <DeleteRouteButton route={selected.record} onDelete={onDelete} />
        </header>
        {selected.stale && <p className="route-shelf-stale-note" role="alert">
          这条路线是在另一版图上解出来的：它只是被报出来，没有被重新求解，也没有被删掉。
          {undrawable > 0 && ` 记录里的 ${undrawable} 步已经不在当前图里，画不出来 —— 路线本身还是原来那一条。`}
        </p>}
        <div className="route-shelf-graph">
          <RetainedGraph active={active} view={routeGraphView(graph, routeSolutionOf(selected.record),
            selected.record.targets, selected.record.known)} onEvent={() => {}} />
        </div>
        <ol className="learning-preview-list" aria-label="路线步骤">
          {steps.map((step) => <li key={step.derivationId}>
            <span className="learning-step-index">{step.index}</span>
            <span className="learning-step-label">{step.label}</span>
            <span className="learning-step-because">
              {step.requires.length ? `需要 ${step.requires.map((id) => labelOf(graph, id)).join(' + ')}` : '不需要前提'}
            </span>
            <span className="learning-step-weight">{step.weight}</span>
          </li>)}
        </ol>
        <footer className="route-shelf-actions">
          <button type="button" className="learning-primary" onClick={() => onStart(selected.record.id)}>
            开始学 <ArrowRight size={15} aria-hidden="true" />
          </button>
        </footer>
      </section>
      : <section className="route-shelf-detail is-empty">
        <h2>{issue ? '路线记录读不出来' : '还没有确认过路线'}</h2>
        <p>{issue
          ? '这份 routes.json 没被读懂，所以不把它当成「一条都没有」。'
          : '目标定好、预览过、按下「开始学」的那一次，才会留下一条路线。'}</p>
      </section>}
  </div>;
}

/** Deleting is explicit and confirmed, and the copy says what it does not touch. */
function DeleteRouteButton({ route, onDelete }: { readonly route: RouteRecord; readonly onDelete: (routeId: string) => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return <button type="button" className="route-shelf-delete" aria-label="删除这条路线"
      title="删除这条路线（不动掌握记录）" onClick={() => setArmed(true)}>
      <Trash2 size={15} aria-hidden="true" />
    </button>;
  }
  return <span className="route-shelf-confirm" role="group" aria-label="确认删除路线">
    删除？掌握记录不动
    <button type="button" className="is-danger" onClick={() => onDelete(route.id)}>删除</button>
    <button type="button" onClick={() => setArmed(false)}>算了</button>
  </span>;
}
