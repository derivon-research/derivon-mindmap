import { Compass, FolderClosed, Map, Route } from 'lucide-react';
import type { AppMode, LearningView } from './host';

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
  learning,
}: {
  workspaceName: string | null;
  modes: readonly AppMode[];
  mode: AppMode;
  onEnterMode: (mode: AppMode) => void;
  onCloseWorkspace?: () => void;
  learning?: LearningNavProps;
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
      {/* 模式自己的工具栏在这里接上：创作工具栏、学习侧的开局/路线/浏览。 */}
      <div className="app-topbar-mode-slot">
        {mode === 'learning' && learning && <LearningNav {...learning} />}
      </div>
      {onCloseWorkspace && <button className="app-icon-button" type="button" title="关闭工作区"
        aria-label="关闭工作区" onClick={onCloseWorkspace}><FolderClosed size={18} /></button>}
    </header>
  );
}

export type LearningNavProps = {
  readonly view: LearningView;
  readonly hasTargets: boolean;
  readonly onEnterView: (view: LearningView) => void;
};

/**
 * The learning side's stage and view entries. They sit beside the mode segmented control
 * rather than inside it: these are places to stand within one mode, not a third mode.
 */
function LearningNav({ view, hasTargets, onEnterView }: LearningNavProps) {
  return (
    <nav className="app-learning-views" aria-label="学习流程">
      <button type="button" aria-pressed={view === 'orientation'}
        className={view === 'orientation' ? 'is-active' : ''}
        onClick={() => onEnterView('orientation')}>
        <Compass size={15} aria-hidden="true" /><span>改目标 / 已知</span>
      </button>
      <button type="button" aria-pressed={view === 'route' || view === 'preview'} disabled={!hasTargets}
        className={view === 'route' || view === 'preview' ? 'is-active' : ''}
        onClick={() => onEnterView(view === 'route' ? 'preview' : 'route')}>
        <Route size={15} aria-hidden="true" /><span>{view === 'route' ? '再看一遍路线' : '路线学习'}</span>
      </button>
      <button type="button" aria-pressed={view === 'browse'}
        className={view === 'browse' ? 'is-active' : ''}
        onClick={() => onEnterView('browse')}>
        <Map size={15} aria-hidden="true" /><span>大图浏览</span>
      </button>
    </nav>
  );
}
