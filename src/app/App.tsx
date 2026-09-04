import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emitInteractiveTestHook } from '../testHooks';
import {
  enterMode,
  initialAppState,
  openWorkspace,
  selectConcept,
  setLearningTargets,
  type AppState,
} from './appState';
import type { AppMode, Host, RecentWorkspace } from './host';
import { TopBar } from './TopBar';
import { WorkspaceLaunch } from './WorkspaceLaunch';

/**
 * Composition root. It picks nothing itself: the host it is handed decides which modes
 * exist and where a workspace comes from, and every mode subtree sits behind a dynamic
 * import so the first screen carries neither of them.
 */
export default function App({ host }: { host: Host }) {
  const [state, setState] = useState<AppState | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<readonly RecentWorkspace[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const announcedInteractive = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [workspace, recents] = await Promise.all([
          host.openInitialWorkspace(),
          host.listRecentWorkspaces?.() ?? Promise.resolve([]),
        ]);
        if (cancelled) return;
        setRecentWorkspaces(recents);
        setState(initialAppState({ hostId: host.id, modes: host.modes, workspace }));
      } catch (error) {
        if (!cancelled) setFailure(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [host]);

  // The runtime performance contract: one `interactive` signal, after the first frame
  // that actually accepts input has been painted.
  useEffect(() => {
    if (!state || announcedInteractive.current) return;
    announcedInteractive.current = true;
    void emitInteractiveTestHook();
  }, [state]);

  const modes = useMemo(() => {
    const loadAuthoringMode = host.loadAuthoringMode;
    return {
      learning: lazy(async () => ({ default: await host.loadLearningMode() })),
      authoring: loadAuthoringMode
        ? lazy(async () => ({ default: await loadAuthoringMode() }))
        : null,
    };
  }, [host]);

  const handleOpenWorkspace = useCallback(async (id: string) => {
    if (!host.openRecentWorkspace) return;
    try {
      const workspace = await host.openRecentWorkspace(id);
      setState((current) => (current ? openWorkspace(current, workspace) : current));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [host]);

  const handleSelectConcept = useCallback((conceptId: string | null) => {
    setState((current) => (current ? selectConcept(current, conceptId) : current));
  }, []);

  const handleChangeTargets = useCallback((conceptIds: readonly string[]) => {
    setState((current) => (current ? setLearningTargets(current, conceptIds) : current));
  }, []);

  if (failure) {
    return <main className="app-failure" role="alert">应用没能启动：{failure}</main>;
  }
  if (!state) {
    return <div className="app-booting" role="status" aria-label="正在启动" />;
  }

  const { workspace } = state;
  const AuthoringMode = modes.authoring;
  const LearningMode = modes.learning;

  return (
    <div className="app" data-derivon-host={state.hostId}>
      <TopBar
        workspaceName={workspace?.name ?? null}
        modes={workspace ? state.availableModes : []}
        mode={state.mode}
        onEnterMode={(mode) => setState((current) => (current ? enterMode(current, mode) : current))}
      />
      {workspace ? (
        state.visitedModes.map((mode) => (
          <div className="app-mode" key={mode} hidden={mode !== state.mode}>
            <Suspense fallback={<div className="app-mode-loading" role="status">正在载入…</div>}>
              {mode === 'learning' ? (
                <LearningMode
                  workspace={workspace}
                  targetIds={state.learningTargetIds}
                  onChangeTargets={handleChangeTargets}
                />
              ) : AuthoringMode && (
                <AuthoringMode
                  workspace={workspace}
                  selectedConceptId={state.selectedConceptId}
                  onSelectConcept={handleSelectConcept}
                />
              )}
            </Suspense>
          </div>
        ))
      ) : (
        <WorkspaceLaunch recentWorkspaces={recentWorkspaces} onOpen={handleOpenWorkspace} />
      )}
    </div>
  );
}
