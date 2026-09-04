// PROTOTYPE — throwaway. Variant C: the window holds views; authoring is one of them and
// each learning run is another. Several can exist at once, side by side.
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

export const name = '视图标签';
export const blurb = '创作是一个标签，每次「以此为目标学习」开一个学习标签，可并存、可分屏';

export default function VariantC({ host }: { host: Host }) {
  if (host === 'web') return <WebHost absent="创作标签本身，以及开出它的「起始页」——web 的标签条只装得下学习视图，所以根本不画" />;
  return <Desktop />;
}

type Tab = { id: string; kind: 'start' | 'author' | 'learn'; title: string; target?: string };

function Desktop() {
  // 冷启动第一帧：一个「起始页」标签，里面是最近工作区。打开工作区后它就地变成创作标签。
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'start', kind: 'start', title: '起始页' }]);
  const [active, setActive] = useState('start');
  const [split, setSplit] = useState(false);
  const [selected, setSelected] = useState('svd');

  const openWorkspace = () => {
    setTabs([{ id: 'author', kind: 'author', title: '◈ math-reforged' }]);
    setActive('author');
  };

  const openLearnTab = (target: string) => {
    const id = `learn-${target}`;
    setTabs((current) =>
      current.some((tab) => tab.id === id)
        ? current
        : [...current, { id, kind: 'learn', title: `▷ ${labelOf(target)}`, target }],
    );
    setActive(id);
  };

  const closeTab = (id: string) => {
    setTabs((current) => current.filter((tab) => tab.id !== id));
    setActive('author');
    setSplit(false);
  };

  const learnTabs = tabs.filter((tab) => tab.kind === 'learn');
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  const renderTab = (tab: Tab) => {
    if (tab.kind === 'start') return <RecentWorkspaces onOpen={openWorkspace} />;
    if (tab.kind === 'learn') return <LearningPane targetId={tab.target!} />;
    return (
      <div className="tm-body">
        <AuthoringCanvas selected={selected} onSelect={setSelected} />
        <Inspector selected={selected}>
          <button type="button" className="tm-learn-cta" onClick={() => openLearnTab(selected)}>
            以此为目标学习 →
          </button>
          <p className="tm-muted tm-hint">在新标签里打开，创作标签不动。</p>
        </Inspector>
      </div>
    );
  };

  return (
    <div className="tm-shell">
      {/* 标签条就是应用顶栏：模式入口在这里，不在任何一个面板里 */}
      <header className="tm-topbar is-tabs">
        <span className="tm-brand">D</span>
        <div className="tm-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={tab.id === active ? 'is-active' : ''}
              onClick={() => setActive(tab.id)}
            >
              {tab.title}
              {tab.kind === 'learn' && (
                <span
                  className="tm-tab-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </span>
              )}
            </button>
          ))}
          {activeTab?.kind !== 'start' && (
            <button type="button" className="tm-tab-add" onClick={() => openLearnTab(selected)}>
              +
            </button>
          )}
        </div>
        {learnTabs.length > 0 && (
          <button type="button" className={split ? 'tm-split is-active' : 'tm-split'} onClick={() => setSplit(!split)}>
            ⫲ 分屏
          </button>
        )}
        {activeTab?.kind === 'author' && <AuthorToolbar />}
      </header>

      {split && learnTabs.length > 0 ? (
        <div className="tm-split-body">
          <div className="tm-split-pane">{renderTab(tabs.find((tab) => tab.kind === 'author')!)}</div>
          <div className="tm-split-pane">
            <LearningPane targetId={learnTabs[learnTabs.length - 1].target!} columns="doc+route" />
          </div>
        </div>
      ) : (
        renderTab(activeTab)
      )}
    </div>
  );
}
