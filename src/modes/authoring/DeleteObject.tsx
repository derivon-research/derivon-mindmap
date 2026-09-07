import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Compass, FileText, GitBranch, HardDrive, Image, Trash2, Undo2, X } from 'lucide-react';
import {
  deletionBlockers, isMarkdownPath, objectSourcePath,
  type DeletionPlan, type ObjectRef, type ReferenceImpact, type ReferenceRepairChoice, type WorkspaceContent,
} from '../../workspace/index';
import type { AuthoringCommands, DeletionPreview } from '../../synchronization';
import { RepairActions } from './DocumentIntegrity';
import { objectLabel } from './ObjectMetadata';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

const planOf = (object: ObjectRef): DeletionPlan =>
  object.kind === 'concept' ? { conceptIds: [object.id] } : { derivationIds: [object.id] };

const referenceKey = (item: ReferenceImpact['incoming'][number]) =>
  `${item.from.kind}:${item.from.id}:${item.reference.at.start}`;

/**
 * Deleting an object, as a dialogue you enter and either finish or leave — the same shape
 * as 新建, because deletion is the same kind of decision: one thing, decided from start to
 * end, with nothing else being edited meanwhile.
 *
 * Nothing here is a shortcut. The plan is assembled first — the derivations that cannot
 * survive it, every file the host reports under its directories, the references that would
 * be broken and the orientation configuration that names it — and the repairs the author
 * picks are carried out by the same deletion, in one change. A reference source that could
 * not be read leaves the object exactly where it is, with its entry still on it.
 */
export function DeleteObject({ content, object, authoring, onClose, onDeleted, onOpenObject, blocked }: {
  content: WorkspaceContent;
  object: ObjectRef;
  authoring: AuthoringCommands;
  onClose: () => void;
  onDeleted: () => void;
  /** A source that could not be analysed is repaired where it lives, so the plan links to it. */
  onOpenObject: (object: ObjectRef) => void;
  /** An unapplied document draft: repairs would be written against a body being replaced. */
  blocked?: string;
}) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [repairs, setRepairs] = useState<Record<string, ReferenceRepairChoice>>({});
  const [repairOrientation, setRepairOrientation] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setFailure('');
    try { setPreview(await authoring.deletionPreview(planOf(object))); }
    catch (error) { setFailure(message(error)); setPreview(null); }
    finally { setLoading(false); }
  }, [authoring, object]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const impact = preview?.impact;
  // What the plan would leave behind, judged by the same rule the deletion itself enforces:
  // the impact minus the repairs that are already decided.
  const outstanding = useMemo(() => impact ? deletionBlockers({
    ...impact,
    incoming: impact.incoming.filter((item) => !repairs[referenceKey(item)]),
    orientation: repairOrientation ? [] : impact.orientation,
  }) : [], [impact, repairOrientation, repairs]);
  const ready = Boolean(impact) && outstanding.length === 0 && !blocked;

  async function run() {
    if (deleting) return;
    setDeleting(true); setFailure('');
    try {
      await authoring.deleteObjects({
        plan: planOf(object),
        // One decision per reference; the content operation is what gathers them per document.
        repairs: (impact?.incoming ?? []).flatMap((item) => {
          const choice = repairs[referenceKey(item)];
          return choice ? [{ object: { kind: item.from.kind, id: item.from.id }, repairs: [choice] }] : [];
        }),
        ...(repairOrientation ? { repairOrientation: true } : {}),
      });
      onDeleted();
    } catch (error) {
      // The plan is re-read before the failure is shown: what refused it may have been the
      // workspace moving under it, and the next attempt has to start from what is there now.
      setConfirming(false);
      await load();
      setFailure(message(error));
    } finally { setDeleting(false); }
  }

  return <>
    <div className="authoring-dialog-backdrop" onClick={onClose} />
    <div className="authoring-dialog authoring-delete-dialog" role="dialog" aria-modal="true"
      aria-label={`删除 ${objectLabel(content, object)}`}>
      <header>
        <div><span className="authoring-eyebrow">删除</span><strong>{objectLabel(content, object)}</strong></div>
        <button type="button" className="authoring-icon" title="取消" aria-label="关闭删除方案" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="authoring-dialog-body">
        {loading && <p role="status">正在取得删除方案…</p>}
        {failure && <p className="document-editor-error" role="alert">{failure}</p>}
        {blocked && <p className="document-references-note">{blocked}</p>}
        {preview && <DeletionPlanReport content={content} preview={preview} repairs={repairs} disabled={Boolean(blocked)}
          repairOrientation={repairOrientation} onOpenObject={onOpenObject}
          onRepair={(key, choice) => setRepairs((current) => {
            if (!choice) { const { [key]: _dropped, ...rest } = current; return rest; }
            return { ...current, [key]: choice };
          })}
          onRepairOrientation={setRepairOrientation} />}
      </div>
      <footer className="authoring-delete-commit">
        {preview && outstanding.map((stop) => <p key={stop} className="authoring-delete-stop" role="alert">{stop}</p>)}
        {preview && ready && <p className="authoring-delete-summary" role="status">{summarize(preview)}</p>}
        {confirming
          ? <div className="document-repair-actions">
            <button type="button" onClick={() => setConfirming(false)}>再看看</button>
            <button type="button" className="authoring-danger" disabled={deleting}
              onClick={() => { void run(); }}>{deleting ? '正在删除…' : `确认删除「${objectLabel(content, object)}」`}</button>
          </div>
          : <div className="document-repair-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="button" className="authoring-danger" disabled={!ready}
              onClick={() => setConfirming(true)}>执行完整删除方案</button>
          </div>}
      </footer>
    </div>
  </>;
}

function summarize({ impact, ownedFiles }: DeletionPreview): string {
  const files = Object.values(ownedFiles).flat();
  const assets = files.filter((path) => !isMarkdownPath(path)).length;
  return `${impact.scope.concepts.length} 个概念 · ${impact.scope.derivations.length} 条推导 · `
    + `${files.length} 个文件（其中 ${assets} 个资产）`
    + (impact.incoming.length ? ` · ${impact.incoming.length} 处引用修正` : '')
    + (impact.orientation.length ? ` · ${impact.orientation.length} 处开局配置修正` : '');
}

function DeletionPlanReport({ content, preview, repairs, repairOrientation, disabled, onRepair, onRepairOrientation, onOpenObject }: {
  content: WorkspaceContent;
  preview: DeletionPreview;
  repairs: Record<string, ReferenceRepairChoice>;
  repairOrientation: boolean;
  disabled?: boolean;
  onRepair: (key: string, choice: ReferenceRepairChoice | null) => void;
  onRepairOrientation: (repair: boolean) => void;
  onOpenObject: (object: ObjectRef) => void;
}) {
  const { impact, ownedFiles } = preview;
  const owners = [
    ...impact.scope.concepts.map((point) => ({ id: point.id, name: point.data.label, directory: point.data.document })),
    ...impact.scope.derivations.map((edge) => ({
      id: edge.id, name: objectLabel(content, { kind: 'derivation', id: edge.id }), directory: edge.data.document })),
  ];
  const files = Object.values(ownedFiles).flat();
  const assets = files.filter((path) => !isMarkdownPath(path));

  return <div className="authoring-delete-plan">
    <section aria-label="会被删除的对象">
      <h3><Trash2 size={14} />会被删除的对象<small>{owners.length}</small></h3>
      <ul className="authoring-delete-list">
        {impact.scope.concepts.map((point) => <li key={point.id}>
          <FileText size={13} /><strong>{point.data.label}</strong>
        </li>)}
        {impact.scope.derivations.map((edge) => <li key={edge.id}>
          <GitBranch size={13} /><strong>{objectLabel(content, { kind: 'derivation', id: edge.id })}</strong>
          {impact.scope.concepts.length > 0 && <small>少了这个端点就不成立</small>}
        </li>)}
      </ul>
    </section>

    <section aria-label="连同删除的文件">
      <h3><HardDrive size={14} />连同删除的文件<small>{files.length}</small></h3>
      {assets.length > 0 && <p className="document-references-note">含 {assets.length} 个资产。</p>}
      {owners.map((owner) => <div key={owner.id} className="authoring-delete-files">
        <p><strong>{owner.name}</strong><code>{owner.directory}/</code></p>
        <ul>
          {(ownedFiles[owner.directory] ?? []).map((path) => <li key={path}>
            {isMarkdownPath(path) ? <FileText size={12} /> : <Image size={12} />}
            <code>{path}</code>
            {!isMarkdownPath(path) && <em>资产</em>}
          </li>)}
          {!(ownedFiles[owner.directory] ?? []).length && <li><small>这个目录下没有文件</small></li>}
        </ul>
      </div>)}
    </section>

    {impact.incoming.length > 0 && <section aria-label="指向它的引用">
      <h3>指向它的引用<small>{impact.incoming.length}</small></h3>
      <ul className="document-reference-list">
        {impact.incoming.map((item) => {
          const key = referenceKey(item);
          const chosen = repairs[key];
          return <li key={key}>
            <span className="document-reference-status is-incoming">{item.reference.use === 'image' ? '共用图片' : '跨文档链接'}</span>
            <strong>{objectLabel(content, { kind: item.from.kind, id: item.from.id })}</strong>
            <code>{item.reference.raw}</code>
            {chosen
              ? <span className="document-reference-actions">
                <span className="authoring-delete-chosen">已纳入方案：{repairName(chosen, content)}</span>
                <button type="button" onClick={() => onRepair(key, null)}><Undo2 size={13} />改回未定</button>
              </span>
              : <RepairActions content={content} item={item.reference} disabled={disabled} confirmLabel="纳入方案"
                onRepair={(choice) => onRepair(key, choice)} />}
          </li>;
        })}
      </ul>
    </section>}

    {(impact.unreadable.length > 0 || impact.uncertain.length > 0 || impact.unread.length > 0) && <section aria-label="无法分析的引用来源">
      <h3><AlertTriangle size={14} />无法分析的引用来源<small>{impact.unreadable.length + impact.uncertain.length + impact.unread.length}</small></h3>
      <p className="document-references-note">每一处都在它自己那份文档里修，不在这里。</p>
      <ul className="document-reference-list">
        {impact.unreadable.map((item) => <li key={item.path}>
          <span className="document-reference-status is-unreadable">无法读取</span><code>{item.path}</code><span>{item.message}</span>
          <SourceLink content={content} documentPath={item.path} onOpenObject={onOpenObject} />
        </li>)}
        {impact.unread.map((path) => <li key={path}>
          <span className="document-reference-status is-uncertain">尚未读取</span><code>{path}</code>
          <SourceLink content={content} documentPath={path} onOpenObject={onOpenObject} />
        </li>)}
        {impact.uncertain.map((item) => <li key={`${item.documentPath}:${item.uncertainty.at.start}`}>
          <span className="document-reference-status is-uncertain">无法分析</span>
          <code>{item.documentPath}</code><span>{item.uncertainty.detail}</span>
          <SourceLink content={content} documentPath={item.documentPath} onOpenObject={onOpenObject} />
        </li>)}
      </ul>
    </section>}

    {impact.orientation.length > 0 && <section aria-label="开局配置引用">
      <h3><Compass size={14} />开局配置<small>{impact.orientation.length}</small></h3>
      <ul className="document-reference-list">
        {impact.orientation.map((item, index) => <li key={`${item.conceptId}:${index}`}>
          <span className="document-reference-status">{orientationWhere(item.at)}</span>
        </li>)}
      </ul>
      <div className="document-repair-actions">
        {repairOrientation
          ? <>
            <span className="authoring-delete-chosen">已纳入方案：从开局配置里去掉这些引用</span>
            <button type="button" onClick={() => onRepairOrientation(false)}><Undo2 size={13} />改回未定</button>
          </>
          : <button type="button" disabled={disabled} onClick={() => onRepairOrientation(true)}>一并从开局配置里去掉</button>}
      </div>
    </section>}
  </div>;
}

/** The way to the document that has to be fixed before this deletion can be judged safe. */
function SourceLink({ content, documentPath, onOpenObject }: {
  content: WorkspaceContent; documentPath: string; onOpenObject: (object: ObjectRef) => void;
}) {
  const owner = content.graph.points.find((point) => objectSourcePath(point.data) === documentPath)
    ?? content.graph.hyperedges.find((edge) => objectSourcePath(edge.data) === documentPath);
  if (!owner) return null;
  const object: ObjectRef = { kind: 'tails' in owner ? 'derivation' : 'concept', id: owner.id };
  return <span className="document-reference-actions">
    <button type="button" onClick={() => onOpenObject(object)}>去修这份文档</button>
  </span>;
}

function orientationWhere(at: ReferenceImpact['orientation'][number]['at']): string {
  if (at.field === 'seed.targets') return '默认目标';
  if (at.field === 'seed.known') return '默认已知';
  return `问题「${at.questionId}」· 选项「${at.optionId}」`;
}

function repairName(choice: ReferenceRepairChoice, content: WorkspaceContent): string {
  if (choice.action === 'unlink') return '取消链接';
  if (choice.action === 'remove') return '删除引用';
  return `改指到 ${choice.target ? objectLabel(content, choice.target) : ''}`;
}
