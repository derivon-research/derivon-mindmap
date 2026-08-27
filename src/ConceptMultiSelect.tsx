import { useMemo, useState, type FocusEvent } from 'react';
import Fuse from 'fuse.js';
import { Search, X } from 'lucide-react';
import type { Point } from './domain';

type ConceptMultiSelectProps = {
  id: string;
  label: string;
  points: Point[];
  selectedIds: string[];
  tone: 'start' | 'target';
  onToggle: (pointId: string) => void;
};

export function ConceptMultiSelect({
  id,
  label,
  points,
  selectedIds,
  tone,
  onToggle,
}: ConceptMultiSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pointById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const fuse = useMemo(() => new Fuse(points, {
    keys: ['data.label', 'id'],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 1,
  }), [points]);
  const results = useMemo(
    () => query.trim() ? fuse.search(query.trim(), { limit: 12 }).map(({ item }) => item) : [],
    [fuse, query],
  );
  const listboxId = `${id}-results`;

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <section className={`route-concept-selector is-${tone}`} onBlur={closeWhenFocusLeaves}>
      <header>
        <label htmlFor={id}>{label}</label>
        <span>{selectedIds.length}</span>
      </header>

      <div className="route-concept-search">
        <Search size={14} aria-hidden="true" />
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={open && !!query.trim()}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="搜索名称或 ID"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {open && !!query.trim() && (
          <div className="route-search-results" id={listboxId} role="listbox" aria-label={`${label}搜索结果`}>
            {results.length ? results.map((point) => (
              <label key={point.id} role="option" aria-selected={selected.has(point.id)}>
                <input
                  type="checkbox"
                  checked={selected.has(point.id)}
                  onChange={() => onToggle(point.id)}
                />
                <span>{point.data.label}<small>{point.id}</small></span>
              </label>
            )) : <span className="route-search-empty">没有匹配概念</span>}
          </div>
        )}
      </div>

      <div className="route-selected-list" aria-label={`已选择的${label}`}>
        {selectedIds.length ? selectedIds.map((pointId) => {
          const point = pointById.get(pointId);
          if (!point) return null;
          return (
            <div key={pointId}>
              <span>{point.data.label}<small>{point.id}</small></span>
              <button type="button" title={`移除 ${point.data.label}`} aria-label={`移除 ${point.data.label}`} onClick={() => onToggle(pointId)}>
                <X size={13} />
              </button>
            </div>
          );
        }) : <span className="route-selection-empty">尚未选择</span>}
      </div>
    </section>
  );
}
