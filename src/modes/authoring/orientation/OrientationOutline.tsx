import { ArrowDown, ArrowUp, Flag, Plus, Trash2 } from 'lucide-react';
import type { RouteSolver } from '../../../ports/RouteSolver';
import type { OrientationDiagnostic, WorkspaceContent } from '../../../workspace/index';
import { planOrientation } from '../../learning/orientation';
import { useRoutePreview } from '../../routePreview';
import { arrivalState, optionContext } from './context';
import { addOption, addQuestion, moveQuestion, removeOption, removeQuestion } from './edit';
import type { OrientationDraft } from './useOrientationDraft';

export type OrientationOutlineProps = {
  readonly content: WorkspaceContent;
  readonly state: OrientationDraft;
  readonly routeSolver?: RouteSolver;
  readonly editable: boolean;
};

/**
 * The outline: the whole configuration read top to bottom, with the route each option
 * produces beside it. An opening option shows that route's length; a follow-up shows the
 * difference it makes, which is how an author sees a question worth `±0`.
 */
export function OrientationOutline({ content, state, routeSolver, editable }: OrientationOutlineProps) {
  const draft = state.draft;
  if (!draft) {
    return <div className="orientation-outline">
      <p className="authoring-empty-note">这个工作区还没有开局配置，学习侧会走通用入口。</p>
    </div>;
  }
  const plan = planOrientation({ ...content, orientation: { status: 'ready', config: draft, diagnostics: [] } });
  const worst = (questionId: string, optionId?: string) => severity(state.diagnostics, questionId, optionId);

  return <div className="orientation-outline">
    <button type="button" className={`orientation-row is-seed${state.selection.kind === 'seed' ? ' is-selected' : ''}`}
      onClick={() => state.select({ kind: 'seed' })}>
      <Flag size={14} aria-hidden="true" />
      <span>默认路线种子</span>
      <small>{draft.seed.targets.length} 目标 · {draft.seed.known.length} 已知</small>
    </button>
    <RouteBadge content={content} routeSolver={routeSolver} targets={draft.seed.targets} known={draft.seed.known} />

    {draft.questions.map((question, index) => <section className="orientation-outline-question" key={question.id}>
      <div className="orientation-row-group">
        <button type="button" className={`orientation-row${state.selection.kind === 'question' && state.selection.questionId === question.id ? ' is-selected' : ''} is-${worst(question.id)}`}
          onClick={() => state.select({ kind: 'question', questionId: question.id })}>
          <span className="orientation-row-index">{index + 1}</span>
          <span>{question.prompt.trim() || '（没有提示语）'}</span>
          <small>{question.select === 'one' ? '单选' : '多选'}</small>
        </button>
        {editable && <div className="orientation-row-tools">
          <button type="button" aria-label={`上移 ${question.id}`} onClick={() => state.edit((config) => moveQuestion(config, question.id, -1))}><ArrowUp size={13} /></button>
          <button type="button" aria-label={`下移 ${question.id}`} onClick={() => state.edit((config) => moveQuestion(config, question.id, 1))}><ArrowDown size={13} /></button>
          <button type="button" aria-label={`删除问题 ${question.id}`} onClick={() => state.edit((config) => removeQuestion(config, question.id))}><Trash2 size={13} /></button>
        </div>}
      </div>
      <ul className="orientation-outline-options">
        {question.options.map((option) => <li key={option.id}>
          <div className="orientation-row-group">
            <button type="button" className={`orientation-row is-option${state.selection.kind === 'option' && state.selection.questionId === question.id && state.selection.optionId === option.id ? ' is-selected' : ''} is-${worst(question.id, option.id)}`}
              onClick={() => state.select({ kind: 'option', questionId: question.id, optionId: option.id })}>
              <span>{option.label.trim() || '（没有文案）'}</span>
              <small>{option.next ? `→ ${option.next}` : '↓ 顺次'}</small>
            </button>
            {editable && <div className="orientation-row-tools">
              <button type="button" aria-label={`删除选项 ${option.id}`} onClick={() => state.edit((config) => removeOption(config, question.id, option.id))}><Trash2 size={13} /></button>
            </div>}
          </div>
          <OptionRoute content={content} routeSolver={routeSolver} plan={plan} questionId={question.id}
            optionId={option.id} entryOptionId={index === 0 ? null : state.entryOptionId} />
        </li>)}
        {editable && <li><button type="button" className="orientation-add" onClick={() => state.edit((config) => addOption(config, question.id))}>
          <Plus size={13} />添加选项
        </button></li>}
      </ul>
    </section>)}

    {editable && <button type="button" className="orientation-add" onClick={() => state.edit(addQuestion)}>
      <Plus size={14} />添加问题
    </button>}
  </div>;
}

function severity(diagnostics: readonly OrientationDiagnostic[], questionId: string, optionId?: string): 'clean' | 'warning' | 'error' {
  const here = diagnostics.filter((diagnostic) => diagnostic.at.questionId === questionId
    && (optionId === undefined ? diagnostic.at.optionId === undefined : diagnostic.at.optionId === optionId));
  if (here.some((diagnostic) => diagnostic.severity === 'error')) return 'error';
  return here.length ? 'warning' : 'clean';
}

function OptionRoute({ content, routeSolver, plan, questionId, optionId, entryOptionId }: {
  content: WorkspaceContent; routeSolver?: RouteSolver;
  plan: ReturnType<typeof planOrientation>; questionId: string; optionId: string; entryOptionId: string | null;
}) {
  const context = optionContext(plan, questionId, optionId, entryOptionId);
  const isEntry = plan.config?.questions[0]?.id === questionId;
  const after = useRoutePreview(routeSolver, content.graph, context?.after.targets ?? [], context?.after.known ?? []);
  const before = useRoutePreview(routeSolver, content.graph, context?.before.targets ?? [], context?.before.known ?? []);
  if (!context) return <p className="orientation-steps is-muted">当前假设的入口走不到这道题</p>;
  if (after.status !== 'ready') return <p className="orientation-steps is-muted">{describe(after.status)}</p>;
  const steps = after.solution.derivationIds.length;
  if (isEntry) return <p className="orientation-steps">{after.solution.reachable ? `${steps} 步` : '无法到达'}</p>;
  const delta = before.status === 'ready' ? steps - before.solution.derivationIds.length : null;
  return <p className={`orientation-steps${delta === 0 ? ' is-flat' : ''}`}>
    {after.solution.reachable ? `${steps} 步` : '无法到达'}
    {delta === null ? '' : delta === 0 ? ' ±0' : delta > 0 ? ` +${delta}` : ` ${delta}`}
  </p>;
}

function describe(status: 'unavailable' | 'empty' | 'solving' | 'error'): string {
  return status === 'unavailable' ? '无求解器'
    : status === 'empty' ? '没有目标'
      : status === 'solving' ? '求解中…' : '求解失败';
}

/** The route the seed alone produces. */
function RouteBadge({ content, routeSolver, targets, known }: {
  content: WorkspaceContent; routeSolver?: RouteSolver; targets: readonly string[]; known: readonly string[];
}) {
  const route = useRoutePreview(routeSolver, content.graph, targets, known);
  return <p className="orientation-steps">
    {route.status === 'ready' ? (route.solution.reachable ? `${route.solution.derivationIds.length} 步` : '无法到达')
      : describe(route.status)}
  </p>;
}
