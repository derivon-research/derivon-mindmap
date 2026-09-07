import { Check, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { conceptTags, type TagDeclaration, type WorkspaceGraph } from '../workspace/index';
import { TagChips } from './TagChips';
import './concept-picker.css';

export type ConceptPickerProps = {
  readonly label: string;
  readonly graph: WorkspaceGraph;
  readonly tags: readonly TagDeclaration[];
  readonly selected: readonly string[];
  readonly onChange: (conceptIds: readonly string[]) => void;
  readonly emptyNote?: string;
};

/**
 * Choose concepts by name or by tag, for the orientation configuration and the learner's
 * own targets and known set — the places where a tag filter and a long list earn their
 * space. Picking an endpoint while authoring a derivation is a different interaction and
 * does not come through here; see `modes/authoring/CreateObjectDialog` and
 * `modes/authoring/DerivationStructure`.
 */
export function ConceptPicker({ label, graph, tags, selected, onChange, emptyNote }: ConceptPickerProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<readonly string[]>([]);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const term = query.trim().toLowerCase();
  const matches = useMemo(() => graph.points.filter((point) =>
    (!filter.length || conceptTags(point).some((tag) => filter.includes(tag)))
    && (!term || point.data.label.toLowerCase().includes(term) || point.id.toLowerCase().includes(term))),
  [filter, graph.points, term]);
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  return <div className="concept-picker">
    <div className="concept-picker-chips">
      {selected.map((id) => <button type="button" key={id} className="concept-chip" onClick={() => toggle(id)}
        aria-label={`移除 ${labelOf(graph, id)}`}>{labelOf(graph, id)}<X size={12} /></button>)}
      {!selected.length && <span className="concept-picker-empty">{emptyNote ?? '尚未选择概念'}</span>}
    </div>
    <label className="concept-picker-search"><Search size={14} aria-hidden="true" />
      <input value={query} aria-label={`搜索${label}`} placeholder="搜索概念" onChange={(event) => setQuery(event.target.value)} />
    </label>
    {tags.length > 0 && <TagChips label={`${label}标签筛选`} tags={tags} selected={filter} onChange={setFilter} />}
    <ul className="concept-picker-list" aria-label={label}>
      {matches.slice(0, 200).map((point) => <li key={point.id}>
        <button type="button" aria-pressed={chosen.has(point.id)} onClick={() => toggle(point.id)}>
          <span className="concept-picker-mark">{chosen.has(point.id) && <Check size={13} />}</span>
          <span>{point.data.label}</span>
          <small>{conceptTags(point).join(' · ')}</small>
        </button>
      </li>)}
      {!matches.length && <li className="concept-picker-empty">没有匹配的概念</li>}
    </ul>
    {matches.length > 200 && <p className="concept-picker-empty">仅显示前 200 个匹配，继续输入以缩小范围。</p>}
  </div>;
}

export function labelOf(graph: WorkspaceGraph, conceptId: string): string {
  return graph.points.find((point) => point.id === conceptId)?.data.label ?? conceptId;
}
