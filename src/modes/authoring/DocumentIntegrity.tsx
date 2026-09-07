import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, FileWarning, Link2Off, ScanSearch, Trash2, Waypoints } from 'lucide-react';
import {
  documentReferences, isBrokenReference, isDeletionSafe,
  type DocumentReferenceItem, type ObjectRef, type ReferenceImpact, type ReferenceRepairAction,
  type SourceRange, type WorkspaceContent,
} from '../../workspace/index';
import type { AuthoringCommands } from '../../synchronization';
import { derivationTitle, objectLabel } from './ObjectMetadata';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * A missing or damaged object document keeps its graph browsable and gets an explicit way
 * back. Nothing here happens on opening or saving: the empty document is written because
 * this button was pressed, and the current bytes of an unreadable file are only replaced
 * after that is confirmed on its own.
 */
export function DamagedDocumentRepair({ path, detail, onRestore }: {
  path: string; detail: string; onRestore?: (overwriteDamaged: boolean) => void;
}) {
  const [confirming, setConfirming] = useState<'create' | 'overwrite' | null>(null);
  const [failure, setFailure] = useState('');
  const restore = (overwriteDamaged: boolean) => {
    setFailure('');
    try { onRestore?.(overwriteDamaged); setConfirming(null); }
    catch (error) { setFailure(message(error)); }
  };
  return <section className="document-repair" role="alert" aria-label="对象文档修复">
    <header><FileWarning size={17} /><div><strong>无法读取对象文档</strong><p>{detail}</p><code>{path}</code></div></header>
    <p className="document-repair-note">图和其它文档不受影响。应用不会在打开或保存时替你补上一个空文档——修复是一次明确的选择。</p>
    {failure && <p className="document-editor-error">{failure}</p>}
    {onRestore && (confirming === null
      ? <div className="document-repair-actions">
        <button type="button" className="authoring-primary" onClick={() => setConfirming('create')}>创建空文档</button>
        <button type="button" onClick={() => setConfirming('overwrite')}>覆盖损坏的文档</button>
      </div>
      : <div className="document-repair-confirm">
        <p>{confirming === 'create'
          ? '将新建一个空的 document.md。如果这个文件其实存在，修复会被拒绝，不会覆盖它。'
          : '将用一个空文档覆盖现在读不出来的文件。它当前的内容不会被找回。'}</p>
        <div className="document-repair-actions">
          <button type="button" className="authoring-primary" onClick={() => restore(confirming === 'overwrite')}>
            {confirming === 'create' ? '确认创建空文档' : '确认覆盖'}
          </button>
          <button type="button" onClick={() => { setConfirming(null); setFailure(''); }}>取消</button>
        </div>
      </div>)}
  </section>;
}

type RepairChoice = { at: SourceRange; action: ReferenceRepairAction; target?: ObjectRef };

/**
 * What this document points at, and what points at it. Repairs go through the shared
 * authoring commands, so a repair is an ordinary content change: previewed and saved by
 * the same synchronization the editor uses.
 */
export function DocumentReferences({ content, object, sourcePath, source, authoring, blocked }: {
  content: WorkspaceContent; object: ObjectRef; sourcePath: string; source: string;
  authoring?: AuthoringCommands;
  /** An unapplied draft: repairs would be written against a body the author is replacing. */
  blocked?: string;
}) {
  const report = useMemo(() => documentReferences(content, sourcePath, source), [content, sourcePath, source]);
  const broken = report.references.filter(isBrokenReference);
  const undecided = report.references.filter((item) => item.status === 'unknown');
  const [failure, setFailure] = useState('');
  const [impact, setImpact] = useState<ReferenceImpact | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!authoring) return;
    setChecking(true); setFailure('');
    try {
      const preview = await authoring.deletionPreview(object.kind === 'concept'
        ? { conceptIds: [object.id] } : { derivationIds: [object.id] });
      setImpact(preview.impact);
    } catch (error) { setFailure(message(error)); }
    finally { setChecking(false); }
  }, [authoring, object.id, object.kind]);

  const repair = (owner: ObjectRef, choice: RepairChoice) => {
    setFailure('');
    try {
      authoring?.repairReferences({ object: owner, repairs: [choice] });
      if (impact) void check();
    } catch (error) { setFailure(message(error)); }
  };

  return <section className="document-references" aria-label="文档引用">
    <header>
      <Waypoints size={15} />
      <strong>文档引用</strong>
      <small>{report.references.length} 处引用 · {broken.length} 处无法解析 · {undecided.length} 处待确认 · {report.uncertainties.length} 处无法分析</small>
      <span className="authoring-flex" />
      {authoring && <button type="button" onClick={() => { void check(); }} disabled={checking}>
        <ScanSearch size={14} />{checking ? '正在检查…' : '引用影响'}
      </button>}
    </header>
    {blocked && <p className="document-references-note">{blocked}</p>}
    {failure && <p className="document-editor-error" role="alert">{failure}</p>}
    {broken.length > 0 && <ul className="document-reference-list" aria-label="无法解析的引用">
      {broken.map((item) => <li key={item.at.start}>
        <ReferenceLine item={item} />
        <RepairActions content={content} item={item} disabled={!authoring || Boolean(blocked)}
          onRepair={(choice) => repair(object, choice)} />
      </li>)}
    </ul>}
    {report.uncertainties.length > 0 && <ul className="document-reference-list" aria-label="无法分析的引用来源">
      {report.uncertainties.map((item) => <li key={item.at.start}>
        <span className="document-reference-status is-uncertain"><AlertTriangle size={13} />无法分析</span>
        <span>{item.detail}</span>
      </li>)}
    </ul>}
    {impact && <ReferenceImpactReport content={content} impact={impact} disabled={!authoring}
      onRepair={(owner, choice) => repair(owner, choice)} />}
  </section>;
}

function ReferenceLine({ item }: { item: DocumentReferenceItem }) {
  return <>
    <span className={`document-reference-status is-${item.status}`}>
      {item.status === 'dangling' ? '指向不存在的对象' : item.status === 'unsupported' ? '不受支持的地址' : item.status}
    </span>
    <code>{item.raw}</code>
    <span>{item.message}</span>
  </>;
}

/**
 * Three named decisions. There is no "fix it" that picks one of them for the author.
 * `confirmLabel` says what confirming means where it is used: repairing one reference now,
 * or writing that decision into a deletion plan that carries it out later.
 */
export function RepairActions({ content, item, disabled, confirmLabel, onRepair }: {
  content: WorkspaceContent; item: DocumentReferenceItem; disabled?: boolean; confirmLabel?: string;
  onRepair: (choice: RepairChoice) => void;
}) {
  const [confirming, setConfirming] = useState<ReferenceRepairAction | null>(null);
  const [targetId, setTargetId] = useState('');
  const targets = useMemo(() => [
    ...content.graph.points.map((point) => ({ kind: 'concept' as const, id: point.id, label: point.data.label })),
    ...content.graph.hyperedges.map((edge) => ({ kind: 'derivation' as const, id: edge.id, label: derivationTitle(content.graph, edge) })),
  ], [content.graph]);
  const target = targets.find(({ id }) => id === targetId);
  if (disabled) return null;
  if (confirming === null) {
    return <div className="document-reference-actions">
      <button type="button" onClick={() => setConfirming('retarget')} aria-label={`改指 ${item.raw}`}>改指到…</button>
      {item.use === 'link' && item.syntax !== 'markdown-definition'
        && <button type="button" onClick={() => setConfirming('unlink')} aria-label={`取消链接 ${item.raw}`}><Link2Off size={13} />取消链接</button>}
      <button type="button" onClick={() => setConfirming('remove')} aria-label={`删除引用 ${item.raw}`}><Trash2 size={13} />删除引用</button>
    </div>;
  }
  return <div className="document-reference-actions">
    {confirming === 'retarget'
      ? <><label>改指到<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
        <option value="">选择对象</option>
        {targets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
      </select></label>
      <button type="button" className="authoring-primary" disabled={!target}
        onClick={() => { onRepair({ at: item.at, action: 'retarget', target: target && { kind: target.kind, id: target.id } }); setConfirming(null); }}>{confirmLabel ?? '确认改指'}</button></>
      : <><span>{confirming === 'unlink' ? '链接会变成它原来的文字，链接目标不再保留。'
        : item.syntax === 'markdown-definition' ? '引用定义会被删掉；正文里用到这个标签的地方会变成普通文字。'
          : item.use === 'image' ? '这张图片会从这份文档里去掉。' : '整个链接连同文字一起去掉。'}</span>
      <button type="button" className="authoring-primary"
        onClick={() => { onRepair({ at: item.at, action: confirming }); setConfirming(null); }}>{confirmLabel ?? '确认修正'}</button></>}
    <button type="button" onClick={() => setConfirming(null)}>取消</button>
  </div>;
}

/**
 * What a deletion of this object would break. An impact that could not read every source
 * says so: an unreadable document is not evidence that nothing references this one.
 */
function ReferenceImpactReport({ content, impact, disabled, onRepair }: {
  content: WorkspaceContent; impact: ReferenceImpact; disabled?: boolean;
  onRepair: (owner: ObjectRef, choice: RepairChoice) => void;
}) {
  return <div className="document-reference-impact" aria-label="引用影响">
    <p className={isDeletionSafe(impact) ? 'is-complete' : 'is-incomplete'}>
      {`删除会连带 ${impact.scope.concepts.length} 个概念与 ${impact.scope.derivations.length} 条推导。`}
      {!impact.complete
        ? '有引用来源无法读取或无法分析，因此不能认定删除是安全的。先修好这些来源，再决定删除。'
        : isDeletionSafe(impact)
          ? '已读取全部引用来源，没有其它内容指向它。'
          : `已读取全部引用来源；还有 ${impact.incoming.length + impact.orientation.length} 处引用指向它，删除前需要逐条修正或确认一份包含它们的完整方案。`}
    </p>
    {impact.incoming.length > 0 && <ul className="document-reference-list" aria-label="其它文档中的引用">
      {impact.incoming.map((item) => <li key={`${item.from.documentPath}:${item.reference.at.start}`}>
        <span className="document-reference-status is-incoming">{item.reference.use === 'image' ? '共享图片' : '跨文档链接'}</span>
        <strong>{objectLabel(content, item.from)}</strong>
        <code>{item.reference.raw}</code>
        <RepairActions content={content} item={item.reference} disabled={disabled}
          onRepair={(choice) => onRepair({ kind: item.from.kind, id: item.from.id }, choice)} />
      </li>)}
    </ul>}
    {impact.unreadable.length > 0 && <ul className="document-reference-list" aria-label="无法读取的引用来源">
      {impact.unreadable.map((item) => <li key={item.path}>
        <span className="document-reference-status is-unreadable"><AlertTriangle size={13} />无法读取</span>
        <code>{item.path}</code><span>{item.message}</span>
      </li>)}
    </ul>}
    {impact.uncertain.length > 0 && <ul className="document-reference-list" aria-label="无法分析的引用来源">
      {impact.uncertain.map((item) => <li key={`${item.documentPath}:${item.uncertainty.at.start}`}>
        <span className="document-reference-status is-uncertain"><AlertTriangle size={13} />无法分析</span>
        <code>{item.documentPath}</code><span>{item.uncertainty.detail}</span>
      </li>)}
    </ul>}
    {impact.orientation.length > 0 && <p className="document-references-note">
      开局配置有 {impact.orientation.length} 处引用这个概念，需要在开局视图里一并修正。
    </p>}
  </div>;
}
