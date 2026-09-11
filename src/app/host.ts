import type { ComponentType } from 'react';
import type { ConversationMode, ConversationProvider } from '../ports/ConversationProvider';
import type { RouteSolver } from '../ports/RouteSolver';
import type { WorkspaceSource, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import type { AuthoringCommands, WorkspaceReader } from '../synchronization';
import type { WorkspaceContent } from '../workspace/index';

/**
 * Application modes. There are two, and only two: the learning side and the authoring
 * side. Orientation, route learning and graph browsing are stages and views inside a
 * mode, not modes of their own.
 */
export type AppMode = 'authoring' | 'learning';

/**
 * Where a learner stands inside the learning mode. These are stages and views, not modes:
 * they never join the mode segmented control, and their entry points live in the
 * application top bar rather than inside any panel.
 */
export type LearningView = 'orientation' | 'preview' | 'route' | 'browse';

export type HostId = 'web' | 'desktop';

/** An open workspace: its identity, a display name, and the port to read it through. */
export type WorkspaceHandle = {
  readonly id: string;
  readonly name: string;
  readonly source: WorkspaceSource;
  /** Desktop-only native close interception, supplied by the host rather than shared app code. */
  readonly registerCloseGuard?: (hasProtectedChanges: () => boolean) => Promise<() => void>;
  /** Granted only by the desktop host, never inferred from the visible mode. */
  readonly authoringSource?: WritableWorkspaceSource;
};

/** A workspace the desktop host has opened before, offered on the launch frame. */
export type RecentWorkspace = {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
};

export type AuthoringModeProps = {
  /** The retained mode is currently visible; hidden graph renderers must not keep working. */
  readonly active?: boolean;
  readonly workspace: Pick<WorkspaceHandle, 'id' | 'name'>;
  readonly content: WorkspaceContent;
  readonly authoring?: AuthoringCommands;
  readonly readDocuments?: WorkspaceReader['readDocuments'];
  readonly readAsset?: (path: string) => Promise<Uint8Array>;
  readonly routeSolver?: RouteSolver;
  readonly selectedConceptId: string | null;
  readonly onSelectConcept: (conceptId: string | null) => void;
  readonly syncStatus?: { readonly state: 'saved' | 'pending' | 'saving' | 'error'; readonly label: string };
  readonly onRetrySync?: () => void;
  /**
   * Writes the pending accepted changes to disk. A conversation pane awaits it before a turn
   * reaches the provider, so the Agent's first read sees the effective content rather than what
   * the user has already replaced. Best effort and silent: an external version that has paused
   * saving leaves it nothing to do, a save that failed is retried, and either way the turn starts
   * — the save-state banner is the whole explanation, and this is never a second refusal path. It
   * is not a gate on editing, and nothing is suspended while it runs.
   */
  readonly drainPendingChanges?: () => Promise<void>;
  readonly conversation?: ConversationProvider;
};

export type LearningModeProps = {
  /** The retained mode is currently visible; hidden graph renderers must not keep working. */
  readonly active?: boolean;
  readonly workspace: Pick<WorkspaceHandle, 'id' | 'name'>;
  readonly content: WorkspaceContent;
  readonly readDocuments?: WorkspaceReader['readDocuments'];
  readonly readAsset?: (path: string) => Promise<Uint8Array>;
  readonly routeSolver?: RouteSolver;
  readonly targetIds: readonly string[];
  readonly knownIds: readonly string[];
  readonly onChangeTargets: (conceptIds: readonly string[]) => void;
  readonly onChangeKnown: (conceptIds: readonly string[]) => void;
  /** The stage or view showing, owned by the application because the top bar switches it. */
  readonly view: LearningView;
  readonly onEnterView: (view: LearningView) => void;
  /** The learner accepted the previewed route; only this opens the route view. */
  readonly onConfirmRoute: () => void;
  /** The accepted route became unusable; the application gate must require a new preview. */
  readonly onRouteInvalidated: () => void;
  /** See `AuthoringModeProps.drainPendingChanges`; the learning side reads the same disk. */
  readonly drainPendingChanges?: () => Promise<void>;
  readonly conversation?: ConversationProvider;
};

/**
 * What a host offers the application. The application depends on this contract, never on
 * `window.__TAURI__`, a user agent string, or a runtime permission check.
 *
 * A host that cannot run a mode does not report it, and — this is the part a runtime flag
 * cannot express — does not reference that mode's module either. The web host has no
 * `loadAuthoringMode`, so nothing in a web build's module graph reaches
 * `src/modes/authoring/`, and the bundle cannot contain it.
 */
export type Host = {
  readonly id: HostId;
  readonly modes: readonly AppMode[];
  /**
   * The workspace to start in, or null when the host opens without one and must ask
   * first. Web resolves to the one bundled workspace; desktop resolves to null and shows
   * its recent workspaces.
   */
  openInitialWorkspace(): Promise<WorkspaceHandle | null>;
  listRecentWorkspaces?(): Promise<readonly RecentWorkspace[]>;
  openRecentWorkspace?(id: string): Promise<WorkspaceHandle>;
  chooseWorkspace?(): Promise<WorkspaceHandle | null>;
  createWorkspace?(): Promise<WorkspaceHandle | null>;
  loadLearningMode(): Promise<ComponentType<LearningModeProps>>;
  loadAuthoringMode?(): Promise<ComponentType<AuthoringModeProps>>;
  /** Route solving is a host capability; a host without an engine omits it. */
  loadRouteSolver?(): Promise<RouteSolver>;
  createConversationProvider?(mode: ConversationMode): ConversationProvider;
};
