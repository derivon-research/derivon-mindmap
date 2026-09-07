import { FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ConceptPoint } from '../../workspace/index';

/**
 * Search a graph too large to scan, then pick a concept from the matches. Every authoring
 * surface that names a derivation endpoint goes through here, so how a concept is matched,
 * how it reads as an option and what an empty result says cannot drift between them.
 *
 * What each caller keeps is what actually differs: the create dialogue holds a persistent
 * multi-select column with chips, the relations pane a transient popover that closes on a
 * pick. Concept choice for orientation and for a learner's own targets is a different
 * interaction with a tag filter; it lives in `modes/ConceptPicker`.
 */
export function ConceptOptions({ label, points, marked = [], hidden = [], limit = 8, autoFocus, onPick }: {
  /** Names the field. The search box and the list derive their accessible names from it. */
  readonly label: string;
  readonly points: readonly ConceptPoint[];
  /** Offered, and reported as chosen. */
  readonly marked?: readonly string[];
  /** Not offered at all. */
  readonly hidden?: readonly string[];
  readonly limit?: number;
  readonly autoFocus?: boolean;
  readonly onPick: (conceptId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const hits = useMemo(() => points.filter((point) => !hidden.includes(point.id)
    && (!needle || point.data.label.toLowerCase().includes(needle) || point.id.toLowerCase().includes(needle)))
    .slice(0, limit), [hidden, limit, needle, points]);

  return <>
    <span className="ws-input authoring-picker-search"><Search size={14} aria-hidden="true" />
      <input type="search" autoFocus={autoFocus} value={query} placeholder="搜索概念" aria-label={`${label}搜索`}
        onChange={(event) => setQuery(event.target.value)} />
    </span>
    <div className="authoring-picker-list" role="listbox" aria-label={`${label}候选`}>
      {hits.map((point) => <button type="button" role="option" key={point.id} aria-selected={marked.includes(point.id)}
        className={marked.includes(point.id) ? 'is-selected' : ''} onClick={() => onPick(point.id)}>
        <FileText size={14} />{point.data.label}<small>{point.id}</small>
      </button>)}
      {!hits.length && <p className="authoring-empty-note">{needle ? '没有匹配的概念' : '图里还没有概念'}</p>}
    </div>
  </>;
}
