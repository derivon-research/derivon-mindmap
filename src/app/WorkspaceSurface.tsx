import { Suspense, useEffect, useState, useSyncExternalStore, type ComponentType, type LazyExoticComponent } from 'react';
import { openWorkspaceSession, type WorkspaceSession } from '../synchronization';
import type { AppState } from './appState';
import type { AuthoringModeProps, LearningModeProps, WorkspaceHandle } from './host';

export type WorkspaceSurfaceProps = {
  workspace: WorkspaceHandle;
  state: AppState;
  modes: {
    authoring: LazyExoticComponent<ComponentType<AuthoringModeProps>> | null;
    learning: LazyExoticComponent<ComponentType<LearningModeProps>>;
  };
  onSelectConcept(id: string | null): void;
  onChangeTargets(ids: readonly string[]): void;
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

function SessionModes({ session, state, workspace, modes, onSelectConcept, onChangeTargets, onProtectionChange }: WorkspaceSurfaceProps & { session: WorkspaceSession }) {
  const snapshot = useSyncExternalStore(session.reader.subscribe, session.reader.getSnapshot);
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
  const AuthoringMode = modes.authoring;
  const LearningMode = modes.learning;
  const identity = { id: workspace.id, name: workspace.name };
  const labels = { saved: '已保存', pending: '待保存', saving: '正在保存', error: '保存失败' };
  const saveLabel = `${labels[snapshot.saveState]}${snapshot.hasDrafts ? ' · 有未提交草稿' : ''}${snapshot.error ? ` · ${snapshot.error}` : ''}`;
  return <>
    {state.mode === 'learning' && workspace.authoringSource && <div className="app-sync-bar"><output aria-label="保存状态" aria-live="polite">{saveLabel}</output>{snapshot.saveState === 'error' && <button type="button" onClick={() => { void session.flush(); }}>重试保存</button>}</div>}
    {state.visitedModes.map((mode) => <div className="app-mode" key={mode} hidden={mode !== state.mode}>
      <Suspense fallback={<div className="app-mode-loading" role="status">正在载入…</div>}>
        {mode === 'learning' ? <LearningMode workspace={identity} content={snapshot.content}
          targetIds={state.learningTargetIds} onChangeTargets={onChangeTargets} readAsset={session.reader.readAsset} />
          : AuthoringMode && <AuthoringMode workspace={identity} content={snapshot.content}
            authoring={session.authoring} readAsset={session.reader.readAsset} selectedConceptId={state.selectedConceptId} onSelectConcept={onSelectConcept}
            syncStatus={workspace.authoringSource && state.mode === 'authoring' ? { state: snapshot.saveState, label: saveLabel } : undefined}
            onRetrySync={snapshot.saveState === 'error' ? () => { void session.flush(); } : undefined} />}
      </Suspense>
    </div>)}
  </>;
}
