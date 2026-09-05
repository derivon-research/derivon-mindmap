import type { ComponentType } from 'react';
import type { WorkspaceSource, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import type { AuthoringCommands } from '../synchronization';
import type { WorkspaceContent } from '../workspace/index';

/**
 * Application modes. There are two, and only two: the learning side and the authoring
 * side. Orientation, route learning and graph browsing are stages and views inside a
 * mode, not modes of their own.
 */
export type AppMode = 'authoring' | 'learning';

export type HostId = 'web' | 'desktop';

/** An open workspace: its identity, a display name, and the port to read it through. */
export type WorkspaceHandle = {
  readonly id: string;
  readonly name: string;
  readonly source: WorkspaceSource;
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
  readonly workspace: Pick<WorkspaceHandle, 'id' | 'name'>;
  readonly content: WorkspaceContent;
  readonly authoring?: AuthoringCommands;
  readonly selectedConceptId: string | null;
  readonly onSelectConcept: (conceptId: string | null) => void;
};

export type LearningModeProps = {
  readonly workspace: Pick<WorkspaceHandle, 'id' | 'name'>;
  readonly content: WorkspaceContent;
  readonly targetIds: readonly string[];
  readonly onChangeTargets: (conceptIds: readonly string[]) => void;
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
};
