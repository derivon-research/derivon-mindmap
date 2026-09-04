// PROTOTYPE — throwaway. Variant B: learning is a view of the graph you are authoring,
// docked beside the canvas and following the selection.
import { useState } from 'react';
import {
  AuthorToolbar,
  AuthoringCanvas,
  Inspector,
  LearningPane,
  WebHost,
  type Host,
} from '../panes';
import { labelOf } from '../../entry-orientation/data';

export const name = '停靠预览';
export const blurb = '不离开画布：右侧停靠学习视角，跟随选中的概念；要沉浸时再放大到整窗';

export default function VariantB({ host }: { host: Host }) {
  if (host === 'web') return <WebHost absent="顶栏的 [关 | 停靠 | 全屏] 学习视角开关，以及它旁边整条创作工具栏" />;
  return <Desktop />;
}

type View = 'off' | 'dock' | 'full';

function Desktop() {
  // 冷启动第一帧：没有启动屏。直接是上次的工作区、创作态、画布。
  // 没打开过任何工作区时，画布位置是空状态，顶栏的「工作区 ▾」是唯一入口。
  const [view, setView] = useState<View>('dock');
  const [selected, setSelected] = useState('svd');

  return (
    <div className="tm-shell">
      <header className="tm-topbar">
        <span className="tm-brand">D</span>
        <button type="button" className="tm-workspace is-menu">
          math-reforged ▾
        </button>
        <AuthorToolbar />

        {/* 模式入口属于应用顶栏，不属于任何一个面板 */}
        <div className="tm-segment tm-segment-right" role="group" aria-label="学习视角">
          <span className="tm-segment-title">学习视角</span>
          <button type="button" className={view === 'off' ? 'is-active' : ''} onClick={() => setView('off')}>
            关
          </button>
          <button type="button" className={view === 'dock' ? 'is-active' : ''} onClick={() => setView('dock')}>
            停靠
          </button>
          <button type="button" className={view === 'full' ? 'is-active' : ''} onClick={() => setView('full')}>
            全屏
          </button>
        </div>
      </header>

      {view === 'full' ? (
        <LearningPane
          targetId={selected}
          banner={
            <div className="tm-banner">
              全屏学习《{labelOf(selected)}》· 画布还在后面，创作状态没丢 ·{' '}
              <button type="button" onClick={() => setView('dock')}>
                收回停靠
              </button>
            </div>
          }
        />
      ) : (
        <div className="tm-body">
          <AuthoringCanvas selected={selected} onSelect={setSelected} />
          <Inspector selected={selected} />
          {view === 'dock' && (
            <div className="tm-dock">
              <header className="tm-dock-head">
                <span>学习视角 · 跟随选中</span>
                <button type="button" onClick={() => setView('full')}>
                  ⤢
                </button>
                <button type="button" onClick={() => setView('off')}>
                  ×
                </button>
              </header>
              <LearningPane targetId={selected} columns="doc+route" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
