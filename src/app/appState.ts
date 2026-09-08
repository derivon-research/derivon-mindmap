import type { AppMode, HostId, LearningView, WorkspaceHandle } from './host';

/**
 * Application state: which mode is showing, what is open, and the little
 * that has to survive a mode switch. Everything here belongs to the current session and
 * is never written back to workspace content.
 */
export type AppState = {
  readonly hostId: HostId;
  readonly availableModes: readonly AppMode[];
  readonly workspace: WorkspaceHandle | null;
  readonly mode: AppMode;
  /** Modes entered at least once. Their subtrees stay mounted so a switch loses nothing. */
  readonly visitedModes: readonly AppMode[];
  readonly selectedConceptId: string | null;
  readonly learningTargetIds: readonly string[];
  /** This session's known concepts, produced by orientation. */
  readonly learningKnownIds: readonly string[];
  /** The learning stage or view showing; the top bar switches it, so the application owns it. */
  readonly learningView: LearningView;
  /** The learner has seen and accepted the route these targets and known concepts produce. */
  readonly learningRouteConfirmed: boolean;
  /** The selection already handed to learning, so a return trip does not re-carry it. */
  readonly carriedConceptId: string | null;
};

export type InitialAppStateInput = {
  readonly hostId: HostId;
  readonly modes: readonly AppMode[];
  readonly workspace?: WorkspaceHandle | null;
};

export function initialAppState({ hostId, modes, workspace = null }: InitialAppStateInput): AppState {
  if (modes.length === 0) {
    throw new Error(`Host "${hostId}" must offer at least one mode`);
  }
  return {
    hostId,
    availableModes: modes,
    workspace,
    mode: modes[0],
    visitedModes: workspace ? [modes[0]] : [],
    selectedConceptId: null,
    learningTargetIds: [],
    learningKnownIds: [],
    learningView: 'orientation',
    learningRouteConfirmed: false,
    carriedConceptId: null,
  };
}

export function canEnterMode(state: AppState, mode: AppMode): boolean {
  return state.availableModes.includes(mode);
}

export function openWorkspace(state: AppState, workspace: WorkspaceHandle): AppState {
  const mode = state.availableModes[0];
  return {
    ...state,
    workspace,
    mode,
    visitedModes: [mode],
    selectedConceptId: null,
    learningTargetIds: [],
    learningKnownIds: [],
    learningView: 'orientation',
    learningRouteConfirmed: false,
    carriedConceptId: null,
  };
}

export function selectConcept(state: AppState, conceptId: string | null): AppState {
  return { ...state, selectedConceptId: conceptId };
}

const same = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

/**
 * Learning owns its targets once it has them; orientation calls this.
 *
 * A route the learner already accepted was accepted for these targets. Changing them
 * un-confirms it, so the preview screen is passed again before the route reopens.
 */
export function setLearningTargets(state: AppState, conceptIds: readonly string[]): AppState {
  if (same(state.learningTargetIds, conceptIds)) return state;
  return { ...state, learningTargetIds: [...conceptIds], learningRouteConfirmed: false };
}

/** The known set orientation produced; session state alongside the targets. */
export function setLearningKnown(state: AppState, conceptIds: readonly string[]): AppState {
  if (same(state.learningKnownIds, conceptIds)) return state;
  return { ...state, learningKnownIds: [...conceptIds], learningRouteConfirmed: false };
}

/**
 * Move to another learning stage or view.
 *
 * Route learning is the one view with a gate in front of it: a learner who has not seen
 * the route these targets produce lands on the preview instead. That is the whole
 * mechanism behind "the preview is always passed before targets are committed to".
 */
export function enterLearningView(state: AppState, view: LearningView): AppState {
  const reached = view === 'route' && !state.learningRouteConfirmed ? 'preview' : view;
  return { ...state, learningView: reached };
}

/** The learner accepted the previewed route. */
export function confirmLearningRoute(state: AppState): AppState {
  return { ...state, learningRouteConfirmed: true, learningView: 'route' };
}

/**
 * Switch the whole window to another mode.
 *
 * Entering learning takes the concept selected in authoring along as the target, but only
 * a selection learning has not already been given: a learner who changed targets inside
 * learning keeps them when stepping back into authoring and returning.
 */
export function enterMode(state: AppState, mode: AppMode): AppState {
  if (!canEnterMode(state, mode)) {
    throw new Error(`Mode "${mode}" is not available on the ${state.hostId} host`);
  }
  if (!state.workspace) {
    throw new Error(`Cannot enter mode "${mode}" with no workspace open`);
  }

  const carries = mode === 'learning'
    && state.selectedConceptId !== null
    && state.selectedConceptId !== state.carriedConceptId;

  return {
    ...state,
    mode,
    visitedModes: state.visitedModes.includes(mode)
      ? state.visitedModes
      : [...state.visitedModes, mode],
    learningTargetIds: carries ? [state.selectedConceptId!] : state.learningTargetIds,
    learningRouteConfirmed: carries ? false : state.learningRouteConfirmed,
    carriedConceptId: carries ? state.selectedConceptId : state.carriedConceptId,
  };
}
