// PROTOTYPE — throwaway. Variant A: one window, one mode at a time.
import { useState } from 'react';
import {
  AuthorToolbar,
  AuthoringCanvas,
  Inspector,
  LearningPane,
  RecentWorkspaces,
  WebHost,
  type Host,
} from '../panes';
import { labelOf } from '../../entry-orientation/data';

export const name = '整窗切换';
export const blurb = '顶栏一个 [创作 | 学习] 段控，整窗换模式，带走当前选中的概念';

export default function VariantA({ host }: { host: Host }) {
  if (host === 'web') return <WebHost absent="顶栏的 [创作 | 学习] 段控——web 顶栏只有 F 自己那三个学习内模式" />;
  return <Desktop />;
}

function Desktop() {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<'author' | 'learn'>('author');
  const [selected, setSelected] = useState('svd');

  // 冷启动第一帧：整窗的最近工作区列表。A 一次只显示一件事，启动也不例外。
  if (!opened) return <RecentWorkspaces onOpen={() => setOpened(true)} />;

  return (
    <div className="tm-shell">
      <header className="tm-topbar">
        <span className="tm-brand">D</span>
        <span className="tm-workspace">math-reforged</span>

        {/* 模式入口属于应用顶栏，不属于任何一个面板 */}
        <div className="tm-segment" role="group" aria-label="模式">
          <button type="button" className={mode === 'author' ? 'is-active' : ''} onClick={() => setMode('author')}>
            创作
          </button>
          <button type="button" className={mode === 'learn' ? 'is-active' : ''} onClick={() => setMode('learn')}>
            学习
          </button>
        </div>

        {mode === 'author' ? (
          <AuthorToolbar />
        ) : (
          <nav className="tm-modes" aria-label="学习内模式">
            <button type="button">改目标 / 已知</button>
            <button type="button" className="is-active">路线学习</button>
            <button type="button">⤢ 大图浏览</button>
          </nav>
        )}
      </header>

      {mode === 'author' ? (
        <div className="tm-body">
          <AuthoringCanvas selected={selected} onSelect={setSelected} />
          <Inspector selected={selected} />
        </div>
      ) : (
        <LearningPane
          targetId={selected}
          banner={
            <div className="tm-banner">
              以你在创作里选中的《{labelOf(selected)}》为目标 · 已知取自工作区的默认路线种子 ·{' '}
              <button type="button" onClick={() => setMode('author')}>
                回到创作
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}
