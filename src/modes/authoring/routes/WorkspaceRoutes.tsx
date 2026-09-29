import { AlertTriangle, Plus, Route as RouteIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { RouteSolver } from '../../../ports/RouteSolver';
import type { WorkspaceContent } from '../../../workspace/index';
import { RouteEditor } from '../../RouteEditor';
import type { RouteDrafts, RouteListEntry } from './useRouteDrafts';
import './routes.css';

/**
 * The routes view's list pane: every workspace route file, valid or not, with what an author
 * needs to see which one to open — and the new, never-saved drafts after them.
 */
export function RouteList({ drafts, editable }: { readonly drafts: RouteDrafts; readonly editable: boolean }) {
  return <div className="route-list">
    {drafts.entries.length ? <ul aria-label="工作区路线">
      {drafts.entries.map((entry) => <li key={entry.id}>
        <button type="button" className={`route-list-row${drafts.selected?.id === entry.id ? ' is-selected' : ''}${problem(entry) ? ' is-error' : ''}`}
          aria-current={drafts.selected?.id === entry.id ? 'true' : undefined} onClick={() => drafts.select(entry.id)}>
          <strong>{entry.label.trim() || '未命名路线'}</strong>
          <small>{summary(entry)}</small>
          {(entry.dirty || problem(entry)) && <span className="route-list-marks">
            {entry.dirty && <span className="route-list-mark is-draft">{entry.saved ? '未保存' : '新建未保存'}</span>}
            {problem(entry) && <span className="route-list-mark is-error">{problem(entry)}</span>}
          </span>}
          {!entry.dirty && entry.saved?.status === 'invalid' && <span className="route-list-diagnosis">{entry.saved.message}</span>}
        </button>
      </li>)}
    </ul> : <p className="authoring-empty-note">这个工作区还没有路线。</p>}
    {editable && <button type="button" className="route-list-new" onClick={drafts.create}><Plus size={14} />新建路线</button>}
  </div>;
}

function summary(entry: RouteListEntry): string {
  const reading = entry.reading;
  if (!reading) return '文件读不出来';
  return `${reading.order.length} 步 · 成本 ${reading.cost} · ${reading.orderSource === 'written' ? '已写定' : '现算'}`;
}

/** What makes the row an error: the draft's error count, or the saved file being invalid. */
function problem(entry: RouteListEntry): string {
  if (entry.dirty) return entry.reading?.errors ? `${entry.reading.errors} 个错误` : '';
  if (entry.saved?.status !== 'invalid') return '';
  return entry.saved.reading ? `无效 · ${entry.saved.reading.errors} 个错误` : '无效';
}

export type RouteWorkbenchProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly drafts: RouteDrafts;
  readonly routeSolver?: RouteSolver;
  readonly editable: boolean;
};

/** The routes view's centre: the shared route editor on the selected route's draft. */
export function RouteWorkbench({ active, content, drafts, routeSolver, editable }: RouteWorkbenchProps) {
  const entry = drafts.selected;
  if (!entry) {
    return <main className="route-workbench is-empty">
      <RouteIcon size={30} strokeWidth={1.3} />
      <h1>{drafts.entries.length ? '选一条路线' : '还没有工作区路线'}</h1>
      <p>工作区路线随工作区分发，每条一个文件，学习者在路线书架上能直接挑来走。</p>
      {editable && <button type="button" className="authoring-primary" onClick={drafts.create}><Plus size={16} />新建路线</button>}
    </main>;
  }
  if (!drafts.route) return <UnreadableRoute entry={entry} onDelete={editable ? drafts.remove : undefined} />;
  const invalid = !entry.dirty && entry.saved?.status === 'invalid' ? entry.saved.message : '';
  return <main className="route-workbench">
    {invalid && <p className="route-workbench-invalid" role="status"><AlertTriangle size={15} />保存的路线在当前的图上无效：{invalid}</p>}
    <RouteEditor key={entry.id} active={active} graph={content.graph} tags={content.tags} route={drafts.route}
      dirty={entry.dirty} routeSolver={routeSolver}
      {...editable ? {
        onChange: drafts.edit, onSave: drafts.save, onDiscard: drafts.discard,
        onDelete: entry.saved ? drafts.remove : undefined, deletePrompt: '删除这条工作区路线的文件？',
      } : {}} />
  </main>;
}

/** A route file that could not be read or decoded: its diagnosis, and deleting it is the one repair here. */
function UnreadableRoute({ entry, onDelete }: { readonly entry: RouteListEntry; readonly onDelete?: () => void }) {
  const [armed, setArmed] = useState(false);
  const [failure, setFailure] = useState('');
  const saved = entry.saved?.status === 'invalid' ? entry.saved : null;
  const remove = () => {
    setArmed(false);
    try { onDelete?.(); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  return <main className="route-workbench is-unreadable" aria-label="无法读取的路线">
    <h2><AlertTriangle size={17} />路线文件无效</h2>
    <p><code>{saved?.path ?? entry.id}</code></p>
    <ul>{(saved?.issues ?? []).map((issue, index) => <li key={`${issue.code}:${index}`}>{issue.message}</li>)}</ul>
    <p className="authoring-empty-note">这份文件读不成一条路线，在这里不能编辑。修好文件本身，或删除它。</p>
    {failure && <p className="route-editor-failure" role="alert">{failure}</p>}
    {onDelete && (armed
      ? <span className="route-editor-confirm" role="group" aria-label="确认删除路线">删除这份路线文件？
        <button type="button" className="route-editor-danger" onClick={remove}>删除</button>
        <button type="button" onClick={() => setArmed(false)}>算了</button></span>
      : <button type="button" className="route-editor-danger" onClick={() => setArmed(true)}><Trash2 size={14} />删除路线</button>)}
  </main>;
}
