// PROTOTYPE — throwaway entry point. See README.md. Not part of the app build.
//
// 三个变体，回答同一个问题：桌面打开应用看到什么，创作中怎样随时进入当前图的学习模式，
// 以及网页端打开看到什么。`?variant=A|B|C` 与 `?host=desktop|web` 决定渲染哪一格。
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import '../entry-orientation/prototype.css';
import './shell.css';
import type { Host } from './panes';
import VariantA, { name as nameA, blurb as blurbA } from './variants/A';
import VariantB, { name as nameB, blurb as blurbB } from './variants/B';
import VariantC, { name as nameC, blurb as blurbC } from './variants/C';

const VARIANTS = [
  { key: 'A', name: nameA, blurb: blurbA, Component: VariantA },
  { key: 'B', name: nameB, blurb: blurbB, Component: VariantB },
  { key: 'C', name: nameC, blurb: blurbC, Component: VariantC },
];

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const variant = (params.get('variant') ?? 'A').toUpperCase();
  const host: Host = params.get('host') === 'web' ? 'web' : 'desktop';
  return { variant: VARIANTS.some((item) => item.key === variant) ? variant : 'A', host };
}

function Prototype() {
  const initial = readParams();
  const [variant, setVariant] = useState(initial.variant);
  const [host, setHost] = useState<Host>(initial.host);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant);
    url.searchParams.set('host', host);
    window.history.replaceState(null, '', url);
  }, [variant, host]);

  useEffect(() => {
    const cycle = (delta: number) => {
      const index = VARIANTS.findIndex((item) => item.key === variant);
      setVariant(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant]);

  const current = VARIANTS.find((item) => item.key === variant)!;
  const { Component } = current;

  return (
    <>
      <div className="tm-stage" key={`${variant}-${host}-${resetKey}`}>
        <Component host={host} />
      </div>

      <div className="switcher" role="group" aria-label="原型切换">
        <button type="button" onClick={() => setVariant(VARIANTS[(VARIANTS.findIndex((i) => i.key === variant) + 2) % 3].key)}>
          ←
        </button>
        <span>
          {current.key} · {current.name}
        </span>
        <button type="button" onClick={() => setVariant(VARIANTS[(VARIANTS.findIndex((i) => i.key === variant) + 1) % 3].key)}>
          →
        </button>
        <span className="tm-host-toggle">
          <button type="button" className={host === 'desktop' ? 'is-active' : ''} onClick={() => setHost('desktop')}>
            桌面
          </button>
          <button type="button" className={host === 'web' ? 'is-active' : ''} onClick={() => setHost('web')}>
            网页
          </button>
        </span>
        <button type="button" className="tm-reset" title="回到冷启动第一帧" onClick={() => setResetKey((n) => n + 1)}>
          ↺
        </button>
        <span className="switcher-note">{current.blurb}</span>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Prototype />
  </StrictMode>,
);
