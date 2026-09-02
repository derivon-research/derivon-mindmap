// PROTOTYPE variant A — 搜索先行：图不是入口，目标才是。大图始终不出现，除非你主动要求。
import { useMemo, useState } from 'react';
import { presets, routeSteps, searchPoints, solveRoute, labelOf, tagOf } from '../data';
import { DocumentBody, colorOf, layoutSubgraph, polyline } from '../render';

export const name = '搜索先行';

const SUGGESTED = ['svd', 'principal-component-analysis', 'spectral-theorem', 'jordan-form', 'kalman-filter', 'fast-fourier-transform'];

export default function SearchFirst() {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  const preset = presets.find((item) => item.id === presetId) ?? null;
  const route = useMemo(
    () => (target && preset ? solveRoute(preset.points, target) : null),
    [target, preset],
  );
  const steps = useMemo(
    () => (route && preset ? routeSteps(route, preset.points) : []),
    [route, preset],
  );
  const preview = useMemo(
    () => (target ? presets.map((item) => ({
      preset: item,
      steps: routeSteps(solveRoute(item.points, target), item.points).length,
    })) : []),
    [target],
  );
  const graph = useMemo(
    () => (route && showGraph ? layoutSubgraph(route.order, [], 'LR') : null),
    [route, showGraph],
  );

  if (!target) {
    return (
      <div className="search-root">
        <div className="search-hero">
          <h1>你想学会什么？</h1>
          <p>不必先看懂那张图。说出一个概念，路线由图去算。</p>
          <input
            autoFocus
            className="search-input"
            placeholder="奇异值分解 / 主成分分析 / 谱定理…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="search-results">
            {searchPoints(query).map((point) => (
              <button key={point.id} type="button" onClick={() => setTarget(point.id)}>
                <span className="dot" style={{ background: colorOf(point.tag) }} />
                {point.label}
                <em>{point.tag}</em>
              </button>
            ))}
          </div>
          {!query && (
            <div className="search-suggested">
              <span>常见目标：</span>
              {SUGGESTED.map((id) => (
                <button key={id} type="button" onClick={() => setTarget(id)}>{labelOf(id)}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!preset) {
    return (
      <div className="search-root">
        <div className="search-hero">
          <button className="search-back" type="button" onClick={() => setTarget(null)}>← 换一个目标</button>
          <h1>要学会「{labelOf(target)}」，你已经会什么？</h1>
          <p>这是唯一需要你回答的问题。选错了随时可以换，路线会立刻跟着变。</p>
          <div className="preset-grid">
            {preview.map(({ preset: item, steps: count }) => (
              <button key={item.id} type="button" className="preset-card" onClick={() => setPresetId(item.id)}>
                <strong>{item.label}</strong>
                <span>{item.blurb}</span>
                <em>{count} 步</em>
              </button>
            ))}
          </div>
          <p className="search-hint">
            同一个目标，四种「我已经会什么」，步数从 {Math.min(...preview.map((item) => item.steps))} 到{' '}
            {Math.max(...preview.map((item) => item.steps))} 不等 —— 这就是求解，不是目录。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="search-root reading">
      <header className="reading-head">
        <button type="button" onClick={() => { setPresetId(null); setOpenStep(null); setShowGraph(false); }}>← 改「已知」</button>
        <div>
          <h2>{labelOf(target)}</h2>
          <span>
            从「{preset.label}」出发 · {steps.length} 步 · 总学习成本 {route?.cost}
            {route?.exact ? ' · 精确解' : ' · 近似解'}
          </span>
        </div>
        <button type="button" onClick={() => setTarget(null)}>换目标</button>
      </header>

      <ol className="reading-list">
        {steps.map((step) => {
          const open = openStep === step.pointId;
          return (
            <li key={step.pointId} className={open ? 'is-open' : ''}>
              <button type="button" className="reading-row" onClick={() => setOpenStep(open ? null : step.pointId)}>
                <span className="reading-index">{step.index}</span>
                <span className="dot" style={{ background: colorOf(step.tag) }} />
                <span className="reading-label">{step.label}</span>
                <span className="reading-tag">{step.tag}</span>
                <span className="reading-weight">成本 {step.weight}</span>
              </button>
              {open && (
                <div className="reading-doc">
                  <p className="reading-because">
                    需要它是因为：{step.requires.map((id) => labelOf(id)).join(' + ')} → {step.label}
                  </p>
                  <DocumentBody id={step.pointId} />
                  <details>
                    <summary>这一步的推导本身</summary>
                    <DocumentBody id={step.edgeId} />
                  </details>
                  <div className="reading-next">
                    <button type="button" onClick={() => {
                      const next = steps[step.index];
                      setOpenStep(next ? next.pointId : null);
                    }}>
                      {steps[step.index] ? `读完了，下一步：${steps[step.index].label}` : '这是最后一步'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="reading-graph">
        <button type="button" onClick={() => setShowGraph((value) => !value)}>
          {showGraph ? '收起' : '看看这条路线在图上长什么样'}
        </button>
        {graph && (
          <svg viewBox={`0 0 ${graph.width} ${graph.height}`} style={{ width: '100%', height: 360 }}>
            {graph.links.map((link, index) => (
              <path key={index} d={polyline(link.points)} fill="none" stroke="#cbd5e1" strokeWidth={1.2} />
            ))}
            {graph.nodes.map((node) => (node.kind === 'derivation' ? (
              <circle key={node.id} cx={node.x} cy={node.y} r={4} fill="#94a3b8" />
            ) : (
              <g key={node.id}>
                <rect
                  x={node.x - node.width / 2}
                  y={node.y - node.height / 2}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  fill="#fff"
                  stroke={colorOf(tagOf(node.id))}
                  strokeWidth={1.4}
                />
                <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize={12}>{node.label}</text>
              </g>
            )))}
          </svg>
        )}
      </div>
    </div>
  );
}
