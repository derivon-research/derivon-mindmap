import { Check, Map as MapIcon, Search, Target, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LearningModeProps } from '../../app/host';
import type { GraphEvent } from '../../rendering';
import { currentInputStartedAtMs, emitInteractionCompleteTestHook } from '../../testHooks';
import type { WorkspaceContent } from '../../workspace/index';
import { searchConcepts } from '../conceptSearch';
import { labelOf } from '../ConceptPicker';
import { neighbourhoodGraphView, overviewGraphView } from '../graphViews';
import { RetainedGraph } from '../RetainedGraph';
import { ObjectDocument } from './ObjectDocument';

export type GraphBrowseProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly targetIds: readonly string[];
  readonly knownIds: readonly string[];
  readonly onAddTarget: (conceptId: string) => void;
  readonly onKnow: (conceptId: string) => void;
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
 * at something. So reading happens in the inspector, and following a link narrows the
 * picture to one step around a concept rather than piling more onto the overview.
 */
export function GraphBrowse({
  active, content, targetIds, knownIds, onAddTarget, onKnow, onBackToOrientation, readAsset, readDocuments,
}: GraphBrowseProps) {
  const graph = content.graph;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const label = (conceptId: string) => labelOf(graph, conceptId);
  const suggestions = useMemo(() => searchConcepts(graph, draft), [draft, graph]);

  const inspect = (conceptId: string) => {
    const startedAtMs = currentInputStartedAtMs();
    setInspectingId(conceptId);
    void emitInteractionCompleteTestHook({ interaction: 'select-concept', startedAtMs, context: { conceptId } });
  };

  const addTarget = (conceptId: string) => {
    const startedAtMs = currentInputStartedAtMs();
    onAddTarget(conceptId);
    setInspectingId(null);
    onBackToOrientation();
    void emitInteractionCompleteTestHook({
      interaction: 'switch-target', startedAtMs, context: { conceptId, selected: true },
    });
  };

  const view = useMemo(() => {
    const marks = { targetIds, knownIds, selectedId: inspectingId };
    return focusId ? neighbourhoodGraphView(graph, focusId, marks) : overviewGraphView(graph, marks);
  }, [focusId, graph, inspectingId, knownIds, targetIds]);

  const handleEvent = (event: GraphEvent) => {
    if (event.object === null) setInspectingId(null);
    else if (event.object.kind === 'concept') {
      // Inside a neighbourhood, opening another concept moves the focus rather than widening it.
      if (focusId && event.object.id !== focusId) setFocusId(event.object.id);
      inspect(event.object.id);
    }
  };

  const inspecting = inspectingId ? graph.points.find((point) => point.id === inspectingId) : undefined;

  return <div className={`learning-browse${inspectingId ? ' has-inspector' : ''}`}
    data-browse-focus={focusId ?? ''}>
    <div className="learning-browse-bar">
      <strong>{focusId ? `${label(focusId)} 附近` : '大图浏览'}</strong>
      <span>{focusId
        ? '只画跟它直接相连的推导。点别的概念就挪过去。'
        : '随便逛。看到感兴趣的点开，可以直接设为目标，或者标记成你已经会的。'}</span>
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

    <div className="learning-graph-canvas">
      <RetainedGraph active={active} view={view} onEvent={handleEvent} />
    </div>

    {inspecting && <aside className="learning-inspect" aria-label={`${inspecting.data.label} 文档`}>
      <header>
        <strong>{inspecting.data.label}</strong>
        <button type="button" className="learning-icon-button" title="关闭" aria-label="关闭"
          onClick={() => setInspectingId(null)}><X size={15} aria-hidden="true" /></button>
      </header>
      <div className="learning-inspect-body">
        <ObjectDocument title={inspecting.data.label} content={content} object={inspecting} active={active}
          readAsset={readAsset} readDocuments={readDocuments} />
      </div>
      <footer>
        <button type="button" disabled={targetIds.includes(inspecting.id)}
          onClick={() => addTarget(inspecting.id)}>
          <Target size={15} aria-hidden="true" />{targetIds.includes(inspecting.id) ? '已经是目标' : '设为目标'}
        </button>
        <button type="button" disabled={knownIds.includes(inspecting.id)}
          onClick={() => onKnow(inspecting.id)}>
          <Check size={15} aria-hidden="true" />{knownIds.includes(inspecting.id) ? '已标记会了' : '这个我会'}
        </button>
        <button type="button" onClick={() => setFocusId(inspecting.id)}>看关联 →</button>
      </footer>
    </aside>}
  </div>;
}
