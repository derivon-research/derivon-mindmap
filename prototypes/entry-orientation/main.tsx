// PROTOTYPE — throwaway entry point. See README.md. Not part of the app build.
//
// Only variant F (the settled learning-side design) is kept in the tree. The six
// explored-and-rejected variants were dropped when the prototype was committed.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './prototype.css';
import Final, { name as finalName } from './variants/Final';

function Prototype() {
  return (
    <>
      <div className="variant-stage"><Final /></div>
      <div className="switcher" role="group" aria-label="原型说明">
        <span>F · {finalName}</span>
        <span className="switcher-note">原型 · 数据是真的 math-reforged（293 概念）</span>
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
