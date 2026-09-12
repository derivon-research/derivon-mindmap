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
  /**
   * Which confirmed route the route stage is showing. Session state, like the view above:
   * reopening a workspace starts with none, and the learner picks one from `routes.json`.
   * The record itself is the persisted fact; this is only which one is on screen.
   */
  readonly learningActiveRouteId: string | null;
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
    learningActiveRouteId: null,
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
    learningActiveRouteId: null,
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
 * Changing them does not disturb the active route: a route record carries its own `targets`
 * and `known` snapshot, so it is not a statement about what is chosen now.
 */
export function setLearningTargets(state: AppState, conceptIds: readonly string[]): AppState {
  if (same(state.learningTargetIds, conceptIds)) return state;
  return { ...state, learningTargetIds: [...conceptIds] };
}

/** The known set orientation produced; session state alongside the targets. */
export function setLearningKnown(state: AppState, conceptIds: readonly string[]): AppState {
  if (same(state.learningKnownIds, conceptIds)) return state;
  return { ...state, learningKnownIds: [...conceptIds] };
}

/** Move to another learning stage or view. */
export function enterLearningView(state: AppState, view: LearningView): AppState {
  return { ...state, learningView: view };
}

/**
 * The learner accepted the route the preview showed. It is now the active one — the record
 * itself was written by the mode, which owns the store — and the route stage shows it.
 */
export function confirmLearningRoute(state: AppState, routeId: string): AppState {
  return { ...state, learningActiveRouteId: routeId, learningView: 'route' };
}

/** Which confirmed route is on screen, or none so the learner chooses from the records. */
export function selectLearningRoute(state: AppState, routeId: string | null): AppState {
  return state.learningActiveRouteId === routeId ? state : { ...state, learningActiveRouteId: routeId };
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
    carriedConceptId: carries ? state.selectedConceptId : state.carriedConceptId,
  };
}
