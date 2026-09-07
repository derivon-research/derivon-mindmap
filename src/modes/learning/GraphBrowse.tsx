import { Map as MapIcon, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import type { GraphEvent } from '../../rendering';
import { currentInputStartedAtMs, emitInteractionCompleteTestHook } from '../../testHooks';
import type { WorkspaceContent } from '../../workspace/index';
import { searchConcepts } from '../conceptSearch';
import { labelOf } from '../ConceptPicker';
import { neighbourhoodGraphView, overviewGraphView } from '../graphViews';
import { RetainedGraph } from '../RetainedGraph';
import { ConceptReader, useConceptPages } from './ConceptReader';

export type GraphBrowseProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly targetIds: readonly string[];
  readonly knownIds: readonly string[];
  readonly onToggleTarget: (conceptId: string) => void;
  readonly onToggleKnown: (conceptId: string) => void;
  /** Setting a target from here sends the learner back to settle the rest of the run. */
  readonly onBackToOrientation: () => void;
  readonly readAsset?: LearningModeProps['readAsset'];
  readonly readDocuments?: LearningModeProps['readDocuments'];
};

/**
 * Free browsing: the whole graph, with no route and no order imposed on it.
 *
 * The overview is not meant to be readable
 * (`docs/adr/0003-the-overview-is-not-meant-to-be-readable.md`) — it is a place to point
 * at something. So reading happens beside it, on a surface wide enough to read on, and
 * following a link narrows the picture to one step around a concept rather than piling
 * more onto the overview.
 */
export function GraphBrowse({
  active, content, targetIds, knownIds, onToggleTarget, onToggleKnown, onBackToOrientation,
  readAsset, readDocuments,
}: GraphBrowseProps) {
  const graph = content.graph;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const label = (conceptId: string) => labelOf(graph, conceptId);
  const suggestions = useMemo(() => searchConcepts(graph, draft), [draft, graph]);
  const reading = useConceptPages();

  const inspect = (conceptId: string) => {
    const startedAtMs = currentInputStartedAtMs();
    reading.open(conceptId);
    void emitInteractionCompleteTestHook({ interaction: 'select-concept', startedAtMs, context: { conceptId } });
  };

  const setTarget = (conceptId: string) => {
    const wasTarget = targetIds.includes(conceptId);
    const startedAtMs = currentInputStartedAtMs();
    onToggleTarget(conceptId);
    // A new target changes what the route is for, so the run is settled where it belongs.
    if (!wasTarget) onBackToOrientation();
    void emitInteractionCompleteTestHook({
      interaction: 'switch-target', startedAtMs, context: { conceptId, selected: !wasTarget },
    });
  };

  const view = useMemo(() => {
    const marks = { targetIds, knownIds, selectedId: reading.current };
    return focusId ? neighbourhoodGraphView(graph, focusId, marks) : overviewGraphView(graph, marks);
  }, [focusId, graph, reading.current, knownIds, targetIds]);

  const handleEvent = (event: GraphEvent) => {
    if (event.object === null) reading.close();
    else if (event.object.kind === 'concept') {
      // Inside a neighbourhood, opening another concept moves the focus rather than widening it.
      if (focusId && event.object.id !== focusId) setFocusId(event.object.id);
      inspect(event.object.id);
    }
  };

  return <div className={`learning-browse${reading.current ? ' has-reader' : ''}`}
    data-browse-focus={focusId ?? ''}>
    <div className="learning-browse-bar">
      <strong>{focusId ? `${label(focusId)} 附近` : '大图浏览'}</strong>
      <span>{focusId
        ? '只画跟它直接相连的推导。点别的概念就挪过去。'
        : '随便逛。看到感兴趣的点开，可以直接加进目标，或者标记成你已经会的。'}</span>
      {focusId && <button type="button" onClick={() => setFocusId(null)}>
        <MapIcon size={14} aria-hidden="true" />回到全图
      </button>}
      <form className="learning-browse-search" onSubmit={(event) => {
        event.preventDefault();
        const hit = searchConcepts(graph, draft, 1)[0];
        if (hit) { setDraft(''); inspect(hit.id); }
      }}>
        <label>
          <Search size={14} aria-hidden="true" />
          <input value={draft} aria-label="搜索概念" placeholder="搜索概念…"
            onChange={(event) => setDraft(event.target.value)} />
        </label>
        {draft.trim() && suggestions.length > 0 && <div className="learning-suggest">
          {suggestions.map((point) => <button key={point.id} type="button"
            onClick={() => { setDraft(''); inspect(point.id); }}>{point.data.label}</button>)}
        </div>}
      </form>
    </div>

    <div className="learning-browse-body">
      <div className="learning-graph-canvas">
        <RetainedGraph active={active} view={view} onEvent={handleEvent} />
      </div>

      {reading.current && <ConceptReader active={active} content={content} conceptId={reading.current}
        pages={reading.pages} at={reading.at} onGo={reading.go} onClose={reading.close} closeLabel="关闭"
        isTarget={targetIds.includes(reading.current)} isKnown={knownIds.includes(reading.current)}
        onToggleTarget={setTarget} onToggleKnown={onToggleKnown} onFocus={setFocusId}
        readAsset={readAsset} readDocuments={readDocuments} />}
    </div>
  </div>;
}
