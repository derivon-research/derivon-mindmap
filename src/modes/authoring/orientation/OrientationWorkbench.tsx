import { AlertTriangle, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RouteSolver } from '../../../ports/RouteSolver';
import type { AuthoringCommands } from '../../../synchronization';
import {
  ORIENTATION_ACTION_OPS, ORIENTATION_FINISH, conceptTags,
  type OrientationAction, type OrientationActionOp, type TagDeclaration, type WorkspaceContent,
} from '../../../workspace/index';
import { ConceptPicker, labelOf } from '../../ConceptPicker';
import { RetainedGraph } from '../../RetainedGraph';
import { OrientationPanel, RouteSummary } from '../../learning/OrientationPanel';
import {
  applyOrientationIntent, beginOrientation, planOrientation, type OrientationRun,
} from '../../learning/orientation';
import { routeGraphView, useRoutePreview } from '../../routePreview';
import { entriesReaching, optionContext } from './context';
import { setOptionActions, setSeed, updateOption, updateQuestion } from './edit';
import type { OrientationDraft } from './useOrientationDraft';

export type OrientationWorkbenchProps = {
  readonly active: boolean;
  readonly content: WorkspaceContent;
  readonly state: OrientationDraft;
  readonly authoring?: AuthoringCommands;
  readonly routeSolver?: RouteSolver;
};

const ACTION_LABELS: Record<OrientationActionOp, string> = {
  'set-targets': '设为目标', 'add-targets': '追加目标', 'set-known': '设为已知', 'add-known': '追加已知',
};

/** The centre of the orientation view: inspect one row, see its route, or run the whole thing. */
export function OrientationWorkbench({ active, content, state, authoring, routeSolver }: OrientationWorkbenchProps) {
  const [tab, setTab] = useState<'inspect' | 'route' | 'learner'>('inspect');
  const editable = Boolean(authoring);
  const draft = state.draft;

  return <main className="orientation-workbench" aria-label="开局配置">
    <header className="orientation-workbar">
      <div className="authoring-tabs" role="group" aria-label="开局视图">
        {([['inspect', '检视'], ['route', '路线'], ['learner', '学习者']] as const).map(([key, label]) =>
          <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <span className="authoring-flex" />
      {draft && editable && <>
        <span className={`orientation-state is-${state.dirty ? 'draft' : 'saved'}`}>{state.dirty ? '编辑草稿' : '有效内容'}</span>
        <button type="button" disabled={!state.dirty} onClick={state.discard}><Undo2 size={15} />放弃草稿</button>
        <button type="button" className="authoring-primary" disabled={!state.dirty || state.blocking.length > 0} onClick={state.save}>
          <Save size={15} />保存开局配置
        </button>
        {state.saved && <button type="button" aria-label="删除开局配置" onClick={() => {
          if (window.confirm('删除开局配置？学习侧会回到通用入口。')) state.remove();
        }}><Trash2 size={15} /></button>}
      </>}
    </header>

    {state.failure && <p className="orientation-warning" role="alert"><AlertTriangle size={15} />{state.failure}</p>}
    {state.blocking.length > 0 && <p className="orientation-warning" role="alert">
      <AlertTriangle size={15} />有 {state.blocking.length} 处会影响路线的问题，修好之前无法保存。
    </p>}

    {!draft ? <div className="orientation-inspector">
      <h2>还没有开局配置</h2>
      <p className="authoring-empty-note">没有配置的工作区仍然有效，学习侧走通用入口。</p>
      {editable && <button type="button" className="orientation-add" onClick={state.create}><Plus size={14} />新建开局配置</button>}
    </div>
      : tab === 'inspect' ? <Inspector content={content} state={state} authoring={authoring} editable={editable} />
        : tab === 'route' ? <RouteTab active={active} content={content} state={state} routeSolver={routeSolver} />
          : <LearnerTab content={content} state={state} routeSolver={routeSolver} />}

    <Diagnostics state={state} />
  </main>;
}

function Diagnostics({ state }: { state: OrientationDraft }) {
  if (!state.diagnostics.length) return null;
  return <details className="orientation-diagnostics" open={state.blocking.length > 0}>
    <summary>{state.diagnostics.length} 条校验结果</summary>
    {state.diagnostics.map((diagnostic, index) => <p key={`${diagnostic.code}:${index}`} className={`is-${diagnostic.severity}`}>
      <button type="button" onClick={() => diagnostic.at.questionId && state.select(diagnostic.at.optionId
        ? { kind: 'option', questionId: diagnostic.at.questionId, optionId: diagnostic.at.optionId }
        : { kind: 'question', questionId: diagnostic.at.questionId })}>
        {diagnostic.at.questionId ? `${diagnostic.at.questionId}${diagnostic.at.optionId ? ` · ${diagnostic.at.optionId}` : ''}` : '种子'}
      </button>
      {diagnostic.message}
    </p>)}
  </details>;
}

function Inspector({ content, state, authoring, editable }: {
  content: WorkspaceContent; state: OrientationDraft; authoring?: AuthoringCommands; editable: boolean;
}) {
  const draft = state.draft!;
  const selection = state.selection;
  if (selection.kind === 'seed') {
    return <div className="orientation-inspector">
      <h2>默认路线种子</h2>
      <p className="authoring-empty-note">打开工作区立即生效，一道题都还没问。按标签选择时概念会当场展开写入，不是活的标签查询。</p>
      <ConceptPicker label="默认目标" graph={content.graph} tags={content.tags} selected={draft.seed.targets}
        emptyNote="没有默认目标" onChange={(targets) => state.edit((config) => setSeed(config, { ...config.seed, targets }))} />
      <ConceptPicker label="默认已知" graph={content.graph} tags={content.tags} selected={draft.seed.known}
        emptyNote="没有默认已知" onChange={(known) => state.edit((config) => setSeed(config, { ...config.seed, known }))} />
      <TagManager content={content} authoring={authoring} editable={editable} />
    </div>;
  }

  const question = draft.questions.find((candidate) => candidate.id === selection.questionId);
  if (!question) return <p className="authoring-empty-note">这一行已经不在配置里了。</p>;
  const jumpTargets = [...draft.questions.filter((candidate) => candidate.id !== question.id).map((candidate) => candidate.id), ORIENTATION_FINISH];

  if (selection.kind === 'question') {
    return <div className="orientation-inspector">
      <h2>问题 <code>{question.id}</code></h2>
      <label className="authoring-field">提示语
        <textarea rows={3} value={question.prompt} disabled={!editable}
          onChange={(event) => state.edit((config) => updateQuestion(config, question.id, { prompt: event.target.value }))} />
      </label>
      <fieldset className="orientation-fieldset" disabled={!editable}>
        <legend>回答方式</legend>
        {(['one', 'many'] as const).map((mode) => <label key={mode}>
          <input type="radio" name={`select-${question.id}`} checked={question.select === mode}
            onChange={() => state.edit((config) => updateQuestion(config, question.id, { select: mode }))} />
          {mode === 'one' ? '单选（每个选项各自跳转）' : '多选（跳转挂在题上）'}
        </label>)}
      </fieldset>
      {question.select === 'many' && <label className="authoring-field">回答后跳到
        <select value={question.next ?? ''} disabled={!editable}
          onChange={(event) => state.edit((config) => updateQuestion(config, question.id, { next: event.target.value || undefined }))}>
          <option value="">顺次落到下一题</option>
          {jumpTargets.map((id) => <option key={id} value={id}>{id === ORIENTATION_FINISH ? '结束开局' : id}</option>)}
        </select>
      </label>}
    </div>;
  }

  const option = question.options.find((candidate) => candidate.id === selection.optionId);
  if (!option) return <p className="authoring-empty-note">这个选项已经不在配置里了。</p>;
  return <div className="orientation-inspector">
    <h2>选项 <code>{option.id}</code></h2>
    <label className="authoring-field">文案
      <input value={option.label} disabled={!editable}
        onChange={(event) => state.edit((config) => updateOption(config, question.id, option.id, { label: event.target.value }))} />
    </label>
    {question.select === 'one'
      ? <label className="authoring-field">选中后跳到
        <select value={option.next ?? ''} disabled={!editable}
          onChange={(event) => state.edit((config) => updateOption(config, question.id, option.id, { next: event.target.value || undefined }))}>
          <option value="">顺次落到下一题</option>
          {jumpTargets.map((id) => <option key={id} value={id}>{id === ORIENTATION_FINISH ? '结束开局' : id}</option>)}
        </select>
      </label>
      : <p className="authoring-empty-note">多选题的跳转挂在问题上：学习者可以同时选中几个选项，各自跳转会冲突。</p>}
    <ActionEditor content={content} option={option} editable={editable}
      onChange={(actions) => state.edit((config) => setOptionActions(config, question.id, option.id, actions))} />
  </div>;
}

function ActionEditor({ content, option, editable, onChange }: {
  content: WorkspaceContent;
  option: { actions: readonly OrientationAction[] };
  editable: boolean;
  onChange: (actions: readonly OrientationAction[]) => void;
}) {
  const replace = (index: number, action: OrientationAction) =>
    onChange(option.actions.map((current, position) => (position === index ? action : current)));
  return <section className="orientation-actions-editor">
    <header><h3>动作</h3><small>只有这四个：设置/追加目标、设置/追加已知</small></header>
    {option.actions.map((action, index) => <article className="orientation-action" key={index}>
      <div className="orientation-action-head">
        <select value={action.op} disabled={!editable} aria-label="动作"
          onChange={(event) => replace(index, { ...action, op: event.target.value as OrientationActionOp })}>
          {ORIENTATION_ACTION_OPS.map((op) => <option key={op} value={op}>{ACTION_LABELS[op]}</option>)}
        </select>
        {editable && <button type="button" aria-label={`删除动作 ${index + 1}`}
          onClick={() => onChange(option.actions.filter((_, position) => position !== index))}><Trash2 size={13} /></button>}
      </div>
      <ConceptPicker label={`动作 ${index + 1} 的概念`} graph={content.graph} tags={content.tags}
        selected={action.points ?? []} emptyNote="没有点名概念"
        onChange={(points) => replace(index, { ...action, points })} />
      <label className="authoring-field">按标签（载入时展开）
        <select multiple value={[...(action.tags ?? [])]} disabled={!editable} aria-label={`动作 ${index + 1} 的标签`}
          onChange={(event) => replace(index, { ...action,
            tags: [...event.target.selectedOptions].map((selected) => selected.value) })}>
          {content.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
        </select>
      </label>
    </article>)}
    {editable && <button type="button" className="orientation-add"
      onClick={() => onChange([...option.actions, { op: 'add-known', points: [] }])}><Plus size={13} />添加动作</button>}
  </section>;
}

/** Tagging happens where the author needs a tag, not in a separate trip through the graph. */
function TagManager({ content, authoring, editable }: { content: WorkspaceContent; authoring?: AuthoringCommands; editable: boolean }) {
  const [selectedTag, setSelectedTag] = useState('');
  const [newTag, setNewTag] = useState('');
  const [failure, setFailure] = useState('');
  const tagged = useMemo(() => content.graph.points.filter((point) => conceptTags(point).includes(selectedTag)).map((point) => point.id),
    [content.graph.points, selectedTag]);

  const guard = (action: () => void) => {
    setFailure('');
    try { action(); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  const declare = (tags: readonly TagDeclaration[]) => guard(() => authoring?.updateTagDeclarations(tags));

  return <section className="orientation-tags">
    <header><h3>标签</h3><small>标签只做分类，不改变可达性、推导或成本</small></header>
    <ul className="orientation-tag-list">
      {content.tags.map((tag) => <li key={tag.id}>
        <button type="button" aria-pressed={selectedTag === tag.id} onClick={() => setSelectedTag(selectedTag === tag.id ? '' : tag.id)}>
          {tag.label} <small>{content.graph.points.filter((point) => conceptTags(point).includes(tag.id)).length}</small>
        </button>
        {editable && <button type="button" aria-label={`删除标签 ${tag.id}`}
          onClick={() => declare(content.tags.filter((candidate) => candidate.id !== tag.id))}><Trash2 size={12} /></button>}
      </li>)}
      {!content.tags.length && <li className="authoring-empty-note">还没有声明标签</li>}
    </ul>
    {editable && <div className="orientation-tag-new">
      <input value={newTag} aria-label="新标签名称" placeholder="新标签名称" onChange={(event) => setNewTag(event.target.value)} />
      <button type="button" disabled={!newTag.trim()} onClick={() => {
        const id = newTag.trim().toLowerCase().replace(/\s+/g, '-');
        declare([...content.tags, { id, label: newTag.trim() }]);
        setNewTag('');
      }}><Plus size={13} />新建标签</button>
    </div>}
    {selectedTag && editable && <ConceptPicker label={`${selectedTag} 的概念`} graph={content.graph} tags={content.tags}
      selected={tagged} emptyNote="这个标签还没有概念" onChange={(next) => guard(() => {
        const before = new Set(tagged);
        const after = new Set(next);
        for (const point of content.graph.points) {
          if (before.has(point.id) === after.has(point.id)) continue;
          const tags = after.has(point.id)
            ? [...conceptTags(point), selectedTag]
            : conceptTags(point).filter((tag) => tag !== selectedTag);
          authoring?.updateConceptTags({ conceptId: point.id, tags });
        }
      })} />}
    {failure && <p className="orientation-warning" role="alert"><AlertTriangle size={14} />{failure}</p>}
  </section>;
}

function RouteTab({ active, content, state, routeSolver }: {
  active: boolean; content: WorkspaceContent; state: OrientationDraft; routeSolver?: RouteSolver;
}) {
  const draft = state.draft!;
  const plan = useMemo(() => planOrientation({ ...content, orientation: { status: 'ready', config: draft, diagnostics: [] } }),
    [content, draft]);
  const selection = state.selection;
  const context = selection.kind === 'option'
    ? optionContext(plan, selection.questionId, selection.optionId, state.entryOptionId) : null;
  const targets = context ? context.after.targets : draft.seed.targets;
  const known = context ? context.after.known : draft.seed.known;
  const entries = selection.kind === 'option' ? entriesReaching(plan, selection.questionId) : [];
  const route = useRoutePreview(routeSolver, content.graph, targets, known);
  const isEntryQuestion = selection.kind === 'option' && plan.config?.questions[0]?.id === selection.questionId;

  return <div className="orientation-route-tab">
    <header>
      <h2>{selection.kind === 'option' ? '这个选项之后的路线' : '种子路线'}</h2>
      {!isEntryQuestion && entries.length > 0 && <label className="authoring-field">假设从
        <select value={state.entryOptionId ?? entries[0]?.id ?? ''} aria-label="假设的入口"
          onChange={(event) => state.chooseEntry(event.target.value || null)}>
          {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label || entry.id}</option>)}
        </select>
        来
      </label>}
    </header>
    <dl className="orientation-result">
      <dt>目标</dt><dd>{targets.map((id) => labelOf(content.graph, id)).join('、') || '（空）'}</dd>
      <dt>已知</dt><dd>{known.map((id) => labelOf(content.graph, id)).join('、') || '（空）'}</dd>
    </dl>
    <RouteSummary route={route} graph={content.graph} />
    {route.status === 'ready' && route.solution.reachable && <>
      <div className="orientation-route-graph">
        <RetainedGraph active={active} view={routeGraphView(content.graph, route.solution, targets, known)} onEvent={() => {}} />
      </div>
      <ol className="orientation-route-steps">
        {route.solution.order.map((id) => {
          const edge = content.graph.hyperedges.find((candidate) => candidate.id === id);
          return <li key={id}>{edge ? `${edge.tails.map((tail) => labelOf(content.graph, tail)).join(' + ') || '空前提'} → ${labelOf(content.graph, edge.head)}` : id}</li>;
        })}
      </ol>
    </>}
  </div>;
}

/** The author walks the learner's own deterministic run — the same transitions, no copy. */
function LearnerTab({ content, state, routeSolver }: { content: WorkspaceContent; state: OrientationDraft; routeSolver?: RouteSolver }) {
  const draft = state.draft!;
  const plan = useMemo(() => planOrientation({ ...content, orientation: { status: 'ready', config: draft, diagnostics: [] } }),
    [content, draft]);
  // Mounting this tab starts a fresh run; editing the draft does not throw the author out
  // of the run they are in the middle of.
  const [run, setRun] = useState<OrientationRun>(() => beginOrientation(plan));
  return <div className="orientation-learner">
    <OrientationPanel graph={content.graph} tags={content.tags} plan={plan} run={run} routeSolver={routeSolver}
      onIntent={(intent) => setRun(applyOrientationIntent(plan, run, intent))}
      onEnter={() => setRun(beginOrientation(plan))} />
  </div>;
}
