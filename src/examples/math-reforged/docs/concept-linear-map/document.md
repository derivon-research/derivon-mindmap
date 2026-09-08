# 线性映射

## 线性代数真正研究的对象

向量空间告诉我们哪些对象可以相加、可以乘标量；线性映射则告诉我们怎样在**不破坏这两种运算**的前提下处理这些对象。它可以把几何向量投影到一条线，把多项式变成导数，把一段信号变成若干测量值，也可以把一个坐标系中的描述送到另一个空间。

最值得记住的直觉是：**先组合再映射，和先分别映射再组合，结果相同。** 因此线性映射不会偷偷引入依赖输入大小或位置的新规则。

## 精确定义

设 $V,W$ 是同一数域 $\mathbb F$ 上的向量空间。函数 $T:V\to W$ 是线性映射，如果对任意 $u,v\in V$ 和 $\lambda\in\mathbb F$ 都满足

$$
\begin{aligned}
T(u+v)&=Tu+Tv,\\
T(\lambda v)&=\lambda Tv.
\end{aligned}
$$

第一条叫**可加性**，第二条叫**齐次性**。两条合在一起，意味着 $T$ 保持任意有限线性组合：

$$
\begin{aligned}
&T(a_1v_1+\cdots+a_mv_m)\\
&\qquad=a_1Tv_1+\cdots+a_mTv_m.
\end{aligned}
$$

这正是线性映射可预测、可分解的原因。特别地，线性映射满足 $T0=0$。

所以高中函数 $f(x)=mx+b$ 只有在 $b=0$ 时才是线性代数意义下的线性映射。

## 为什么只看几个方向就够了

在二维空间中，每个向量都能写成 $x e_1+y e_2$。一旦知道 $T e_1$ 和 $T e_2$，保持线性组合就迫使

$$
T(xe_1+ye_2)=xTe_1+yTe_2.
$$

下面选择一种映射并改变输入向量。右图不仅画出 $Tv$，也把它拆成 $xTe_1$ 与 $yTe_2$：这两个基方向的去向已经决定了所有输入的去向。

<div class="map-lab"><style>
.map-lab{--ink:#17231d;--muted:#5d6862;--line:#c9d3cd;--paper:#fbfcfa;--green:#23644e;--teal:#14747c;--coral:#c95745;--gold:#d4a72c;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.map-lab *{box-sizing:border-box}.map-lab .ml-head{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start;padding:16px 18px;border-bottom:1px solid var(--line);background:#f1f5f2}.map-lab h3{margin:0 0 4px;font-size:18px}.map-lab p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.map-lab .ml-presets{display:flex;flex-wrap:wrap;border:1px solid #afbbb4}.map-lab button{min-height:34px;padding:0 10px;border:0;border-right:1px solid #afbbb4;background:#fff;color:var(--ink);font-size:12px;font-weight:750;cursor:pointer}.map-lab button:last-child{border-right:0}.map-lab button[aria-pressed="true"]{background:var(--green);color:#fff}.map-lab button:focus-visible,.map-lab input:focus-visible{outline:3px solid #f0c94e;outline-offset:2px}.map-lab .ml-controls{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(180px,.7fr) minmax(210px,1fr);gap:16px;padding:15px 18px;border-bottom:1px solid var(--line);background:#fff}.map-lab label{display:grid;grid-template-columns:1fr auto;gap:6px;font-size:12px;font-weight:750}.map-lab input{grid-column:1/-1;width:100%;accent-color:var(--teal)}.map-lab output{color:var(--coral);font-variant-numeric:tabular-nums}.map-lab .ml-math{align-self:stretch;padding:10px 12px;border-left:4px solid var(--gold);background:#f7f8f5;font:700 12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}.map-lab .ml-stage{padding:8px;background:#fff}.map-lab svg{width:100%;height:auto;aspect-ratio:19/9}.map-lab .grid{stroke:#e5eae7;stroke-width:1}.map-lab .axis{stroke:#adb7b1;stroke-width:1.2}.map-lab .input-vector{stroke:#43564c;stroke-width:4}.map-lab .part-one{stroke:var(--coral);stroke-width:4}.map-lab .part-two{stroke:var(--gold);stroke-width:4}.map-lab .output-vector{stroke:var(--teal);stroke-width:5}.map-lab .ml-caption{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.map-lab .ml-caption p{padding:10px 18px}.map-lab .ml-caption p+p{border-left:1px solid var(--line)}.map-lab strong{color:var(--ink)}@media(max-width:760px){.map-lab .ml-head{grid-template-columns:1fr}.map-lab .ml-presets{width:max-content;max-width:100%}.map-lab .ml-controls{grid-template-columns:1fr 1fr}.map-lab .ml-math{grid-column:1/-1}.map-lab button{padding:0 8px}}@media(max-width:520px){.map-lab .ml-controls{grid-template-columns:1fr}.map-lab .ml-math{grid-column:auto}.map-lab .ml-caption{grid-template-columns:1fr}.map-lab .ml-caption p+p{border-left:0;border-top:1px solid var(--line)}}
</style><div class="ml-head"><div><h3>一个映射，由基方向决定</h3><p>左侧选择输入，右侧观察映射及其线性分解。</p></div><div class="ml-presets" role="group" aria-label="选择线性映射"><button type="button" data-map="stretch" aria-pressed="true">拉伸</button><button type="button" data-map="shear" aria-pressed="false">剪切</button><button type="button" data-map="rotate" aria-pressed="false">旋转</button><button type="button" data-map="project" aria-pressed="false">投影</button></div></div><div class="ml-controls"><label>输入 x <output data-out-x>1.2</output><input data-x aria-label="输入向量 x 坐标" type="range" min="-2" max="2" step="0.1" value="1.2"></label><label>输入 y <output data-out-y>0.8</output><input data-y aria-label="输入向量 y 坐标" type="range" min="-2" max="2" step="0.1" value="0.8"></label><div class="ml-math" aria-live="polite"><div data-matrix></div><div data-result-text></div><div data-sum-text></div></div></div><div class="ml-stage"><svg viewBox="0 0 760 360" role="img" aria-label="线性映射对基向量和输入向量的作用"><defs><marker id="map-arrow-dark" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#43564c"/></marker><marker id="map-arrow-coral" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#c95745"/></marker><marker id="map-arrow-gold" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#d4a72c"/></marker><marker id="map-arrow-teal" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#14747c"/></marker></defs><text x="180" y="24" text-anchor="middle" font-size="14" font-weight="800">输入空间 V</text><text x="580" y="24" text-anchor="middle" font-size="14" font-weight="800">目标空间 W</text><path d="M345 180H410" stroke="#7f8b84" stroke-width="2"/><path d="M402 174L412 180L402 186" fill="none" stroke="#7f8b84" stroke-width="2"/><text x="378" y="165" text-anchor="middle" font-size="13" font-weight="800">T</text><g data-source-grid></g><g data-target-grid></g><line class="input-vector" data-input marker-end="url(#map-arrow-dark)"/><line class="part-one" data-part-one marker-end="url(#map-arrow-coral)"/><line class="part-two" data-part-two marker-end="url(#map-arrow-gold)"/><line class="output-vector" data-output marker-end="url(#map-arrow-teal)"/><text data-input-label fill="#35453d" font-size="13" font-weight="800">v</text><text data-output-label fill="#0f6168" font-size="13" font-weight="800">Tv</text></svg></div><div class="ml-caption"><p><strong>左图：</strong>v = x e₁ + y e₂，滑块改变它在两个基方向上的用量。</p><p><strong>右图：</strong>珊瑚色是 xT e₁，金色是 yT e₂；首尾相接必定落在青色的 Tv 上。</p></div><script>
(() => {
  const root=document.currentScript.closest('.map-lab');const ns='http://www.w3.org/2000/svg';const origins={source:{x:180,y:180},target:{x:580,y:180}};const scale=55;const maps={stretch:{name:'拉伸',m:[1.6,0,0,.65]},shear:{name:'剪切',m:[1,.8,0,1]},rotate:{name:'旋转 45°',m:[.707,-.707,.707,.707]},project:{name:'投影到 x 轴',m:[1,0,0,0]}};let active='stretch';
  const transform=(m,v)=>[m[0]*v[0]+m[1]*v[1],m[2]*v[0]+m[3]*v[1]];const point=(origin,v)=>({x:origin.x+v[0]*scale,y:origin.y-v[1]*scale});const setLine=(line,a,b)=>{line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y)};const addLine=(group,a,b,kind)=>{const line=document.createElementNS(ns,'line');setLine(line,a,b);line.setAttribute('class',kind);group.append(line)};
  const sourceGrid=root.querySelector('[data-source-grid]');for(let i=-3;i<=3;i+=1){addLine(sourceGrid,point(origins.source,[i,-3]),point(origins.source,[i,3]),i===0?'axis':'grid');addLine(sourceGrid,point(origins.source,[-3,i]),point(origins.source,[3,i]),i===0?'axis':'grid')}
  const drawTargetGrid=(m)=>{const group=root.querySelector('[data-target-grid]');group.replaceChildren();for(let i=-3;i<=3;i+=1){addLine(group,point(origins.target,transform(m,[i,-3])),point(origins.target,transform(m,[i,3])),i===0?'axis':'grid');addLine(group,point(origins.target,transform(m,[-3,i])),point(origins.target,transform(m,[3,i])),i===0?'axis':'grid')}};const inputX=root.querySelector('[data-x]');const inputY=root.querySelector('[data-y]');
  const render=()=>{const map=maps[active];const m=map.m;const x=Number(inputX.value);const y=Number(inputY.value);const v=[x,y];const tv=transform(m,v);const te1=transform(m,[1,0]);const te2=transform(m,[0,1]);drawTargetGrid(m);const sourceEnd=point(origins.source,v);const partOne=point(origins.target,[x*te1[0],x*te1[1]]);const outputEnd=point(origins.target,tv);setLine(root.querySelector('[data-input]'),origins.source,sourceEnd);setLine(root.querySelector('[data-part-one]'),origins.target,partOne);setLine(root.querySelector('[data-part-two]'),partOne,outputEnd);setLine(root.querySelector('[data-output]'),origins.target,outputEnd);const place=(el,p)=>{el.setAttribute('x',p.x+8);el.setAttribute('y',p.y-8)};place(root.querySelector('[data-input-label]'),sourceEnd);place(root.querySelector('[data-output-label]'),outputEnd);root.querySelector('[data-out-x]').value=x.toFixed(1);root.querySelector('[data-out-y]').value=y.toFixed(1);root.querySelector('[data-matrix]').textContent=`${map.name}: [[${m[0].toFixed(2)}, ${m[1].toFixed(2)}], [${m[2].toFixed(2)}, ${m[3].toFixed(2)}]]`;root.querySelector('[data-result-text]').textContent=`T(${x.toFixed(1)}, ${y.toFixed(1)}) = (${tv[0].toFixed(2)}, ${tv[1].toFixed(2)})`;root.querySelector('[data-sum-text]').textContent=`= ${x.toFixed(1)}Te₁ + ${y.toFixed(1)}Te₂`;root.querySelector('svg').setAttribute('aria-label',`${map.name}把输入向量 ${x.toFixed(1)}, ${y.toFixed(1)} 映射为 ${tv[0].toFixed(2)}, ${tv[1].toFixed(2)}`)};
  root.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>{active=button.dataset.map;root.querySelectorAll('[data-map]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render()}));inputX.addEventListener('input',render);inputY.addEventListener('input',render);render();
})();
</script></div>

## 不只是在平面里变形

Axler 在 3.3 节列出的例子刻意跨越了不同对象：

- **微分：**$Dp=p'$。因为 $(f+g)'=f'+g'$ 且 $(\lambda f)'=\lambda f'$，所以微分是线性的。
- **积分：**$Tp=\int_0^1p$。积分同样保持和与标量倍。
- **后向移位：**$(x_1,x_2,x_3,\ldots)\mapsto(x_2,x_3,\ldots)$。它丢掉第一项，但仍保持两种运算。
- **固定乘以 $x^2$：**$p(x)\mapsto x^2p(x)$ 是线性的；这里“线性”描述的是对输入多项式 $p$ 的关系，并不要求结果关于变量 $x$ 只有一次。

这些例子提醒我们：线性不是“图像是一条直线”的同义词，而是**保持向量空间结构**。

## 快速辨认与反例

检查一个映射时，可以先问两个便宜的问题：它是否把 $0$ 映到 $0$？它是否保持任意线性组合？若第一问失败，就已经不可能线性。

例如 $F:\mathbb R\to\mathbb R$，$F(x)=x^2$ 不是线性映射，因为

$$
F(1+1)=4\ne2=F(1)+F(1).
$$

平移 $F(x)=x+3$ 也不是线性的，因为 $F(0)=3\ne0$。另一方面，投影可能把许多非零向量压成 $0$，却仍然完全线性；线性不等于可逆，也不等于保持长度。

## 它为什么重要

线性映射把一个复杂问题拆成可组合的小方向。接下来我们会研究哪些输入被送到零向量、哪些输出真正能到达，以及怎样用矩阵记录基向量的去向。这些问题分别通向零空间、值域、秩和矩阵表示。

> 教材对应：Axler《线性代数应该这样学》第 3A 节，定义 3.1，例 3.3 与线性映射引理 3.4。
