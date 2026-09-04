import { useEffect, useMemo, useState, type FocusEvent, type KeyboardEvent } from 'react';
import Fuse from 'fuse.js';
import { Search } from 'lucide-react';
import type { Point } from './domain';

type ConceptSearchProps = {
  points: Point[];
  value: string;
  tourFeatureId?: string;
  onChange: (value: string) => void;
  onSelect: (pointId: string, startedAtMs: number) => void;
  onSubmit: (startedAtMs: number) => void;
};

export function ConceptSearch({
  points,
  value,
  tourFeatureId,
  onChange,
  onSelect,
  onSubmit,
}: ConceptSearchProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const fuse = useMemo(() => new Fuse(points, {
    keys: ['data.label', 'id'],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 1,
  }), [points]);
  const results = useMemo(
    () => value.trim() ? fuse.search(value.trim(), { limit: 8 }).map(({ item }) => item) : [],
    [fuse, value],
  );
  const showResults = open && !!value.trim();
  const listboxId = 'concept-search-results';
  const resultHeight = results.length ? Math.min(results.length * 42, 210) : 38;

  useEffect(() => setActiveIndex(0), [value]);

  const choose = (point: Point, startedAtMs: number) => {
    onChange(point.data.label);
    setOpen(false);
    onSelect(point.id, startedAtMs);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        return (current + offset + results.length) % results.length;
      });
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const result = results[activeIndex] ?? results[0];
    if (result) choose(result, event.timeStamp);
    else onSubmit(event.timeStamp);
  };

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div className="concept-search" onBlur={closeWhenFocusLeaves}>
      <div
        className="concept-search-tour-target"
        data-tour-feature={tourFeatureId}
        style={{ height: showResults ? 37 + resultHeight : 31 }}
        aria-hidden="true"
      />
      <div className="search-box">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-label="搜索概念"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-activedescendant={showResults && results.length ? `${listboxId}-${results[activeIndex]?.id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="搜索概念"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {showResults && (
        <div className="concept-search-results" id={listboxId} role="listbox" aria-label="概念搜索结果">
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
              onClick={(event) => choose(point, event.timeStamp)}
            >
              <span>{point.data.label}<small>{point.id}</small></span>
            </button>
          )) : <span className="concept-search-empty">没有匹配概念</span>}
        </div>
      )}
    </div>
  );
}
