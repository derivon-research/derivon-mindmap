import type { LearningModeProps } from '../../app/host';

/**
 * Learning side, still empty. Orientation (#46), route preview and graph browsing (#47)
 * and the three-pane route learning surface (#48) land inside this boundary; the top bar
 * above it does not change when they do.
 */
export function LearningMode({ workspace, targetIds }: LearningModeProps) {
  return (
    <section
      className="mode-surface"
      data-derivon-mode="learning"
      data-learning-targets={targetIds.join(' ')}
      aria-label="学习侧"
    >
      <p className="mode-surface-title">学习侧</p>
      <p className="mode-surface-note">
        工作区 <code>{workspace.name}</code> ·{' '}
        {targetIds.length
          ? `目标 ${targetIds.join('、')}`
          : '还没有目标，定向会先问'}
      </p>
    </section>
  );
}
