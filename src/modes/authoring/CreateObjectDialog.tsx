import { FileText, GitBranch, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AuthoringCommands } from '../../synchronization';
import { type ConceptPoint, type WorkspaceGraph } from '../../workspace/index';
import { derivationTitle } from './ObjectMetadata';

/**
 * The single creation entry of the authoring workbench. It opens on a kind choice —
 * concept or derivation — because the two forms share nothing but the verb. Opening
 * with a preset skips the choice and starts the derivation form with the current
 * concept already selected as a premise or as the conclusion; selection is help,
 * never an automatic creation. Closing discards the draft and its protection.
 */
export type CreateObjectRequest =
  | { readonly step: 'kind' }
  | { readonly step: 'concept' }
  | { readonly step: 'derivation'; readonly prefill?: { readonly conceptId: string; readonly role: 'tail' | 'head' } };

type DerivationDraft = { tails: string[]; head: string | null; weight: number };

export function CreateObjectDialog({ graph, authoring, request, draftKey, onClose, onCreated }: {
  graph: WorkspaceGraph;
  authoring: AuthoringCommands;
  request: CreateObjectRequest;
  draftKey: string;
  onClose: () => void;
  /** The object was created; the caller opens its document editor. */
  onCreated: (object: { kind: 'concept' | 'derivation'; id: string }) => void;
}) {
  const [step, setStep] = useState<'kind' | 'concept' | 'derivation'>(request.step);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<DerivationDraft>(() => request.step === 'derivation' && request.prefill
    ? { tails: request.prefill.role === 'tail' ? [request.prefill.conceptId] : [], head: request.prefill.role === 'head' ? request.prefill.conceptId : null, weight: 1 }
    : { tails: [], head: null, weight: 1 });
  const [failure, setFailure] = useState('');

  const dirty = step === 'concept' ? Boolean(name.trim()) : step === 'derivation' && (draft.tails.length > 0 || draft.head !== null);
  useEffect(() => { authoring.protectDraft(draftKey, dirty); }, [authoring, draftKey, dirty]);
  useEffect(() => () => { authoring.protectDraft(draftKey, false); }, [authoring, draftKey]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pointById = useMemo(() => new Map(graph.points.map((point) => [point.id, point])), [graph.points]);
  const createConcept = () => {
    const label = name.trim();
    if (!label) return;
    try {
      onCreated({ kind: 'concept', id: authoring.createConcept({ label }) });
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  const createDerivation = () => {
    if (!draft.head) return;
    try {
      onCreated({ kind: 'derivation', id: authoring.createDerivation({ tails: draft.tails, head: draft.head, weight: draft.weight }) });
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  const previewEdge = { id: '', weight: draft.weight, tails: draft.tails, head: draft.head ?? '', data: { document: '' } };

  return <>
    <div className="authoring-dialog-backdrop" onClick={onClose} />
    <div className="authoring-dialog" role="dialog" aria-modal="true" aria-label="新建对象">
      <header>
        <div><span className="authoring-eyebrow">创建</span>
          <strong>{step === 'kind' ? '新建对象' : step === 'concept' ? '新建概念' : '新建推导'}</strong></div>
        <button type="button" className="authoring-icon" title="取消" aria-label="关闭新建对象" onClick={onClose}><X size={16} /></button>
      </header>
      {step === 'kind' && <div className="authoring-kind-choice">
        <button type="button" className="authoring-kind-card" onClick={() => setStep('concept')}>
          <FileText size={26} strokeWidth={1.4} />
          <strong>概念</strong>
          <small>一个名字和一份文档，其余在对象页补齐</small>
        </button>
        <button type="button" className="authoring-kind-card" disabled={!graph.points.length} onClick={() => setStep('derivation')}>
          <GitBranch size={26} strokeWidth={1.4} />
          <strong>推导</strong>
          <small>{graph.points.length ? '联合前提推出结论，附学习成本' : '图里还没有概念可作端点'}</small>
        </button>
      </div>}
      {step === 'concept' && <div className="authoring-dialog-body">
        <label className="authoring-form-field">概念名称
          <input value={name} autoFocus placeholder="输入名称后回车" aria-label="概念名称"
            onChange={(event) => { setName(event.target.value); setFailure(''); }}
            onKeyDown={(event) => { if (event.key === 'Enter') createConcept(); }} />
        </label>
        {failure && <p className="authoring-form-error" role="alert">{failure}</p>}
        <footer>
          <button type="button" onClick={() => setStep('kind')}>返回</button>
          <button type="button" className="authoring-primary" disabled={!name.trim()} onClick={createConcept}><FileText size={14} />创建概念</button>
        </footer>
      </div>}
      {step === 'derivation' && <div className="authoring-dialog-body">
        <p className="authoring-create-preview" aria-live="polite">{derivationTitle(graph, previewEdge)}</p>
        <div className="authoring-create-columns">
          <ConceptPicker label="前提集合（可多选，可为空）" tone="tail" points={graph.points} pointById={pointById}
            selected={draft.tails} onToggle={(id) => setDraft((current) => ({
              ...current, tails: current.tails.includes(id) ? current.tails.filter((tail) => tail !== id) : [...current.tails, id],
            }))} />
          <ConceptPicker label="结论（单选，必填）" tone="head" points={graph.points} pointById={pointById}
            selected={draft.head ? [draft.head] : []} onToggle={(id) => setDraft((current) => ({ ...current, head: current.head === id ? null : id }))} />
        </div>
        <label className="authoring-form-field">学习成本
          <input type="number" min="0" step="0.5" value={draft.weight} aria-label="学习成本"
            onChange={(event) => { const value = Number(event.target.value); setDraft((current) => ({ ...current, weight: Number.isFinite(value) && value >= 0 ? value : current.weight })); }} />
        </label>
        {failure && <p className="authoring-form-error" role="alert">{failure}</p>}
        <footer>
          <button type="button" onClick={() => setStep('kind')}>返回</button>
          <button type="button" className="authoring-primary" disabled={!draft.head} onClick={createDerivation}><GitBranch size={14} />创建推导</button>
        </footer>
      </div>}
    </div>
  </>;
}

/** Search for a concept in a graph too large to scan, then pick it. */
function ConceptPicker({ label, tone, points, pointById, selected, onToggle }: {
  label: string; tone: 'tail' | 'head'; points: readonly ConceptPoint[];
  pointById: Map<string, ConceptPoint>; selected: readonly string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const hits = useMemo(() => {
    const matches = needle
      ? points.filter((point) => point.data.label?.toLowerCase().includes(needle) || point.id.toLowerCase().includes(needle))
      : points;
    return matches.slice(0, 12);
  }, [needle, points]);
  return <section className={`authoring-picker is-${tone}`} aria-label={label}>
    <label className="authoring-picker-label">{label}
      <input className="authoring-picker-search" placeholder="搜索概念" aria-label={`${label}搜索`}
        value={query} onChange={(event) => setQuery(event.target.value)} />
    </label>
    {selected.length > 0 && <div className="authoring-picker-selected">
      {selected.map((id) => <button type="button" key={id} className="authoring-chip" title="移除" onClick={() => onToggle(id)}>
        {pointById.get(id)?.data.label ?? id} ✕
      </button>)}
    </div>}
    <div className="authoring-picker-list" role="listbox" aria-label={`${label}候选`}>
      {hits.map((point) => <button type="button" role="option" key={point.id} aria-selected={selected.includes(point.id)}
        className={selected.includes(point.id) ? 'is-selected' : ''} onClick={() => onToggle(point.id)}>
        <FileText size={14} />{point.data.label ?? point.id}<small>{point.id}</small>
      </button>)}
      {!hits.length && <p className="authoring-empty-note">{needle ? '没有匹配的概念' : '图里还没有概念'}</p>}
    </div>
  </section>;
}
