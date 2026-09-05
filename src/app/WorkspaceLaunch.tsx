import { FolderOpen, FolderPlus } from 'lucide-react';
import type { RecentWorkspace } from './host';

/**
 * The desktop first frame: the workspaces this machine has opened before.
 *
 * Deliberately not a mode chooser. Which mode you are in is a question you answer while
 * working on a graph, in the top bar, not a question the application asks at launch.
 */
export function WorkspaceLaunch({
  recentWorkspaces,
  onOpen,
  onChoose,
  onCreate,
  busy = false,
  failure,
}: {
  recentWorkspaces: readonly RecentWorkspace[];
  onOpen: (id: string) => void;
  onChoose?: () => void;
  onCreate?: () => void;
  busy?: boolean;
  failure?: string | null;
}) {
  return (
    <main className="app-launch" aria-label="打开工作区">
      <h1>Derivon</h1>
      {recentWorkspaces.length > 0 ? (
        <>
          <p className="app-launch-lead">最近打开的工作区</p>
          <ul className="app-launch-list">
            {recentWorkspaces.map((workspace) => (
              <li key={workspace.id}>
                <button type="button" disabled={busy} onClick={() => onOpen(workspace.id)}>
                  <strong>{workspace.name}</strong>
                  <span>{workspace.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="app-launch-lead">还没有打开过工作区。</p>
      )}
      <div className="app-launch-actions">
        {onChoose && <button type="button" disabled={busy} onClick={onChoose}><FolderOpen size={17} />打开文件夹…</button>}
        {onCreate && <button type="button" disabled={busy} onClick={onCreate}><FolderPlus size={17} />新建工作区</button>}
      </div>
      {busy && <p role="status">正在打开…</p>}
      {failure && <p role="alert">{failure}</p>}
    </main>
  );
}
