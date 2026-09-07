import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AuthoringCommands } from '../../synchronization';
import {
  conceptTags, type ConceptPoint, type DerivationHyperedge, type TagDeclaration, type WorkspaceGraph,
} from '../../workspace/index';
import { TagChips } from '../TagChips';

export type ObjectMetadataProps = {
  readonly object: { readonly kind: 'concept'; readonly point: ConceptPoint }
    | { readonly kind: 'derivation'; readonly edge: DerivationHyperedge };
  readonly graph: WorkspaceGraph;
  readonly tags: readonly TagDeclaration[];
  readonly authoring?: AuthoringCommands;
  /** Opens the deletion plan at the foot of the page; it is never carried out from here. */
  readonly onDelete?: () => void;
};

/**
 * The object's own metadata, one property per line, above its document. A name that reads
 * as the title, a one-line description, and the tags — nothing that only a machine needs.
 */
export function ObjectMetadata({ object, graph, tags, authoring, onDelete }: ObjectMetadataProps) {
  const id = object.kind === 'concept' ? object.point.id : object.edge.id;
  const data = object.kind === 'concept' ? object.point.data : object.edge.data;
  const [failure, setFailure] = useState('');

  const apply = (action: () => void) => {
    setFailure('');
    try { action(); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  const save = (patch: { label?: string; description?: string }) =>
    apply(() => authoring?.updateObjectMetadata({ object: { kind: object.kind, id }, ...patch }));

  return <header className="authoring-object-metadata">
    <div className="authoring-object-title">
      <TextLine value={data.label ?? ''} placeholder={object.kind === 'concept' ? '概念名称' : endpointName(graph, object.kind === 'derivation' ? object.edge : undefined)}
        label="名称" editable={Boolean(authoring)} className="authoring-title-line" onCommit={(label) => save({ label })} />
      {onDelete && <button type="button" className="authoring-icon authoring-title-delete" title="删除这个对象"
        aria-label="删除这个对象" onClick={onDelete}><Trash2 size={15} /></button>}
      <span className="authoring-status-ready">有效内容</span>
    </div>

    <TextLine value={data.description ?? ''} placeholder="加一句话，说明它在这张图里担什么角色"
      label="说明" editable={Boolean(authoring)} className="authoring-description-line"
      onCommit={(description) => save({ description })} />

    {object.kind === 'concept' && <div className="authoring-tag-line">
      {authoring
        ? <>
          <TagChips label={`${data.label ?? id} 的标签`} tags={tags} selected={conceptTags(object.point)}
            emptyNote="" onChange={(next) => apply(() => authoring.updateConceptTags({ conceptId: id, tags: next }))} />
          <NewTag tags={tags} attached={conceptTags(object.point)} conceptId={id} authoring={authoring} onFailure={setFailure} />
        </>
        : <TagChips label={`${data.label ?? id} 的标签`} tags={tags.filter((tag) => conceptTags(object.point).includes(tag.id))}
          selected={conceptTags(object.point)} onChange={() => {}} emptyNote="没有标签" />}
    </div>}

    {failure && <p className="authoring-form-error" role="alert">{failure}</p>}
  </header>;
}

/** Reads as text until it is clicked; the value is committed on blur or Enter. */
function TextLine({ value, placeholder, label, editable, className, onCommit }: {
  value: string; placeholder: string; label: string; editable: boolean; className: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (!editable) return <p className={className}>{value || placeholder}</p>;
  return <input className={className} value={draft} aria-label={label} placeholder={placeholder}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => { if (draft !== value) onCommit(draft); }}
    onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') { setDraft(value); event.currentTarget.blur(); }
    }} />;
}

function NewTag({ tags, attached, conceptId, authoring, onFailure }: {
  tags: readonly TagDeclaration[]; attached: readonly string[]; conceptId: string;
  authoring: AuthoringCommands; onFailure: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const declare = () => {
    onFailure('');
    try {
      const label = name.trim();
      const id = label.toLowerCase().replace(/\s+/g, '-');
      if (tags.some((tag) => tag.id === id)) throw new Error(`标签「${id}」已经存在`);
      authoring.updateTagDeclarations([...tags, { id, label }]);
      authoring.updateConceptTags({ conceptId, tags: [...attached, id] });
      setName(''); setOpen(false);
    } catch (error) { onFailure(error instanceof Error ? error.message : String(error)); }
  };
  if (!open) return <button type="button" className="authoring-quiet-action" onClick={() => setOpen(true)}>
    <Plus size={12} />{tags.length ? '新标签' : '加标签'}
  </button>;
  return <input className="authoring-new-tag" autoFocus value={name} aria-label="新标签名称" placeholder="新标签名称"
    onChange={(event) => setName(event.target.value)}
    onBlur={() => { if (!name.trim()) setOpen(false); }}
    onKeyDown={(event) => {
      if (event.key === 'Enter' && name.trim()) declare();
      if (event.key === 'Escape') { setName(''); setOpen(false); }
    }} />;
}

export function endpointName(graph: WorkspaceGraph, edge?: DerivationHyperedge): string {
  if (!edge) return '';
  const label = (id: string) => graph.points.find((point) => point.id === id)?.data.label ?? id;
  const tails = edge.tails.length ? edge.tails.map(label).join(' + ') : '空前提';
  return `${tails} → ${label(edge.head)}`;
}

/** A derivation reads from its endpoints until the author names it. */
export function derivationTitle(graph: WorkspaceGraph, edge: DerivationHyperedge): string {
  return edge.data.label?.trim() || endpointName(graph, edge);
}
