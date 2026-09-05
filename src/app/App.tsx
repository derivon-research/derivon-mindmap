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
import type { Host, RecentWorkspace, WorkspaceHandle } from './host';
import { TopBar } from './TopBar';
import { WorkspaceLaunch } from './WorkspaceLaunch';

const WorkspaceSurface = lazy(() => import('./WorkspaceSurface'));

/**
 * Composition root. It picks nothing itself: the host it is handed decides which modes
 * exist and where a workspace comes from, and every mode subtree sits behind a dynamic
 * import so the first screen carries neither of them.
 */
export default function App({ host }: { host: Host }) {
  const [state, setState] = useState<AppState | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<readonly RecentWorkspace[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  const protectedChanges = useRef(false);
  const announcedInteractive = useRef(false);
  const applicationElement = useRef<HTMLDivElement>(null);

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
    const element = applicationElement.current;
    if (!state || !element || announcedInteractive.current) return;
    let frame = 0;
    // Test instrumentation observes accessible loading states, not renderer internals
    // or a second event contract. Hidden mode subtrees do not gate the active frame.
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const pending = [...element.querySelectorAll('[role="status"], [role="alert"], [aria-busy="true"]')]
          .some((node) => !node.closest('[hidden]'));
        if (pending || announcedInteractive.current) return;
        announcedInteractive.current = true;
        observer.disconnect();
        void emitInteractiveTestHook();
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(element, { childList: true, subtree: true, attributes: true });
    check();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
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

  const handleOpenWorkspace = useCallback(async (open: () => Promise<WorkspaceHandle | null>) => {
    setOpening(true);
    setOpenFailure(null);
    try {
      const workspace = await open();
      if (workspace) setState((current) => (current ? openWorkspace(current, workspace) : current));
    } catch (error) {
      setOpenFailure(error instanceof Error ? error.message : String(error));
    } finally { setOpening(false); }
  }, []);

  const handleProtectionChange = useCallback((value: boolean) => { protectedChanges.current = value; }, []);
  const handleCloseWorkspace = useCallback(() => {
    if (protectedChanges.current && !window.confirm('工作区有未提交草稿或未保存内容，仍要关闭吗？')) return;
    protectedChanges.current = false;
    setState(initialAppState({ hostId: host.id, modes: host.modes }));
    void host.listRecentWorkspaces?.().then(setRecentWorkspaces).catch(() => {});
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

  return (
    <div ref={applicationElement} className="app" data-derivon-host={state.hostId}>
      <TopBar
        workspaceName={workspace?.name ?? null}
        modes={workspace ? state.availableModes : []}
        mode={state.mode}
        onEnterMode={(mode) => setState((current) => (current ? enterMode(current, mode) : current))}
        onCloseWorkspace={workspace && host.id === 'desktop' ? handleCloseWorkspace : undefined}
      />
      {workspace ? (
        <Suspense fallback={<div role="status">正在载入工作区…</div>}>
          <WorkspaceSurface key={workspace.id} workspace={workspace} state={state} modes={modes}
            onSelectConcept={handleSelectConcept} onChangeTargets={handleChangeTargets}
            onProtectionChange={handleProtectionChange} />
        </Suspense>
      ) : (
        <WorkspaceLaunch recentWorkspaces={recentWorkspaces} busy={opening} failure={openFailure}
          onOpen={(id) => { if (host.openRecentWorkspace) void handleOpenWorkspace(() => host.openRecentWorkspace!(id)); }}
          onChoose={host.chooseWorkspace ? () => { void handleOpenWorkspace(host.chooseWorkspace!); } : undefined}
          onCreate={host.createWorkspace ? () => { void handleOpenWorkspace(host.createWorkspace!); } : undefined} />
      )}
    </div>
  );
}
