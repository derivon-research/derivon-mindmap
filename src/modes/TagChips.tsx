import type { TagDeclaration } from '../workspace/index';

export type TagChipsProps = {
  readonly label: string;
  readonly tags: readonly TagDeclaration[];
  readonly selected: readonly string[];
  readonly onChange: (tagIds: readonly string[]) => void;
  readonly counts?: ReadonlyMap<string, number>;
  readonly emptyNote?: string;
};

/** Tick tags. The one control for choosing tags, wherever tags are chosen. */
export function TagChips({ label, tags, selected, onChange, counts, emptyNote }: TagChipsProps) {
  const chosen = new Set(selected);
  // A tag a concept carries without a declaration still shows, under its own id.
  const undeclared = selected.filter((id) => !tags.some((tag) => tag.id === id));
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  if (!tags.length && !undeclared.length) return <p className="tag-chips-empty">{emptyNote ?? '这个工作区还没有标签'}</p>;
  return <div className="tag-chips" role="group" aria-label={label}>
    {[...tags, ...undeclared.map((id) => ({ id, label: id }))].map((tag) => <button type="button" key={tag.id}
      className="tag-chip" aria-pressed={chosen.has(tag.id)} onClick={() => toggle(tag.id)}>
      {tag.label}{counts?.has(tag.id) ? <small>{counts.get(tag.id)}</small> : null}
    </button>)}
  </div>;
}
