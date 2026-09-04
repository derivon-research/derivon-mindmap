import type { WorkspaceSource } from '../../ports/WorkspaceSource';

/**
 * Contract for a future web host backed by a remote workspace service.
 * This expand phase deliberately provides no transport, endpoint, or credentials.
 */
export type RemoteWorkspaceSource = WorkspaceSource;
