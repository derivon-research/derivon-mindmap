import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { AuthoringCommands } from '../../synchronization';
import { conceptTags, type ConceptPoint, type TagDeclaration } from '../../workspace/index';
import { TagChips } from '../TagChips';

export type ConceptTagEditorProps = {
  readonly concept: ConceptPoint;
  readonly tags: readonly TagDeclaration[];
  readonly authoring?: AuthoringCommands;
};

/**
 * A concept's tags, edited where its other document metadata is. Ticking a tag is a
 * complete change on its own, so it goes straight into content without a draft.
 */
export function ConceptTagEditor({ concept, tags, authoring }: ConceptTagEditorProps) {
  const [name, setName] = useState('');
  const [failure, setFailure] = useState('');
  const attached = conceptTags(concept);

  const apply = (action: () => void) => {
    setFailure('');
    try { action(); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  const declare = () => apply(() => {
    const label = name.trim();
    const id = label.toLowerCase().replace(/\s+/g, '-');
    if (tags.some((tag) => tag.id === id)) throw new Error(`标签「${id}」已经存在`);
    authoring!.updateTagDeclarations([...tags, { id, label }]);
    authoring!.updateConceptTags({ conceptId: concept.id, tags: [...attached, id] });
    setName('');
  });

  return <section className="authoring-tags" aria-label="标签">
    <h2>标签</h2>
    {authoring
      ? <>
        <TagChips label={`${concept.data.label} 的标签`} tags={tags} selected={attached}
          emptyNote="这个工作区还没有标签，先建一个。"
          onChange={(next) => apply(() => authoring.updateConceptTags({ conceptId: concept.id, tags: next }))} />
        <div className="authoring-tag-new">
          <input value={name} aria-label="新标签名称" placeholder="新标签名称"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) { event.preventDefault(); declare(); } }} />
          <button type="button" disabled={!name.trim()} onClick={declare}><Plus size={14} />建标签并打上</button>
        </div>
      </>
      : <TagChips label={`${concept.data.label} 的标签`} tags={tags.filter((tag) => attached.includes(tag.id))}
        selected={attached} onChange={() => {}} emptyNote="没有标签" />}
    {failure && <p className="authoring-form-error" role="alert">{failure}</p>}
  </section>;
}
