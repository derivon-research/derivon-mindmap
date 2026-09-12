import type { ComponentType } from 'react';
import type { LearnerRecordStore } from '../learner-records';
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
 *
 * Creating a route is one of them, not two: the questions and the route they produce are
 * one flow, and the route it computed is a step inside it rather than a place of its own.
 */
export type LearningView = 'orientation' | 'route' | 'browse';

export type HostId = 'web' | 'desktop';

/**
 * What the `id → last path it was seen at` index noticed when a workspace was opened. It is
 * reported, never resolved on its own: a hand-edited workspace `id` strands a learner record
 * under an id nothing reads again, and the same id at a new path means two folders share one
 * identity. Either way the learner decides; nothing here loses a record silently (ADR-0009).
 */
export type LearnerRecordMigration =
  | { readonly kind: 'id-changed'; readonly path: string; readonly previousId: string; readonly id: string }
  | { readonly kind: 'id-moved'; readonly id: string; readonly previousPath: string; readonly path: string };

/** An open workspace: its identity, a display name, and the port to read it through. */
export type WorkspaceHandle = {
  /**
   * The host's own token for this open workspace — the folder path on desktop. It is not the
   * workspace `id`: that lives in the manifest, keys the learner records, and is reached
   * through `learnerRecords`. The two are deliberately separate values.
   */
  readonly id: string;
  readonly name: string;
  readonly source: WorkspaceSource;
  /** Desktop-only native close interception, supplied by the host rather than shared app code. */
  readonly registerCloseGuard?: (hasProtectedChanges: () => boolean) => Promise<() => void>;
  /** Granted only by the desktop host, never inferred from the visible mode. */
  readonly authoringSource?: WritableWorkspaceSource;
  /** The learner records for this workspace; absent on a host with no application data directory. */
  readonly learnerRecords?: LearnerRecordStore;
  /** Set only when the id index noticed a conflict worth the learner's attention. */
  readonly learnerRecordMigration?: LearnerRecordMigration;
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
  /**
   * Where a confirmed route is written. A host with no application data directory has none,
   * and then a confirmed route lives only in this session — the route stage says so.
   */
  readonly learnerRecords?: LearnerRecordStore;
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
  /**
   * The learner accepted the route the preview showed. The mode has already written the
   * record; this only makes it the active one and opens the route stage on it.
   */
  readonly onConfirmRoute: (routeId: string) => void;
  /**
   * Which confirmed route is on screen, or none so the learner chooses from the records.
   * Session state, not a record: reopening a workspace starts with none.
   */
  readonly activeRouteId: string | null;
  readonly onSelectRoute: (routeId: string | null) => void;
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
