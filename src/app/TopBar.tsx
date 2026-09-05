import { FolderClosed } from 'lucide-react';
import type { AppMode } from './host';

const MODE_LABELS: Record<AppMode, string> = {
  authoring: '创作',
  learning: '学习',
};

/**
 * The application top bar. Mode switching lives here and nowhere else: it belongs to the
 * application, not to any panel inside a mode. A host that offers a single mode gets no
 * segmented control, because there is nothing to switch to.
 */
export function TopBar({
  workspaceName,
  modes,
  mode,
  onEnterMode,
  onCloseWorkspace,
}: {
  workspaceName: string | null;
  modes: readonly AppMode[];
  mode: AppMode;
  onEnterMode: (mode: AppMode) => void;
  onCloseWorkspace?: () => void;
}) {
  return (
    <header className="app-topbar">
      <span className="app-brand" aria-hidden="true">D</span>
      <span className="app-workspace">{workspaceName ?? 'Derivon'}</span>
      {modes.length > 1 && (
        <div className="app-modes" role="group" aria-label="模式">
          {modes.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === mode}
              className={candidate === mode ? 'is-active' : ''}
              onClick={() => onEnterMode(candidate)}
            >
              {MODE_LABELS[candidate]}
            </button>
          ))}
        </div>
      )}
      {/* 模式自己的工具栏在这里接上：创作工具栏、学习侧的定向/路线/浏览。 */}
      <div className="app-topbar-mode-slot" />
      {onCloseWorkspace && <button className="app-icon-button" type="button" title="关闭工作区"
        aria-label="关闭工作区" onClick={onCloseWorkspace}><FolderClosed size={18} /></button>}
    </header>
  );
}
