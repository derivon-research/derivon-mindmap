import { useEffect, useMemo, useState, type FocusEvent, type KeyboardEvent } from 'react';
import Fuse from 'fuse.js';
import { Search, X } from 'lucide-react';
import type { Point } from './domain';

type ConceptSingleSelectProps = {
  id: string;
  label: string;
  points: Point[];
  selectedId: string | null;
  visibleIds?: ReadonlySet<string>;
  onSelect: (pointId: string | null) => void;
};

export function ConceptSingleSelect({
  id,
  label,
  points,
  selectedId,
  visibleIds,
  onSelect,
}: ConceptSingleSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const pointById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const selected = selectedId ? pointById.get(selectedId) ?? null : null;
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

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (point: Point) => {
    onSelect(point.id);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return;
      event.preventDefault();
      setActiveIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        return (current + offset + results.length) % results.length;
      });
      return;
    }
    if (event.key === 'Enter' && results.length) {
      event.preventDefault();
      choose(results[activeIndex] ?? results[0]);
    }
  };

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <section className="route-concept-selector is-target derivation-conclusion-selector" onBlur={closeWhenFocusLeaves}>
      <header>
        <label htmlFor={id}>{label}</label>
        <span>{selected ? 1 : 0}</span>
      </header>
      <div className="route-concept-search">
        <Search size={14} aria-hidden="true" />
        <input
          id={id}
          type="search"
          role="combobox"
          aria-label={label}
          aria-expanded={open && !!query.trim()}
          aria-controls={listboxId}
          aria-activedescendant={open && results.length ? `${listboxId}-${results[activeIndex]?.id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="搜索名称或 ID"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {open && !!query.trim() && (
          <div className="route-search-results single-search-results" id={listboxId} role="listbox" aria-label={`${label}搜索结果`}>
            {results.length ? results.map((point, index) => (
              <button
                key={point.id}
                id={`${listboxId}-${point.id}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'is-active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(point)}
              >
                <span>{point.data.label}<small>{point.id}{visibleIds && !visibleIds.has(point.id) ? ' · 当前视图未显示' : ''}</small></span>
              </button>
            )) : <span className="route-search-empty">没有匹配概念</span>}
          </div>
        )}
      </div>
      <div className="route-selected-list" aria-label={`已选择的${label}`}>
        {selected ? (
          <div>
            <span>{selected.data.label}<small>{selected.id}{visibleIds && !visibleIds.has(selected.id) ? ' · 当前视图未显示' : ''}</small></span>
            <button type="button" title={`移除 ${selected.data.label}`} aria-label={`移除 ${selected.data.label}`} onClick={() => onSelect(null)}>
              <X size={13} />
            </button>
          </div>
        ) : <span className="route-selection-empty">尚未选择</span>}
      </div>
    </section>
  );
}
