// PROTOTYPE — throwaway. Shared mock panes for the "one app, two modes" shell prototype.
//
// The question here is shell-level: what the window is made of, and where the entry to
// learning lives. The panes below are deliberately shallow mocks of the authoring side and
// of the settled learning-side variant F — real content, no real behaviour.
import { useMemo, useState, type ReactNode } from 'react';
import {
  documents,
  edges,
  labelOf,
  presets,
  routeSteps,
  solveRoute,
  tagOf,
  type Step,
} from '../entry-orientation/data';
import { MarkdownBody, colorOf, layoutSubgraph, polyline } from '../entry-orientation/render';
import Final from '../entry-orientation/variants/Final';

export type Host = 'desktop' | 'web';

/** The known-set every desktop view is seeded with: the workspace's default route seed
 *  (#57). The author never answers the orientation questions; the graph carries them. */
export const SEED = presets[1];

export function useRoute(targetId: string) {
  return useMemo(() => {
    const route = solveRoute(SEED.points, targetId);
    return { route, steps: routeSteps(route, SEED.points) };
  }, [targetId]);
}

/* ------------------------------------------------------------------ authoring side */

/** Edges within two hops of a point, capped, so the canvas looks like a real working view
 *  rather than 293 nodes of soup. */
function neighbourhood(pointId: string, limit = 11): string[] {
  const first = edges.filter((edge) => edge.head === pointId || edge.tails.includes(pointId));
  const near = new Set<string>([pointId]);
  for (const edge of first) {
    near.add(edge.head);
    edge.tails.forEach((tail) => near.add(tail));
  }
  const second = edges.filter(
    (edge) => !first.includes(edge) && (near.has(edge.head) || edge.tails.some((tail) => near.has(tail))),
  );
  return [...first, ...second].slice(0, limit).map((edge) => edge.id);
}

export function AuthoringCanvas({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(() => layoutSubgraph(neighbourhood(selected), [selected], 'LR'), [selected]);
  return (
    <div className="tm-canvas">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet">
        {layout.links.map((link, index) => (
          <path key={index} d={polyline(link.points)} className="tm-canvas-link" />
        ))}
        {layout.nodes.map((node) =>
          node.kind === 'derivation' ? (
            <rect
              key={node.id}
              x={node.x - 6}
              y={node.y - 6}
              width={12}
              height={12}
              transform={`rotate(45 ${node.x} ${node.y})`}
              className="tm-canvas-derivation"
            />
          ) : (
            <g key={node.id} onClick={() => onSelect(node.id)} className="tm-canvas-point">
              <rect
                x={node.x - node.width / 2}
                y={node.y - node.height / 2}
                width={node.width}
                height={node.height}
                rx={8}
                fill="#fff"
                stroke={node.id === selected ? '#4f46e5' : '#cbd5e1'}
                strokeWidth={node.id === selected ? 2 : 1}
              />
              <circle cx={node.x - node.width / 2 + 12} cy={node.y} r={4} fill={colorOf(node.tag)} />
              <text x={node.x - node.width / 2 + 22} y={node.y + 4}>
                {node.label}
              </text>
            </g>
          ),
        )}
      </svg>
      <div className="tm-canvas-legend">
        <span><i style={{ background: '#fff', border: '1px solid #cbd5e1' }} />概念</span>
        <span><i style={{ background: '#94a3b8', transform: 'rotate(45deg)' }} />推导</span>
        <span className="tm-canvas-scope">邻域视图 · 工作区共 293 概念 / 340 推导</span>
      </div>
    </div>
  );
}

/** The old app's right-hand inspector, roughly. Authoring is a functional rebuild, not a
 *  redesign (#52), so this pane is fixed across the variants; only where the learning
 *  entry sits changes. */
export function Inspector({ selected, children }: { selected: string; children?: ReactNode }) {
  const incoming = edges.filter((edge) => edge.head === selected).slice(0, 2);
  return (
    <aside className="tm-inspector">
      <div className="tm-inspector-head">
        <span className="tm-eyebrow">概念</span>
        <strong>{selected}</strong>
      </div>
      <p className="tm-inspector-label">{labelOf(selected)}</p>
      <span className="tm-field-title">文档</span>
      <code className="tm-path">content/{selected}/index.html</code>
      <span className="tm-field-title">入边（推导）</span>
      {incoming.length === 0 && <p className="tm-muted">没有推导指向它 · 它是一个前提</p>}
      {incoming.map((edge) => (
        <div className="tm-edge-card" key={edge.id}>
          <code>{edge.id}</code>
          <div className="tm-chips">
            {edge.tails.length === 0 && <span className="tm-chip">空集 ∅</span>}
            {edge.tails.map((tail) => (
              <span className="tm-chip" key={tail}>
                {labelOf(tail)}
              </span>
            ))}
          </div>
          <label className="tm-weight">
            成本权重
            <input type="number" defaultValue={edge.weight} step="0.1" />
          </label>
        </div>
      ))}
      {children}
    </aside>
  );
}

export function AuthorToolbar() {
  return (
    <div className="tm-toolbar" aria-label="创作工具栏">
      <button type="button">+ 概念</button>
      <button type="button">+ 推导</button>
      <span className="tm-toolbar-divider" />
      <button type="button">↶</button>
      <button type="button">↷</button>
      <span className="tm-toolbar-divider" />
      <button type="button">布局 ▾</button>
      <span className="tm-saved">已保存</span>
    </div>
  );
}

/* ------------------------------------------------------------------ learning side */

function StepList({
  steps,
  current,
  onPick,
  dense = false,
}: {
  steps: Step[];
  current: number;
  onPick: (index: number) => void;
  dense?: boolean;
}) {
  return (
    <ol className={dense ? 'tm-steps is-dense' : 'tm-steps'}>
      {steps.map((step, index) => (
        <li key={step.edgeId}>
          <button
            type="button"
            className={index === current ? 'is-current' : index < current ? 'is-done' : ''}
            onClick={() => onPick(index)}
          >
            <span className="tm-step-index">{index < current ? '✓' : step.index}</span>
            <span className="tm-step-label">{step.label}</span>
            {!dense && <span className="tm-step-weight">{step.weight}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Mock of F's learning state. Three panes: Ask AI, the textbook, the route.
 *  `columns` drops panes for the docked shapes; nothing else changes. */
export function LearningPane({
  targetId,
  columns = 'three',
  banner,
}: {
  targetId: string;
  columns?: 'three' | 'doc+route' | 'doc';
  banner?: ReactNode;
}) {
  const { steps, route } = useRoute(targetId);
  const [current, setCurrent] = useState(() => Math.max(0, steps.length - 1));
  const step = steps[Math.min(current, steps.length - 1)];
  const source = step ? documents[step.pointId] : undefined;

  if (!steps.length) {
    return (
      <div className="tm-learn is-empty">
        {banner}
        <p className="tm-muted">
          《{labelOf(targetId)}》已经在默认已知种子「{SEED.label}」里，路线为空。换一个目标，或在定向里改已知。
        </p>
      </div>
    );
  }

  return (
    <div className={`tm-learn is-${columns}`}>
      {banner}
      <div className="tm-learn-body">
        {columns === 'three' && (
          <section className="tm-ask">
            <header>Ask AI</header>
            <div className="tm-thread">
              <p className="tm-turn is-user">为什么学《{labelOf(targetId)}》要先过《{steps[0]?.label}》？</p>
              <p className="tm-turn">
                因为下一步的推导把它当前提。你现在这一步 <strong>{step.label}</strong> 的入边要求{' '}
                {step.requires.map(labelOf).join('、') || '空集 ∅'}。
              </p>
              <p className="tm-turn is-user">这一步能跳过吗？</p>
              <p className="tm-turn">跳不过。绕开它的另一条推导成本更高，我可以把那条也算给你看。</p>
            </div>
            <div className="tm-composer">
              <input placeholder="接着定向那段对话继续问…" />
              <button type="button">发送</button>
            </div>
          </section>
        )}

        <section className="tm-doc">
          <div className="tm-doc-head">
            <span className="tm-eyebrow">
              第 {step.index} 步 / 共 {steps.length} 步 · 成本 {route.cost ?? '—'}
              {route.exact ? '' : ' · 近似解'}
            </span>
            <h2>{step.label}</h2>
            <span className="tm-doc-because">
              为什么现在轮到它：{step.requires.map(labelOf).join('、') || '空集 ∅'} 已经就位，它是下一步能接上的最省的一个。
            </span>
          </div>
          {source ? <MarkdownBody source={source} /> : <p className="tm-muted">（这个节点还没有文档）</p>}
          <div className="tm-task">
            <span className="tm-eyebrow">理解验证</span>
            <p>拿它做一件事：说明下一步为什么非得先有《{step.label}》。交了才解锁下一步。</p>
            <button type="button">提交</button>
          </div>
        </section>

        {columns !== 'doc' && (
          <section className="tm-route">
            <header>
              路线 · {current} / {steps.length} 已完成
            </header>
            <StepList steps={steps} current={current} onPick={setCurrent} dense={columns !== 'three'} />
          </section>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hosts */

/** Recent-workspace list. Only the desktop host has one: the web build has no file picking
 *  at all, it opens straight into the one official graph. */
export function RecentWorkspaces({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="tm-recent">
      <h1>Derivon</h1>
      <p className="tm-muted">上次打开的工作区</p>
      <button type="button" className="tm-recent-row is-primary" onClick={onOpen}>
        <strong>math-reforged</strong>
        <span>~/Projects/math-reforged · 293 概念 · 3 天前</span>
      </button>
      <button type="button" className="tm-recent-row" onClick={onOpen}>
        <strong>线代讲义草稿</strong>
        <span>~/Documents/linalg-notes · 12 概念 · 上周</span>
      </button>
      <div className="tm-recent-actions">
        <button type="button" onClick={onOpen}>打开文件夹…</button>
        <button type="button" onClick={onOpen}>新建工作区</button>
      </div>
    </div>
  );
}

/**
 * The web host, in every variant: the real committed variant F, untouched. Web has no
 * workspace picking and no authoring — authoring is structurally absent from the build,
 * not hidden at runtime — so the app opens straight into F's orientation state.
 */
export function WebHost({ absent }: { absent: string }) {
  return (
    <div className="tm-web">
      <Final />
      <p className="tm-web-note">
        <strong>网页构建</strong> · 打开即此界面（定稿 F 原样嵌入）。没有工作区选择，唯一的官方图已经载好。
        <br />
        本变体在 web 里<strong>不存在</strong>的部分：{absent}
      </p>
    </div>
  );
}
