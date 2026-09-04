import type { AppMode, HostId, WorkspaceHandle } from './host';

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
    carriedConceptId: null,
  };
}

export function selectConcept(state: AppState, conceptId: string | null): AppState {
  return { ...state, selectedConceptId: conceptId };
}

/** Learning owns its targets once it has them; orientation calls this. */
export function setLearningTargets(state: AppState, conceptIds: readonly string[]): AppState {
  return { ...state, learningTargetIds: [...conceptIds] };
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
