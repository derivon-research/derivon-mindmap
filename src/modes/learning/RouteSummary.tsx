import type { WorkspaceGraph } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import type { useRoutePreview } from '../routePreview';

/**
 * What the current route preview amounts to, in one line. Every surface that shows a route
 * before the learner walks it says the same thing here — including the honest "this host
 * cannot solve" line, which is the whole answer on a build that ships no `RouteSolver`.
 */
export function RouteSummary({ route, graph }: { route: ReturnType<typeof useRoutePreview>; graph: WorkspaceGraph }) {
  switch (route.status) {
    case 'unavailable':
      return <p className="orientation-route" role="status">这个宿主还不能求解路线，目标与已知已经确认。</p>;
    case 'empty':
      return <p className="orientation-route" role="status">选择至少一个目标后可以看到初始路线。</p>;
    case 'solving':
      return <p className="orientation-route" role="status" aria-busy="true">正在求解路线…</p>;
    case 'error':
      return <p className="orientation-warning" role="alert">路线求解失败：{route.message}</p>;
    case 'ready':
      return route.solution.reachable
        ? <p className="orientation-route" role="status">
          初始路线 {route.solution.derivationIds.length} 步，覆盖 {route.solution.conceptIds.length} 个概念
          {route.solution.cost === null ? '' : `，成本 ${route.solution.cost}`}
          {route.solution.provenOptimal ? '' : '（预算内的上界，未证明最优）'}。
        </p>
        : <p className="orientation-warning" role="alert">
          目前无法从已知走到全部目标
          {route.solution.blocked.length
            ? `：${route.solution.blocked.map((block) => `${labelOf(graph, block.targetConceptId)} 缺少 ${block.blockingConceptIds.map((id) => labelOf(graph, id)).join('、') || '前提'}`).join('；')}`
            : ''}。
        </p>;
  }
}
