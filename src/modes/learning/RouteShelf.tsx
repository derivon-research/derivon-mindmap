import { ArrowRight, Copy, Pencil, Plus } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { PersonalRouteStanding } from '../../learner-records';
import { DeleteRouteButton } from '../ConfirmButton';
import { RetainedGraph } from '../RetainedGraph';
import { routeGraphView, routeSolutionOfReading, routeSteps } from '../routePreview';
import { premisesText, routeTally } from '../routeText';
import { labelOf } from '../ConceptPicker';
import {
  canStartRoute, routeFileName, type Route, type RouteReading, type WorkspaceGraph, type WorkspaceRoute,
} from '../../workspace/index';

/**
 * The learner's own routes, or `null` on a host with nowhere to keep them. Then the shelf
 * offers nothing that would make one: no copy, no create, no edit.
 */
export type PersonalShelf = {
  /**
   * Every personal route file, each read on the graph. An unreadable file is one of them: it is
   * listed and marked, never dropped. A route whose `basis` no longer matches is marked stale;
   * one with an error on this graph is marked invalid and cannot be started.
   */
  readonly routes: readonly PersonalRouteStanding[];
  /** The route directory itself could not be listed. Shown rather than swallowed. */
  readonly issue: string | null;
};

export type RouteShelfProps = {
  readonly graph: WorkspaceGraph;
  /** The routes the workspace ships, read on the graph. Read-only here. */
  readonly workspaceRoutes: readonly WorkspaceRoute[];
  readonly personal: PersonalShelf | null;
  /** A write that refused. Reported here, because the list on screen is then not the file. */
  readonly error: string | null;
  readonly active: boolean;
  /** The entry being looked at (`ShelfEntry.key`), or null for the first one. */
  readonly selected: string | null;
  readonly onSelect: (key: string) => void;
  /** Something to show in place of the selected route's detail: the personal route editor. */
  readonly editor: ReactNode;
  readonly onStart: (routeId: string) => void;
  /** «另存为我的路线并修改»: a workspace route becomes a draft of a personal one. */
  readonly onCopy: (routeId: string) => void;
  /** «修改»: a personal route opens in the editor. */
  readonly onEdit: (routeId: string) => void;
  /** Delete a personal route file the editor cannot open, because it could not be read. */
  readonly onDelete: (routeId: string) => void;
  /** «创建我的路线»: a blank personal route in the editor. */
  readonly onCreate: () => void;
  /** «创建路线»: the create flow's questions, which end in a solved route to confirm. */
  readonly onNewRoute: () => void;
};

/** One row on the shelf, whichever group it is in. */
type ShelfEntry = {
  readonly key: string;
  readonly group: 'workspace' | 'personal';
  readonly name: string;
  /** Null for a file whose name is not `<route id>.json`: nothing can address it by id. */
  readonly routeId: string | null;
  /** The route and its reading on the graph; null when the file could not be read at all. */
  readonly route: Route | null;
  readonly reading: RouteReading | null;
  /** Why the file could not be read, when it could not. */
  readonly problems: readonly string[];
  readonly stale: boolean;
  readonly startable: boolean;
  /** A personal file that can be deleted from the shelf because the editor cannot open it. */
  readonly deletable: boolean;
};

export const workspaceEntryKey = (routeId: string) => `workspace:${routeId}`;
export const personalEntryKey = (fileName: string) => `personal:${fileName}`;

function workspaceEntry(route: WorkspaceRoute): ShelfEntry {
  return {
    key: workspaceEntryKey(route.id), group: 'workspace', name: route.route?.label || routeFileName(route.id),
    routeId: route.id, route: route.route, reading: route.reading,
    problems: route.status === 'invalid' && !route.route
      ? (route.issues.length ? route.issues.map((issue) => issue.message) : [route.message])
      : [],
    stale: false, startable: canStartRoute(route), deletable: false,
  };
}

function personalEntry(route: PersonalRouteStanding): ShelfEntry {
  return route.status === 'ready'
    ? {
      key: personalEntryKey(route.fileName), group: 'personal', name: route.route.label || route.fileName,
      routeId: route.routeId, route: route.route, reading: route.reading, problems: [],
      stale: route.stale, startable: canStartRoute(route), deletable: false,
    }
    : {
      key: personalEntryKey(route.fileName), group: 'personal', name: route.fileName,
      routeId: route.routeId, route: null, reading: null, problems: route.issues.map((issue) => issue.message),
      stale: false, startable: false, deletable: route.routeId !== null && route.version !== null,
    };
}

/**
 * The route stage with nothing active: two groups of routes on the left — the ones this
 * workspace ships, which are read-only here, and the learner's own — and the one being looked
 * at on the right. This is where the learner chooses a route, copies an author's one to make it
 * their own, edits their own, or goes to compute a new one.
 *
 * A route that does not fit the graph is listed and marked, and cannot be started; nothing here
 * repairs, re-solves or deletes it. Nothing here shows progress either: how far along a route
 * the learner is comes from mastery composed with the route, once it is being walked.
 */
export function RouteShelf({
  graph, workspaceRoutes, personal, error, active, selected: selectedKey, onSelect, editor,
  onStart, onCopy, onEdit, onDelete, onCreate, onNewRoute,
}: RouteShelfProps) {
  const workspaceEntries = useMemo(() => workspaceRoutes.map(workspaceEntry), [workspaceRoutes]);
  const own = useMemo(() => personal?.routes.map(personalEntry) ?? [], [personal]);
  const selected = [...workspaceEntries, ...own].find((entry) => entry.key === selectedKey) ?? workspaceEntries[0] ?? own[0];
  const labelOfWorkspaceRoute = (routeId: string) => workspaceRoutes.find((route) => route.id === routeId)?.route?.label;

  return <div className="route-shelf">
    <aside className="route-shelf-list" aria-label="路线书架">
      <header><h1>路线</h1></header>
      {error && <p className="route-shelf-issue" role="alert">这次修改没能落盘：{error}</p>}

      <section className="route-shelf-group" aria-label="这个工作区带的">
        <h2>这个工作区带的</h2>
        <p>{workspaceEntries.length ? groupSummary(workspaceEntries) : '这个工作区没有带路线'}</p>
        <EntryList graph={graph} entries={workspaceEntries} selected={selected?.key} onSelect={onSelect} />
      </section>

      <section className="route-shelf-group" aria-label="我的">
        <h2>我的</h2>
        {personal
          ? <>
            <p>{personal.issue
              ? '路线目录读不出来，这里暂时什么都列不出来。'
              : own.length ? groupSummary(own) : '还没有我的路线'}</p>
            {personal.issue && <p className="route-shelf-issue" role="alert">路线目录读不出来：{personal.issue}
              —— 没有把空列表当成结果，也没有覆盖它。</p>}
            <EntryList graph={graph} entries={own} selected={selected?.key} onSelect={onSelect} />
            <button type="button" className="route-shelf-new" onClick={onCreate}>
              <Plus size={14} aria-hidden="true" />创建我的路线
            </button>
          </>
          : <p>这个宿主没有应用数据目录，存不了自己的路线；作者带的路线照样可以学。</p>}
      </section>

      <button type="button" className="route-shelf-new is-flow" onClick={onNewRoute}>创建路线</button>
    </aside>

    {editor ?? (selected
      ? <EntryDetail graph={graph} entry={selected} active={active} canCopy={personal !== null}
        basedOnLabel={selected.route?.basedOn ? labelOfWorkspaceRoute(selected.route.basedOn) ?? null : null}
        onStart={onStart} onCopy={onCopy} onEdit={onEdit} onDelete={onDelete} />
      : <section className="route-shelf-detail is-empty">
        <h2>还没有可以走的路线</h2>
        <p>{personal
          ? '这个工作区没有带路线，你也还没有自己的路线。目标定好、预览过、按下「开始学」，或者创建一条我的路线，才会留下一条。'
          : '这个工作区没有带路线。可以去「创建路线」按目标算一条来看。'}</p>
      </section>)}
  </div>;
}

function groupSummary(entries: readonly ShelfEntry[]): string {
  const stale = entries.filter((entry) => entry.stale).length;
  const blocked = entries.filter((entry) => !entry.startable).length;
  return `${entries.length} 条路线${stale > 0 ? `，其中 ${stale} 条与当前图不一致` : ''}${blocked > 0 ? `，${blocked} 条现在不能开始学` : ''}`;
}

function EntryList({ graph, entries, selected, onSelect }: {
  readonly graph: WorkspaceGraph; readonly entries: readonly ShelfEntry[];
  readonly selected: string | undefined; readonly onSelect: (key: string) => void;
}) {
  if (!entries.length) return null;
  return <ul>
    {entries.map((entry) => {
      const current = entry.key === selected;
      return <li key={entry.key} className={current ? 'is-current' : ''}>
        <button type="button" aria-current={current ? 'true' : undefined} onClick={() => onSelect(entry.key)}>
          <span className="route-shelf-name">
            <strong>{entry.name}</strong>
            {!entry.route && <span className="route-shelf-stale">读不出来</span>}
            {entry.reading && entry.reading.errors > 0 && <span className="route-shelf-stale">与当前图不符</span>}
            {entry.stale && <span className="route-shelf-stale">与当前图不一致</span>}
          </span>
          {entry.route && entry.reading && <span className="route-shelf-meta">
            走到 {entry.route.targets.map((id) => labelOf(graph, id)).join('、')}
            {' · '}{routeTally(entry.reading)}
          </span>}
        </button>
      </li>;
    })}
  </ul>;
}

function EntryDetail({ graph, entry, active, canCopy, basedOnLabel, onStart, onCopy, onEdit, onDelete }: {
  readonly graph: WorkspaceGraph; readonly entry: ShelfEntry; readonly active: boolean; readonly canCopy: boolean;
  readonly basedOnLabel: string | null;
  readonly onStart: (routeId: string) => void; readonly onCopy: (routeId: string) => void;
  readonly onEdit: (routeId: string) => void; readonly onDelete: (routeId: string) => void;
}) {
  const { route, reading } = entry;
  const solution = useMemo(() => (reading ? routeSolutionOfReading(reading) : null), [reading]);
  const steps = useMemo(() => (solution ? routeSteps(graph, solution) : []), [graph, solution]);

  if (!route || !reading || !solution) {
    return <section className="route-shelf-detail" aria-label={entry.name}>
      <header>
        <div>
          <h2>{entry.name}</h2>
          <p>这个路线文件读不出来，所以不能开始学。它被列了出来，没有被当成不存在，也没有被改写。</p>
        </div>
        {entry.deletable && entry.routeId !== null && <div className="route-shelf-detail-actions">
          <DeleteRouteButton iconOnly className="route-shelf-delete" prompt="删除？掌握记录不动"
            onDelete={() => onDelete(entry.routeId!)} />
        </div>}
      </header>
      <ul className="route-shelf-stale-note" role="alert">
        {entry.problems.map((problem, index) => <li key={`${index}:${problem}`}>{problem}</li>)}
      </ul>
    </section>;
  }

  // Step count and cost are the reading's, as in the editor and the authoring list. The entries
  // the graph lost are not steps of the reading; they are named separately, because the
  // difference is the point.
  const undrawable = new Set(route.steps).size - reading.order.length;
  return <section className="route-shelf-detail" aria-label={route.label}>
    <header>
      <div>
        <h2>{route.label}</h2>
        {route.description && <p>{route.description}</p>}
        <p>
          {entry.group === 'workspace' ? '这个工作区带的 · ' : '我的 · '}
          走到 {route.targets.map((id) => labelOf(graph, id)).join('、')}
          {' · '}{routeTally(reading)}
        </p>
        {route.basedOn && <p className="route-shelf-based-on">
          改自这个工作区带的「{basedOnLabel ?? route.basedOn}」{basedOnLabel === null ? '（工作区里已经没有这条路线）' : ''}
          ；作者之后的改动不会跟过来。
        </p>}
      </div>
      <div className="route-shelf-detail-actions">
        {entry.routeId !== null && entry.group === 'workspace' && canCopy
          && <button type="button" onClick={() => onCopy(entry.routeId!)}>
            <Copy size={14} aria-hidden="true" />另存为我的路线并修改
          </button>}
        {entry.routeId !== null && entry.group === 'personal'
          && <button type="button" onClick={() => onEdit(entry.routeId!)}>
            <Pencil size={14} aria-hidden="true" />修改
          </button>}
        <button type="button" className="learning-primary" disabled={!entry.startable || entry.routeId === null}
          onClick={() => onStart(entry.routeId!)}>
          开始学 <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
    {reading.errors > 0 && <div className="route-shelf-stale-note" role="alert">
      这条路线与当前图不符，有 {reading.errors} 个错误，不能开始学。它没有被自动修改，也没有被删掉。
      <ul>
        {reading.diagnostics.filter((item) => item.severity === 'error')
          .map((item, index) => <li key={`${item.code}:${index}`}>{item.message}</li>)}
      </ul>
    </div>}
    {entry.stale && <p className="route-shelf-stale-note" role="alert">
      这条路线是在另一版图上存下来的：它只是被报出来，没有被重新求解，也没有被删掉。
      {undrawable > 0 && ` 路线里的 ${undrawable} 步已经不在当前图里，画不出来 —— 路线本身还是原来那一条。`}
    </p>}
    <div className="route-shelf-graph">
      <RetainedGraph active={active} view={routeGraphView(graph, solution, route.targets, route.known)} onEvent={() => {}} />
    </div>
    <ol className="learning-preview-list" aria-label="路线步骤">
      {steps.map((step) => <li key={step.derivationId}>
        <span className="learning-step-index">{step.index}</span>
        <span className="learning-step-label">{step.label}</span>
        <span className="learning-step-because">
          {premisesText(graph, step.requires)}
        </span>
        <span className="learning-step-weight">{step.weight}</span>
      </li>)}
    </ol>
  </section>;
}
