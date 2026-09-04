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
}: {
  recentWorkspaces: readonly RecentWorkspace[];
  onOpen: (id: string) => void;
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
                <button type="button" onClick={() => onOpen(workspace.id)}>
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
        {/* 打开与新建工作区属于 #51，本票只立起第一帧。 */}
        <button type="button" disabled title="桌面从零建图：#51">打开文件夹…</button>
        <button type="button" disabled title="桌面从零建图：#51">新建工作区</button>
      </div>
    </main>
  );
}
