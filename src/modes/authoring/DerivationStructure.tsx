import { FileText, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { GraphObject } from '../../rendering';
import type { AuthoringCommands } from '../../synchronization';
import type { ConceptPoint, DerivationHyperedge } from '../../workspace/index';

/**
 * A derivation's own structure, edited where the relations pane already shows it: the
 * joint premises, the result concept and the learning cost. Selecting a concept keeps the
 * pane a navigation surface — only the derivation that is itself selected is editable, so
 * one derivation never has two editing entries (ADR-0002: a form, never a gesture).
 *
 * Premises, result and cost are one decision, so they leave as one content change on an
 * explicit save. Until then they are a draft: it protects its editing basis, and selecting
 * another object discards it. The result cannot be cleared, only replaced, so the draft
 * has no headless state to publish.
 */
export function DerivationStructure({ edge, points, authoring, draftKey, onOpen }: {
  edge: DerivationHyperedge;
  points: readonly ConceptPoint[];
  authoring: AuthoringCommands;
  draftKey: string;
  onOpen: (object: GraphObject) => void;
}) {
  const [tails, setTails] = useState<readonly string[]>(edge.tails);
  const [head, setHead] = useState(edge.head);
  const [weight, setWeight] = useState(edge.weight);
  const [picking, setPicking] = useState<'tail' | 'head' | null>(null);
  const [failure, setFailure] = useState('');

  const pointById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const label = (id: string) => pointById.get(id)?.data.label ?? id;
  const dirty = head !== edge.head || weight !== edge.weight
    || tails.length !== edge.tails.length || tails.some((id) => !edge.tails.includes(id));

  useEffect(() => { authoring.protectDraft(draftKey, dirty); }, [authoring, draftKey, dirty]);
  useEffect(() => () => { authoring.protectDraft(draftKey, false); }, [authoring, draftKey]);

  const discard = () => {
    setTails(edge.tails); setHead(edge.head); setWeight(edge.weight); setPicking(null); setFailure('');
  };
  const save = () => {
    setFailure('');
    try { authoring.updateDerivationStructure({ derivationId: edge.id, tails, head, weight }); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };

  return <div className="authoring-structure">
    <p className="authoring-structure-preview" aria-live="polite">
      {tails.length ? tails.map(label).join(' + ') : '空前提'} → {label(head)} · 成本 {weight}
    </p>

    <section className="authoring-relations">
      <header>
        <div><span className="authoring-eyebrow">这条推导</span><h2>联合前提 <small>{tails.length}</small></h2></div>
        <button type="button" className="authoring-icon" title="添加前提概念" aria-label="添加前提概念"
          onClick={() => setPicking(picking === 'tail' ? null : 'tail')}><Plus size={13} /></button>
      </header>
      {picking === 'tail' && <ConceptPicker points={points} exclude={tails} label="添加前提概念"
        onPick={(id) => { setTails([...tails, id]); setPicking(null); }} onClose={() => setPicking(null)} />}
      <div className="authoring-structure-items">
        {tails.map((id) => <div className="authoring-structure-item is-tail" key={id}>
          <button type="button" onClick={() => onOpen({ kind: 'concept', id })}><FileText size={13} />{label(id)}</button>
          <button type="button" className="authoring-icon" title={`移除前提 ${label(id)}`} aria-label={`移除前提 ${label(id)}`}
            onClick={() => setTails(tails.filter((tail) => tail !== id))}><X size={13} /></button>
        </div>)}
        {!tails.length && <p className="authoring-empty-note">空前提</p>}
      </div>
    </section>

    <section className="authoring-relations">
      <header>
        <div><span className="authoring-eyebrow">这条推导</span><h2>结果概念 <small>1</small></h2></div>
        <button type="button" className="authoring-icon" title="更换结果概念" aria-label="更换结果概念"
          onClick={() => setPicking(picking === 'head' ? null : 'head')}><Search size={13} /></button>
      </header>
      {picking === 'head' && <ConceptPicker points={points} exclude={[]} label="更换结果概念"
        onPick={(id) => { setHead(id); setPicking(null); }} onClose={() => setPicking(null)} />}
      <div className="authoring-structure-items">
        <div className="authoring-structure-item is-head">
          <button type="button" onClick={() => onOpen({ kind: 'concept', id: head })}><FileText size={13} />{label(head)}</button>
        </div>
      </div>
    </section>

    <section className="authoring-relations">
      <header><div><span className="authoring-eyebrow">这条推导</span><h2>学习成本</h2></div></header>
      <div className="authoring-structure-items">
        <input className="authoring-structure-weight" type="number" min="0" step="0.5" value={weight} aria-label="学习成本"
          onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0) setWeight(value); }} />
      </div>
    </section>

    <div className="authoring-structure-commit">
      {failure && <p className="authoring-form-error" role="alert">{failure}</p>}
      <span aria-live="polite">{dirty ? '有未保存的修改' : '与有效内容一致'}</span>
      <button type="button" disabled={!dirty} onClick={discard}>放弃更改</button>
      <button type="button" className="authoring-primary" disabled={!dirty} onClick={save}>保存更改</button>
    </div>
  </div>;
}

/** Search a graph too large to scan, then pick one concept. */
function ConceptPicker({ points, exclude, label, onPick, onClose }: {
  points: readonly ConceptPoint[]; exclude: readonly string[]; label: string;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const needle = query.trim().toLowerCase();
  const hits = points.filter((point) => !exclude.includes(point.id)
    && (!needle || point.data.label.toLowerCase().includes(needle) || point.id.toLowerCase().includes(needle))).slice(0, 8);
  return <div className="authoring-structure-picker">
    <span className="ws-input"><Search size={14} aria-hidden="true" />
      <input autoFocus type="search" value={query} placeholder="搜索概念" aria-label={`${label}搜索`}
        onChange={(event) => setQuery(event.target.value)} />
    </span>
    <div role="listbox" aria-label={`${label}候选`}>
      {hits.map((point) => <button type="button" role="option" aria-selected={false} key={point.id} onClick={() => onPick(point.id)}>
        <FileText size={13} />{point.data.label}<small>{point.id}</small>
      </button>)}
      {!hits.length && <p className="authoring-empty-note">没有匹配的概念</p>}
    </div>
  </div>;
}
