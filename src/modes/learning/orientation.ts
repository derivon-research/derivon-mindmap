/**
 * The orientation flow: the state machine that walks a learner from "I do not know where
 * to start" to a confirmed set of targets and known concepts.
 *
 * There is exactly one set of transitions here, and every interaction style goes through
 * it. The deterministic question-and-answer screen calls `applyOrientationIntent`; a
 * `ConversationProvider` calls the same function with the same intents. Neither owns the
 * flow, and a missing provider cannot change its behaviour.
 *
 * What comes out is application state: this session's targets, known and trail. None of it
 * is ever written back to workspace content.
 */
import {
  ORIENTATION_FINISH, resolveOrientationAction,
  type OrientationAction, type OrientationConfig, type OrientationQuestion,
  type WorkspaceContent, type WorkspaceGraph,
} from '../../workspace/index';

export type OrientationPlan = {
  /** `guided` runs the author's questions; `generic` asks for targets directly. */
  readonly kind: 'guided' | 'generic';
  readonly graph: WorkspaceGraph;
  readonly config: OrientationConfig | null;
  /** Why the generic entry is running, when it is. */
  readonly fallbackReason?: 'absent' | 'invalid';
  /** What was wrong with the configuration, for a diagnosable fallback. */
  readonly message?: string;
};

export type OrientationAnswer = {
  readonly questionId: string;
  readonly optionIds: readonly string[];
  readonly optionLabels: readonly string[];
};

export type OrientationRun = {
  readonly targets: readonly string[];
  readonly known: readonly string[];
  /** Index of the question being asked, or -1 when orientation is finished. */
  readonly at: number;
  readonly trail: readonly OrientationAnswer[];
};

/**
 * Intents are the whole vocabulary of the flow. A conversation adapter may express an
 * answer in any words it likes; it still arrives here as one of these.
 */
export type OrientationIntent =
  | { readonly kind: 'answer'; readonly optionIds: readonly string[] }
  | { readonly kind: 'skip' }
  | { readonly kind: 'set-targets'; readonly conceptIds: readonly string[] }
  | { readonly kind: 'set-known'; readonly conceptIds: readonly string[] }
  | { readonly kind: 'restart' };

/** Read the effective content and decide which entry the learner gets. */
export function planOrientation(content: WorkspaceContent): OrientationPlan {
  const orientation = content.orientation;
  if (orientation.status === 'ready') return { kind: 'guided', graph: content.graph, config: orientation.config };
  return {
    kind: 'generic',
    graph: content.graph,
    config: null,
    fallbackReason: orientation.status === 'absent' ? 'absent' : 'invalid',
    ...(orientation.status === 'invalid' ? { message: orientation.message } : {}),
  };
}

const inGraph = (plan: OrientationPlan, ids: readonly string[]): string[] => {
  const present = new Set(plan.graph.points.map((point) => point.id));
  return [...new Set(ids)].filter((id) => present.has(id));
};

export function beginOrientation(plan: OrientationPlan): OrientationRun {
  const config = plan.config;
  return {
    targets: config ? inGraph(plan, config.seed.targets) : [],
    known: config ? inGraph(plan, config.seed.known) : [],
    at: config && config.questions.length ? 0 : -1,
    trail: [],
  };
}

export function currentQuestion(plan: OrientationPlan, run: OrientationRun): OrientationQuestion | null {
  if (run.at < 0 || !plan.config) return null;
  return plan.config.questions[run.at] ?? null;
}

export function isOrientationComplete(plan: OrientationPlan, run: OrientationRun): boolean {
  return currentQuestion(plan, run) === null;
}

function applyAction(plan: OrientationPlan, run: OrientationRun, action: OrientationAction): OrientationRun {
  const resolved = resolveOrientationAction(action, plan.graph);
  switch (action.op) {
    case 'set-targets': return { ...run, targets: resolved };
    case 'add-targets': return { ...run, targets: [...new Set([...run.targets, ...resolved])] };
    case 'set-known': return { ...run, known: resolved };
    case 'add-known': return { ...run, known: [...new Set([...run.known, ...resolved])] };
  }
}

/** Where answering this question leaves the learner: a branch, a fall-through, or done. */
function nextIndex(config: OrientationConfig, at: number, jump: string | undefined): number {
  if (jump === ORIENTATION_FINISH) return -1;
  if (jump === undefined) return at + 1 < config.questions.length ? at + 1 : -1;
  const target = config.questions.findIndex((question) => question.id === jump);
  return target >= 0 ? target : -1;
}

function answer(plan: OrientationPlan, run: OrientationRun, optionIds: readonly string[]): OrientationRun {
  const config = plan.config;
  const question = currentQuestion(plan, run);
  if (!config || !question) throw new Error('当前没有待回答的开局问题');
  if (question.select === 'one' && optionIds.length > 1) throw new Error('单选题只能选择一个选项');
  const chosen = optionIds.map((id) => {
    const option = question.options.find((candidate) => candidate.id === id);
    if (!option) throw new Error(`「${question.id}」没有名为「${id}」的选项`);
    return option;
  });
  const applied = chosen.reduce(
    (current, option) => option.actions.reduce((next, action) => applyAction(plan, next, action), current), run);
  return {
    ...applied,
    at: nextIndex(config, run.at, question.select === 'many' ? question.next : chosen[0]?.next),
    trail: [...run.trail, { questionId: question.id, optionIds: chosen.map((option) => option.id),
      optionLabels: chosen.map((option) => option.label) }],
  };
}

/**
 * The single transition function. Every concept id that lands in the run is checked
 * against the graph first, so no dangling reference can reach a route.
 */
export function applyOrientationIntent(plan: OrientationPlan, run: OrientationRun, intent: OrientationIntent): OrientationRun {
  switch (intent.kind) {
    case 'answer':
      return answer(plan, run, intent.optionIds);
    case 'skip': {
      const question = currentQuestion(plan, run);
      if (!plan.config || !question) throw new Error('当前没有待回答的开局问题');
      return { ...run, at: nextIndex(plan.config, run.at, question.select === 'many' ? question.next : undefined) };
    }
    case 'set-targets':
      return { ...run, targets: inGraph(plan, intent.conceptIds) };
    case 'set-known':
      return { ...run, known: inGraph(plan, intent.conceptIds) };
    case 'restart':
      return beginOrientation(plan);
  }
}
