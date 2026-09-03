// PROTOTYPE — throwaway entry point. See README.md. Not part of the app build.
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './prototype.css';
import NowForce, { name as nowName } from './variants/NowForce';
import SearchFirst, { name as searchName } from './variants/SearchFirst';
import Atlas, { name as atlasName } from './variants/Atlas';
import Dialogue, { name as dialogueName } from './variants/Dialogue';
import Fusion, { name as fusionName } from './variants/Fusion';

const VARIANTS = [
  { key: '0', name: nowName, Component: NowForce },
  { key: 'A', name: searchName, Component: SearchFirst },
  { key: 'B', name: atlasName, Component: Atlas },
  { key: 'C', name: dialogueName, Component: Dialogue },
  { key: 'D', name: fusionName, Component: Fusion },
];

function readVariant(): string {
  const value = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
  return VARIANTS.some((item) => item.key === value) ? value! : 'D';
}

function Prototype() {
  const [variant, setVariant] = useState(readVariant);

  const go = useCallback((key: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('variant', key);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    setVariant(key);
  }, []);

  const cycle = useCallback((delta: number) => {
    const index = VARIANTS.findIndex((item) => item.key === variant);
    go(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key);
  }, [variant, go]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = document.activeElement;
      const typing = element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || (element instanceof HTMLElement && element.isContentEditable);
      if (typing) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycle]);

  const active = VARIANTS.find((item) => item.key === variant) ?? VARIANTS[1];
  const Component = active.Component;

  return (
    <>
      <div className="variant-stage" key={active.key}><Component /></div>
      <div className="switcher" role="group" aria-label="原型变体切换">
        <button type="button" onClick={() => cycle(-1)} aria-label="上一个变体">←</button>
        <span>{active.key} · {active.name}</span>
        <button type="button" onClick={() => cycle(1)} aria-label="下一个变体">→</button>
        <span className="switcher-note">原型 · 数据是真的 math-reforged（293 概念）· 方向键可切</span>
      </div>
      <p className="provenance">
        一次性原型，不是产品。图与文档取自公开仓库{' '}
        <a href="https://github.com/derivon-research/math-reforged" target="_blank" rel="noreferrer">derivon-research/math-reforged</a>
        ；其中为对 Strang、Axler 等教材的衍生笔记，逐篇标有出处。
      </p>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Prototype /></StrictMode>);
