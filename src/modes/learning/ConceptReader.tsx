import { Check, ChevronLeft, ChevronRight, Network, Target, X } from 'lucide-react';
import { useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import type { WorkspaceContent } from '../../workspace/index';
import { labelOf } from '../ConceptPicker';
import { ObjectDocument } from './ObjectDocument';

/**
 * Which document the learner is reading, and which ones they opened before it.
 *
 * Opening a concept turns a page rather than stacking another card: the surface always
 * shows exactly one document, and the ones behind it stay reachable through the pager.
 * Closing keeps the history, so going back to the graph and returning is free.
 */
export type Reading = { readonly pages: readonly string[]; readonly at: number };

export function useConceptPages() {
  const [reading, setReading] = useState<Reading>({ pages: [], at: -1 });
  return {
    pages: reading.pages,
    at: reading.at,
    /** The concept on the open page, or null when the reader is closed. */
    current: reading.at >= 0 ? reading.pages[reading.at] ?? null : null,
    open: (conceptId: string) => setReading(({ pages }) => {
      const seen = pages.indexOf(conceptId);
      return seen > -1 ? { pages, at: seen } : { pages: [...pages, conceptId], at: pages.length };
    }),
    go: (at: number) => setReading((current) => ({ ...current, at })),
    close: () => setReading((current) => ({ ...current, at: -1 })),
  };
}

export type ConceptReaderProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly conceptId: string;
  readonly pages: readonly string[];
  readonly at: number;
  readonly onGo: (at: number) => void;
  readonly onClose: () => void;
  /** What leaving the reader goes back to, which differs by view. */
  readonly closeLabel: string;
  readonly isTarget: boolean;
  readonly isKnown: boolean;
  readonly onToggleTarget: (conceptId: string) => void;
  readonly onToggleKnown: (conceptId: string) => void;
  /** Offered where there is a graph to narrow down; orientation has none. */
  readonly onFocus?: (conceptId: string) => void;
  readonly readAsset?: LearningModeProps['readAsset'];
  readonly readDocuments?: LearningModeProps['readDocuments'];
};

/**
 * Reading a concept: the authoring side's document surface with the editing taken out.
 *
 * The document is the page, not a card on it — one scroller, and what the learner can do
 * with the concept sits at the end of the text where they arrive at it. Paging between the
 * documents opened in this view is in the header, so the page itself ends with the reading.
 */
export function ConceptReader({
  active, content, conceptId, pages, at, onGo, onClose, closeLabel, isTarget, isKnown,
  onToggleTarget, onToggleKnown, onFocus, readAsset, readDocuments,
}: ConceptReaderProps) {
  const label = labelOf(content.graph, conceptId);
  const concept = content.graph.points.find((point) => point.id === conceptId);

  return <aside className="learning-reader" aria-label={`${label} 文档`}>
    <header className="learning-reader-head">
      <nav className="learning-reader-pager" aria-label="文档翻页">
        <button type="button" className="learning-icon-button" title="上一页" aria-label="上一页"
          disabled={at <= 0} onClick={() => onGo(at - 1)}><ChevronLeft size={15} aria-hidden="true" /></button>
        <span>第 {at + 1} / {pages.length} 页</span>
        <button type="button" className="learning-icon-button" title="下一页" aria-label="下一页"
          disabled={at >= pages.length - 1} onClick={() => onGo(at + 1)}><ChevronRight size={15} aria-hidden="true" /></button>
      </nav>
      <strong>{label}</strong>
      {isTarget && <span className="learning-reader-mark is-target">目标</span>}
      {isKnown && <span className="learning-reader-mark is-known">已会</span>}
      <button type="button" className="learning-icon-button" title={closeLabel} aria-label={closeLabel}
        onClick={onClose}><X size={15} aria-hidden="true" /></button>
    </header>

    <div className="learning-reader-page">
      <ObjectDocument title={label} content={content} object={concept} active={active}
        readAsset={readAsset} readDocuments={readDocuments} />
      <footer className="learning-reader-actions">
        <button type="button" className={isTarget ? 'is-chosen' : ''} aria-pressed={isTarget}
          onClick={() => onToggleTarget(conceptId)}>
          <Target size={15} aria-hidden="true" />{isTarget ? '取消目标' : '加进目标'}
        </button>
        <button type="button" className={isKnown ? 'is-chosen' : ''} aria-pressed={isKnown}
          onClick={() => onToggleKnown(conceptId)}>
          <Check size={15} aria-hidden="true" />{isKnown ? '其实我不会' : '这个我会'}
        </button>
        {onFocus && <button type="button" onClick={() => onFocus(conceptId)}>
          <Network size={15} aria-hidden="true" />看关联 →
        </button>}
      </footer>
    </div>
  </aside>;
}
