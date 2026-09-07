import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Compass, FileText, GitBranch, HardDrive, Image, Trash2, Undo2 } from 'lucide-react';
import type {
  DeletionPlan, ObjectRef, ReferenceImpact, ReferenceRepairChoice, WorkspaceContent,
} from '../../workspace/index';
import type { AuthoringCommands, DeletionPreview } from '../../synchronization';
import { RepairActions } from './DocumentIntegrity';
import { derivationTitle } from './ObjectMetadata';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

const planOf = (object: ObjectRef): DeletionPlan =>
  object.kind === 'concept' ? { conceptIds: [object.id] } : { derivationIds: [object.id] };

const referenceKey = (item: ReferenceImpact['incoming'][number]) =>
  `${item.from.kind}:${item.from.id}:${item.reference.at.start}`;

/**
 * Deleting an object, as the last thing the object page says about it. It sits under the
 * reference report because it is the same question one step further: that report says what
 * points at this object, and this says what goes when it goes.
 *
 * Nothing here is a shortcut. The plan is assembled first — the derivations that cannot
 * survive it, every file the host reports under its directories, the references that would
 * be broken and the orientation configuration that names it — and the repairs the author
 * picks are carried out by the same deletion, in one change. A reference source that could
 * not be read leaves the object exactly where it is, with this entry still on it.
 */
export function DeleteObject({ content, object, authoring, open, onOpen, onClose, onDeleted, blocked }: {
  content: WorkspaceContent;
  object: ObjectRef;
  authoring: AuthoringCommands;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDeleted: () => void;
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

  useEffect(() => {
    setPreview(null); setRepairs({}); setRepairOrientation(false); setConfirming(false); setFailure('');
    if (open) void load();
  }, [load, open]);

  const impact = preview?.impact;
  const outstanding = useMemo(() => {
    if (!impact) return [];
    const stops: string[] = [];
    if (!impact.complete) {
      stops.push('有引用来源没有读到或无法分析。读不出来不等于没有引用，先把这些来源修好，再决定删除。');
    }
    const remaining = impact.incoming.filter((item) => !repairs[referenceKey(item)]);
    if (remaining.length) stops.push(`还有 ${remaining.length} 处引用指向要删的内容，每一处都要自己选一种改法。`);
    if (impact.orientation.length && !repairOrientation) {
      stops.push(`开局配置有 ${impact.orientation.length} 处引用这个概念，需要一并纳入方案。`);
    }
    return stops;
  }, [impact, repairOrientation, repairs]);
  const ready = Boolean(impact) && outstanding.length === 0 && !blocked;

  async function run() {
    if (deleting) return;
    setDeleting(true); setFailure('');
    try {
      const byObject = new Map<string, { object: ObjectRef; repairs: ReferenceRepairChoice[] }>();
      for (const item of impact?.incoming ?? []) {
        const choice = repairs[referenceKey(item)];
        if (!choice) continue;
        const key = `${item.from.kind}:${item.from.id}`;
        const entry = byObject.get(key) ?? { object: { kind: item.from.kind, id: item.from.id }, repairs: [] };
        entry.repairs.push(choice);
        byObject.set(key, entry);
      }
      await authoring.deleteObjects({
        plan: planOf(object),
        repairs: [...byObject.values()],
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

  return <section className={`authoring-delete ${open ? 'is-open' : ''}`} aria-label="删除这个对象">
    <header><Trash2 size={15} /><strong>删除这个对象</strong></header>
    {!open
      ? <>
        <p className="authoring-delete-lead">
          删除会连同它的所属文档与全部资产一起进行，并要求先处理指向它的引用。
        </p>
        <div className="document-repair-actions">
          <button type="button" onClick={onOpen}>查看删除方案…</button>
        </div>
      </>
      : <>
        {loading && <p role="status">正在取得删除方案…</p>}
        {failure && <p className="document-editor-error" role="alert">{failure}</p>}
        {blocked && <p className="document-references-note">{blocked}</p>}
        {preview && <DeletionPlanReport content={content} preview={preview} repairs={repairs} disabled={Boolean(blocked)}
          repairOrientation={repairOrientation}
          onRepair={(key, choice) => setRepairs((current) => {
            if (!choice) { const { [key]: _dropped, ...rest } = current; return rest; }
            return { ...current, [key]: choice };
          })}
          onRepairOrientation={setRepairOrientation} />}
        <footer className="authoring-delete-commit">
          {preview && outstanding.map((stop) => <p key={stop} className="authoring-delete-stop" role="alert">{stop}</p>)}
          {ready && <p className="authoring-delete-summary" role="status">{summarize(preview!)}</p>}
          {confirming
            ? <div className="document-repair-actions">
              <span className="authoring-delete-note">一次提交：图、所属文件与引用修正一起写入，不留孤儿文件。</span>
              <button type="button" onClick={() => setConfirming(false)}>再看看</button>
              <button type="button" className="authoring-danger" disabled={deleting}
                onClick={() => { void run(); }}>{deleting ? '正在删除…' : `确认删除「${label(content, object)}」`}</button>
            </div>
            : <div className="document-repair-actions">
              <button type="button" onClick={onClose}>取消</button>
              <button type="button" className="authoring-danger" disabled={!ready}
                onClick={() => setConfirming(true)}>执行完整删除方案</button>
            </div>}
        </footer>
      </>}
  </section>;
}

function label(content: WorkspaceContent, object: ObjectRef): string {
  if (object.kind === 'concept') {
    return content.graph.points.find((point) => point.id === object.id)?.data.label ?? object.id;
  }
  const edge = content.graph.hyperedges.find((item) => item.id === object.id);
  return edge ? derivationTitle(content.graph, edge) : object.id;
}

function summarize({ impact, ownedFiles }: DeletionPreview): string {
  const files = Object.values(ownedFiles).flat();
  const assets = files.filter((path) => !path.toLowerCase().endsWith('.md')).length;
  return `${impact.scope.concepts.length} 个概念 · ${impact.scope.derivations.length} 条推导 · `
    + `${files.length} 个文件（其中 ${assets} 个资产）`
    + (impact.incoming.length ? ` · ${impact.incoming.length} 处引用修正` : '')
    + (impact.orientation.length ? ` · ${impact.orientation.length} 处开局配置修正` : '');
}

function DeletionPlanReport({ content, preview, repairs, repairOrientation, disabled, onRepair, onRepairOrientation }: {
  content: WorkspaceContent;
  preview: DeletionPreview;
  repairs: Record<string, ReferenceRepairChoice>;
  repairOrientation: boolean;
  disabled?: boolean;
  onRepair: (key: string, choice: ReferenceRepairChoice | null) => void;
  onRepairOrientation: (repair: boolean) => void;
}) {
  const { impact, ownedFiles } = preview;
  const owners = [
    ...impact.scope.concepts.map((point) => ({ id: point.id, name: point.data.label, directory: point.data.document })),
    ...impact.scope.derivations.map((edge) => ({ id: edge.id, name: derivationTitle(content.graph, edge), directory: edge.data.document })),
  ];
  const files = Object.values(ownedFiles).flat();
  const assets = files.filter((path) => !path.toLowerCase().endsWith('.md'));

  return <div className="authoring-delete-plan">
    <section aria-label="会被删除的对象">
      <h3><Trash2 size={14} />会被删除的对象<small>{owners.length}</small></h3>
      <ul className="authoring-delete-list">
        {impact.scope.concepts.map((point) => <li key={point.id}>
          <FileText size={13} /><strong>{point.data.label}</strong><small>概念</small>
        </li>)}
        {impact.scope.derivations.map((edge) => <li key={edge.id}>
          <GitBranch size={13} /><strong>{derivationTitle(content.graph, edge)}</strong>
          <small>{impact.scope.concepts.length ? '推导 · 少了这个端点就不成立' : '推导'}</small>
        </li>)}
      </ul>
    </section>

    <section aria-label="连同删除的文件">
      <h3><HardDrive size={14} />连同删除的文件<small>{files.length}</small></h3>
      {assets.length > 0 && <p className="document-references-note">
        含 {assets.length} 个资产，其中可能有正文早已不再引用的文件——这份清单来自宿主，不是正文扫描。
      </p>}
      {owners.map((owner) => <div key={owner.id} className="authoring-delete-files">
        <p><strong>{owner.name}</strong><code>{owner.directory}/</code></p>
        <ul>
          {(ownedFiles[owner.directory] ?? []).map((path) => <li key={path}>
            {path.toLowerCase().endsWith('.md') ? <FileText size={12} /> : <Image size={12} />}
            <code>{path}</code>
            {!path.toLowerCase().endsWith('.md') && <em>资产</em>}
          </li>)}
          {!(ownedFiles[owner.directory] ?? []).length && <li><small>这个目录下没有文件</small></li>}
        </ul>
      </div>)}
      <p className="document-references-note">别的对象目录、工作区里其它文件和外部地址都不在这份清单里。</p>
    </section>

    {impact.incoming.length > 0 && <section aria-label="指向它的引用">
      <h3>指向它的引用<small>{impact.incoming.length}</small></h3>
      <p className="document-references-note">
        每一处都要自己选一种改法。应用不会替你挑，也不会顺手把别的文档里的链接退成文字。
      </p>
      <ul className="document-reference-list">
        {impact.incoming.map((item) => {
          const key = referenceKey(item);
          const chosen = repairs[key];
          return <li key={key}>
            <span className="document-reference-status is-incoming">{item.reference.use === 'image' ? '共用图片' : '跨文档链接'}</span>
            <strong>{label(content, { kind: item.from.kind, id: item.from.id })}</strong>
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
      <p className="document-references-note">
        读不出来的文档不能当成「没有引用」。它修好之前，这个对象保留在这里，管理入口也不撤。
      </p>
      <ul className="document-reference-list">
        {impact.unreadable.map((item) => <li key={item.path}>
          <span className="document-reference-status is-unreadable">无法读取</span><code>{item.path}</code><span>{item.message}</span>
        </li>)}
        {impact.unread.map((path) => <li key={path}>
          <span className="document-reference-status is-uncertain">尚未读取</span><code>{path}</code>
        </li>)}
        {impact.uncertain.map((item) => <li key={`${item.documentPath}:${item.uncertainty.at.start}`}>
          <span className="document-reference-status is-uncertain">无法分析</span>
          <code>{item.documentPath}</code><span>{item.uncertainty.detail}</span>
        </li>)}
      </ul>
    </section>}

    {impact.orientation.length > 0 && <section aria-label="开局配置引用">
      <h3><Compass size={14} />开局配置<small>{impact.orientation.length}</small></h3>
      <p className="document-references-note">
        删掉这个概念，开局配置里按名字存着它的地方就会悬空，整份配置失效。
      </p>
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

function orientationWhere(at: ReferenceImpact['orientation'][number]['at']): string {
  if (at.field === 'seed.targets') return '默认目标';
  if (at.field === 'seed.known') return '默认已知';
  return `问题「${at.questionId}」· 选项「${at.optionId}」`;
}

function repairName(choice: ReferenceRepairChoice, content: WorkspaceContent): string {
  if (choice.action === 'unlink') return '取消链接';
  if (choice.action === 'remove') return '删除引用';
  return `改指到 ${choice.target ? label(content, choice.target) : ''}`;
}
