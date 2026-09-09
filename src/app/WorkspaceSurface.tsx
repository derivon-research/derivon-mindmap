import { Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType, type LazyExoticComponent } from 'react';
import type { RouteSolver } from '../ports/RouteSolver';
import { openWorkspaceSession, type WorkspaceSession } from '../synchronization';
import type { AppState } from './appState';
import type { AuthoringModeProps, LearningModeProps, LearningView, WorkspaceHandle } from './host';

export type WorkspaceSurfaceProps = {
  workspace: WorkspaceHandle;
  state: AppState;
  modes: {
    authoring: LazyExoticComponent<ComponentType<AuthoringModeProps>> | null;
    learning: LazyExoticComponent<ComponentType<LearningModeProps>>;
  };
  routeSolver?: RouteSolver;
  onSelectConcept(id: string | null): void;
  onChangeTargets(ids: readonly string[]): void;
  onChangeKnown(ids: readonly string[]): void;
  onEnterLearningView(view: LearningView): void;
  onConfirmRoute(): void;
  onRouteInvalidated(): void;
  onProtectionChange(protectedChanges: boolean): void;
};

export default function WorkspaceSurface(props: WorkspaceSurfaceProps) {
  const [session, setSession] = useState<WorkspaceSession>();
  const [failure, setFailure] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let opened: WorkspaceSession | undefined;
    void openWorkspaceSession(props.workspace.source, { authoring: props.workspace.authoringSource })
      .then((value) => { opened = value; if (cancelled) value.dispose(); else setSession(value); })
      .catch((error: unknown) => { if (!cancelled) setFailure(String(error)); });
    return () => { cancelled = true; opened?.dispose(); };
  }, [props.workspace]);
  if (failure) return <main className="app-workspace-error" role="alert">工作区未能打开：{failure}</main>;
  if (!session) return <div role="status">正在载入工作区…</div>;
  return <SessionModes {...props} session={session} />;
}

function SessionModes({ session, state, workspace, modes, routeSolver, onSelectConcept, onChangeTargets, onChangeKnown, onEnterLearningView, onConfirmRoute, onRouteInvalidated, onProtectionChange }: WorkspaceSurfaceProps & { session: WorkspaceSession }) {
  const snapshot = useSyncExternalStore(session.reader.subscribe, session.reader.getSnapshot);
  const [closeGuardError, setCloseGuardError] = useState<string>();
  const readAsset = useMemo(() => async (path: string) => {
    const assertCurrent = () => {
      if (session.reader.getSnapshot().content !== snapshot.content) throw new Error('工作区预览已更新');
    };
    assertCurrent();
    const bytes = await session.reader.readAsset(path);
    assertCurrent();
    return bytes;
  }, [session, snapshot.content]);
  const readDocuments = useMemo(() => async (paths: readonly string[]) => {
    const assertCurrent = () => {
      if (session.reader.getSnapshot().content !== snapshot.content) throw new Error('工作区预览已更新');
    };
    assertCurrent();
    const documents = await session.reader.readDocuments(paths);
    assertCurrent();
    return documents;
  }, [session, snapshot.content]);
  useEffect(() => {
    onProtectionChange(snapshot.hasProtectedChanges);
    const guard = (event: BeforeUnloadEvent) => {
      if (!session.reader.getSnapshot().hasProtectedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [onProtectionChange, session, snapshot.hasProtectedChanges]);
  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;
    void workspace.registerCloseGuard?.(() => session.reader.getSnapshot().hasProtectedChanges)
      .then((value) => { if (cancelled) value?.(); else unregister = value; })
      .catch((error: unknown) => { if (!cancelled) setCloseGuardError(String(error)); });
    return () => { cancelled = true; unregister?.(); };
  }, [session, workspace]);
  const AuthoringMode = modes.authoring;
  const LearningMode = modes.learning;
  const identity = { id: workspace.id, name: workspace.name };
  const labels = { saved: '已保存', pending: '待保存', saving: '正在保存', error: '保存失败' };
  const saveLabel = `${labels[snapshot.saveState]}${snapshot.hasDrafts ? ' · 有未提交草稿' : ''}${snapshot.error ? ` · ${snapshot.error}` : ''}`;
  return <>
    {workspace.authoringSource && state.mode === 'learning' && <div className="app-sync-bar"><output aria-label="保存状态" aria-live="polite">{saveLabel}</output>{snapshot.saveState === 'error' && <button type="button" onClick={() => { void session.flush(); }}>重试保存</button>}</div>}
    {closeGuardError && <div className="app-sync-bar" role="alert">原生关闭保护未能启用：{closeGuardError}</div>}
    {snapshot.externalChange && <div className="app-sync-bar" role="alert"><output>外部工作区内容已更新；本地内容已保留，自动保存已暂停。</output><button type="button" disabled={snapshot.saveState === 'saving'} onClick={() => {
      if (window.confirm('放弃当前草稿和未保存内容，载入外部版本？')) session.acceptExternalChange();
    }}>放弃本地更改并载入</button></div>}
    {state.visitedModes.map((mode) => <div className="app-mode" key={mode} hidden={mode !== state.mode}>
      <Suspense fallback={<div className="app-mode-loading" role="status">正在载入…</div>}>
        {mode === 'learning' ? <LearningMode active={mode === state.mode} workspace={identity} content={snapshot.content}
          targetIds={state.learningTargetIds} knownIds={state.learningKnownIds} onChangeTargets={onChangeTargets}
          onChangeKnown={onChangeKnown} view={state.learningView} onEnterView={onEnterLearningView}
          onConfirmRoute={onConfirmRoute} onRouteInvalidated={onRouteInvalidated} routeSolver={routeSolver}
          readAsset={readAsset} readDocuments={readDocuments} />
          : AuthoringMode && <AuthoringMode key={snapshot.authoringEpoch} active={mode === state.mode} workspace={identity} content={snapshot.content}
            authoring={session.authoring} readAsset={readAsset} readDocuments={readDocuments} routeSolver={routeSolver} selectedConceptId={state.selectedConceptId} onSelectConcept={onSelectConcept}
            syncStatus={workspace.authoringSource && state.mode === 'authoring' ? { state: snapshot.saveState, label: saveLabel } : undefined}
            onRetrySync={snapshot.saveState === 'error' ? () => { void session.flush(); } : undefined} />}
      </Suspense>
    </div>)}
  </>;
}
