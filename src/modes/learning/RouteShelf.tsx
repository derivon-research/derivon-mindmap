import { ArrowRight, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { canStartPersonalRoute, type PersonalRouteStanding } from '../../learner-records';
import { RetainedGraph } from '../RetainedGraph';
import { routeGraphView, routeSolutionOfReading, routeSteps } from '../routePreview';
import { labelOf } from '../ConceptPicker';
import type { WorkspaceGraph } from '../../workspace/index';

export type RouteShelfProps = {
  readonly graph: WorkspaceGraph;
  /**
   * The learner's personal routes, each read on the graph. An unreadable file is one of them:
   * it is listed and marked, never dropped. A route whose `basis` no longer matches is marked
   * stale; one with an error on this graph is marked invalid and cannot be started.
   */
  readonly routes: readonly PersonalRouteStanding[];
  /** The route directory itself could not be listed. Shown rather than swallowed. */
  readonly issue: string | null;
  /** A write that refused. Reported here, because the list on screen is then not the file. */
  readonly error: string | null;
  readonly active: boolean;
  readonly onStart: (routeId: string) => void;
  readonly onDelete: (routeId: string) => void;
  readonly onNewRoute: () => void;
};

const nameOf = (route: PersonalRouteStanding) => (route.status === 'ready' ? route.route.label : route.fileName);

/**
 * The route stage with nothing active: the learner's personal routes on the left, the one
 * being looked at on the right. This is where the learner chooses — including choosing to go
 * and compute a new one, which is the single action here that is not about an existing route.
 *
 * Nothing here shows progress. How far along a route the learner is comes from mastery
 * composed with the route, and that composition does not exist yet; a number invented here
 * would be a second source of truth for it.
 */
export function RouteShelf({ graph, routes, issue, error, active, onStart, onDelete, onNewRoute }: RouteShelfProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const selected = routes.find((candidate) => candidate.fileName === selectedFile) ?? routes[0];
  const ready = selected?.status === 'ready' ? selected : null;
  const solution = useMemo(() => (ready ? routeSolutionOfReading(ready.reading) : null), [ready]);
  const steps = useMemo(() => (solution ? routeSteps(graph, solution) : []), [graph, solution]);
  const staleCount = routes.filter((route) => route.status === 'ready' && route.stale).length;
  const blockedCount = routes.filter((route) => !canStartPersonalRoute(route)).length;
  // The route's own steps are the route; the steps that can still be drawn are fewer when the
  // graph lost an object the route names. Both are shown, because the difference is the point.
  const undrawable = ready ? ready.route.steps.length - steps.length : 0;

  return <div className="route-shelf">
    <aside className="route-shelf-list" aria-label="已确认的路线">
      <header>
        <h1>我的路线</h1>
        <p>{issue
          ? '路线目录读不出来，这里暂时什么都列不出来。'
          : routes.length
            ? `${routes.length} 条路线${staleCount > 0 ? `，其中 ${staleCount} 条与当前图不一致` : ''}${blockedCount > 0 ? `，${blockedCount} 条现在不能开始学` : ''}`
            : '还没有确认过路线'}</p>
      </header>
      {issue && <p className="route-shelf-issue" role="alert">路线目录读不出来：{issue}
        —— 没有把空列表当成结果，也没有覆盖它。</p>}
      {error && <p className="route-shelf-issue" role="alert">这次修改没能落盘：{error}</p>}
      <ul>
        {routes.map((route) => {
          const current = route.fileName === selected?.fileName;
          return <li key={route.fileName} className={current ? 'is-current' : ''}>
            <button type="button" aria-current={current ? 'true' : undefined}
              onClick={() => setSelectedFile(route.fileName)}>
              <span className="route-shelf-name">
                <strong>{nameOf(route)}</strong>
                {route.status === 'unreadable' && <span className="route-shelf-stale">读不出来</span>}
                {route.status === 'ready' && route.reading.errors > 0
                  && <span className="route-shelf-stale">与当前图不符</span>}
                {route.status === 'ready' && route.stale && <span className="route-shelf-stale">与当前图不一致</span>}
              </span>
              {route.status === 'ready' && <span className="route-shelf-meta">
                走到 {route.route.targets.map((id) => labelOf(graph, id)).join('、')}
                {' · '}{route.route.steps.length} 步 · 成本 {route.reading.cost}
              </span>}
            </button>
          </li>;
        })}
      </ul>
      <button type="button" className="route-shelf-new" onClick={onNewRoute}>创建路线</button>
    </aside>

    {selected?.status === 'unreadable'
      ? <section className="route-shelf-detail" aria-label={selected.fileName}>
        <header>
          <div>
            <h2>{selected.fileName}</h2>
            <p>这个路线文件读不出来，所以不能开始学。它被列了出来，没有被当成不存在，也没有被改写。</p>
          </div>
          {selected.routeId !== null && selected.version !== null && <div className="route-shelf-detail-actions">
            <DeleteRouteButton routeId={selected.routeId} onDelete={onDelete} />
          </div>}
        </header>
        <ul className="route-shelf-stale-note" role="alert">
          {selected.issues.map((item) => <li key={`${item.code}:${item.key ?? ''}:${item.message}`}>{item.message}</li>)}
        </ul>
      </section>
      : ready && solution
        ? <section className="route-shelf-detail" aria-label={ready.route.label}>
          <header>
            <div>
              <h2>{ready.route.label}</h2>
              {ready.route.description && <p>{ready.route.description}</p>}
              <p>
                走到 {ready.route.targets.map((id) => labelOf(graph, id)).join('、')}
                {' · '}{ready.route.steps.length} 步 · 成本 {ready.reading.cost}
              </p>
            </div>
            <div className="route-shelf-detail-actions">
              <button type="button" className="learning-primary" disabled={!canStartPersonalRoute(ready)}
                onClick={() => onStart(ready.routeId)}>
                开始学 <ArrowRight size={15} aria-hidden="true" />
              </button>
              <DeleteRouteButton routeId={ready.routeId} onDelete={onDelete} />
            </div>
          </header>
          {ready.reading.errors > 0 && <div className="route-shelf-stale-note" role="alert">
            这条路线与当前图不符，有 {ready.reading.errors} 个错误，不能开始学。它没有被自动修改，也没有被删掉。
            <ul>
              {ready.reading.diagnostics.filter((item) => item.severity === 'error')
                .map((item, index) => <li key={`${item.code}:${index}`}>{item.message}</li>)}
            </ul>
          </div>}
          {ready.stale && <p className="route-shelf-stale-note" role="alert">
            这条路线是在另一版图上存下来的：它只是被报出来，没有被重新求解，也没有被删掉。
            {undrawable > 0 && ` 路线里的 ${undrawable} 步已经不在当前图里，画不出来 —— 路线本身还是原来那一条。`}
          </p>}
          <div className="route-shelf-graph">
            <RetainedGraph active={active} view={routeGraphView(graph, solution,
              ready.route.targets, ready.route.known)} onEvent={() => {}} />
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
        </section>
        : <section className="route-shelf-detail is-empty">
          <h2>{issue ? '路线目录读不出来' : '还没有确认过路线'}</h2>
          <p>{issue
            ? '路线目录没被读懂，所以不把它当成「一条都没有」。'
            : '目标定好、预览过、按下「开始学」的那一次，才会留下一条路线。'}</p>
        </section>}
  </div>;
}

/** Deleting is explicit and confirmed, and the copy says what it does not touch. */
function DeleteRouteButton({ routeId, onDelete }: { readonly routeId: string; readonly onDelete: (routeId: string) => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return <button type="button" className="route-shelf-delete" aria-label="删除这条路线"
      title="删除这条路线（不动掌握记录）" onClick={() => setArmed(true)}>
      <Trash2 size={15} aria-hidden="true" />
    </button>;
  }
  return <span className="route-shelf-confirm" role="group" aria-label="确认删除路线">
    删除？掌握记录不动
    <button type="button" className="is-danger" onClick={() => onDelete(routeId)}>删除</button>
    <button type="button" onClick={() => setArmed(false)}>算了</button>
  </span>;
}
