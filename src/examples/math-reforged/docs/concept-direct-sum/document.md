# 直和

> **节点范围：** 本节点只表示直和，即子空间之和中的分解唯一性。子空间的和是独立前提节点；下文先回顾它再讨论直和判据。

## 把几个子空间放在一起，不能只取并集

设 $U$ 与 $W$ 是向量空间 $V$ 的子空间。若只取集合并集 $U\cup W$，我们会漏掉跨子空间相加得到的新向量。例如在 $\mathbb R^2$ 中，横轴上的 $(1,0)$ 与纵轴上的 $(0,1)$ 都在并集中，但它们的和 $(1,1)$ 不在。

若希望得到一个同时包含两个方向、又允许线性运算的集合，就必须把这些跨空间的和也收进来。

## 子空间之和收集所有可能的分量组合

Axler 的定义 1.36 说，若 $m$ 是正整数， $V_1,\ldots,V_m$ 是同一向量空间 $V$ 的子空间，则它们的和是

$$
\begin{aligned}
V_1+\cdots+V_m
=\{\,&v_1+\cdots+v_m:\\
&v_k\in V_k\,\}.
\end{aligned}
$$

因此 $v\in V_1+\cdots+V_m$ 的含义是：**存在** $v_1\in V_1,\ldots,v_m\in V_m$，使 $v=v_1+\cdots+v_m$。这个存在量词只针对和中的元素，并不自动说明这个和等于整个环境空间 $V$。

必须区分三件事：

| 陈述 | 实际含义 |
| --- | --- |
| $v\in U+W$ | 当前向量至少有一个 $u+w$ 表示 |
| $U+W=V$ | $V$ 中每个向量都有这种表示 |
| $U\oplus W$ | 和中的每个向量都有唯一表示 |

子空间之和也不同于数的加法。符号 $U+W$ 表示一个由向量组成的新集合。

## 教材例 1.38：求和必须证明两个包含方向

在 $\mathbb F^4$ 中取

$$
U=\{(x,x,y,y):x,y\in\mathbb F\},
$$

$$
W=\{(x,x,x,y):x,y\in\mathbb F\}.
$$

先取 $(a,a,b,b)\in U$ 与 $(c,c,c,d)\in W$。它们的和是

$$
(a+c,a+c,b+c,b+d).
$$

前两个坐标一定相等，因此

$$
U+W
\subseteq
\{(x,x,y,z):x,y,z\in\mathbb F\}.
$$

这只证明了一个方向。为了证明反向包含，任取 $(x,x,y,z)\in\mathbb F^4$。教材给出分解

$$
\begin{aligned}
(x,x,y,z)
&=(x,x,y,y)\\
&\quad +(0,0,0,z-y).
\end{aligned}
$$

第一项属于 $U$，第二项属于 $W$。因此反向包含也成立，最终得到

$$
U+W
=\{(x,x,y,z):x,y,z\in\mathbb F\}.
$$

描述子空间之和时，既要找出所有和满足的约束，也要为每个满足约束的候选向量构造分解。结论 1.40 还说明，这个和是包含所有求和项的最小子空间；完整证明由相邻推导页承担。

## 为什么“能分解”还不够

按照和的定义，每个 $v\in V_1+\cdots+V_m$ 至少可以写成一次 $v=v_1+\cdots+v_m$。但同一个 $v$ 可能有很多种写法。若我们想把 $v$ 看成由几个互不含糊的分量组成，就需要唯一性。

定义 1.41 说：如果和中的每个向量都能唯一写成

$$
v=v_1+\cdots+v_m,
\qquad
v_k\in V_k,
$$

那么这个和称为**直和**，记作

$$
V_1\oplus\cdots\oplus V_m.
$$

符号 $\oplus$ 没有增加新的向量；它只是在普通子空间之和上增加“表示唯一”这一信息。若还知道和覆盖整个环境空间，才写 $V=V_1\oplus\cdots\oplus V_m$。这里等号负责“每个 $V$ 中向量都有分解”，直和符号负责“分解唯一”。

## 分解实验：唯一、无解还是多解

在 $\mathbb R^2$ 中固定横轴

$$
U=\{(a,0):a\in\mathbb R\},
$$

并令

$$
W_s=\{b(1,s):b\in\mathbb R\}.
$$

把目标 $(x,y)$ 写成一个 $U$ 分量与一个 $W_s$ 分量，就是求

$$
(x,y)=a(1,0)+b(1,s)=(a+b,bs).
$$

改变 $s,x,y$，观察方程是有唯一解、无解还是有无穷多解。

<div class="direct-sum-lab"><style>
.direct-sum-lab{--ink:#17231d;--muted:#5b6761;--line:#c8d2cc;--paper:#fbfcfa;--soft:#f1f5f2;--green:#255f49;--teal:#126f78;--coral:#b84939;--gold:#b58b1d;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.direct-sum-lab *{box-sizing:border-box}.direct-sum-lab .dsl-head{padding:15px 18px;border-bottom:1px solid var(--line);background:var(--soft)}.direct-sum-lab h3{margin:0 0 4px;font-size:18px}.direct-sum-lab p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.direct-sum-lab .dsl-body{display:grid;grid-template-columns:minmax(210px,.72fr) minmax(0,1.28fr)}.direct-sum-lab .dsl-controls{display:grid;align-content:start;gap:15px;padding:18px;border-right:1px solid var(--line)}.direct-sum-lab label{display:grid;grid-template-columns:1fr auto;gap:7px;font-size:12px;font-weight:750}.direct-sum-lab input{grid-column:1/-1;width:100%;accent-color:var(--teal)}.direct-sum-lab input:focus-visible{outline:3px solid #edc74a;outline-offset:2px}.direct-sum-lab output{color:var(--coral);font-variant-numeric:tabular-nums}.direct-sum-lab .dsl-status{padding:11px 12px;border-left:4px solid var(--green);background:#eef6f2}.direct-sum-lab .dsl-status[data-kind="none"]{border-left-color:var(--coral);background:#fff1ed}.direct-sum-lab .dsl-status[data-kind="many"]{border-left-color:var(--gold);background:#fff9e8}.direct-sum-lab .dsl-status strong{display:block;margin-bottom:4px;font-size:14px}.direct-sum-lab code{display:block;color:var(--ink);font:700 12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.direct-sum-lab .dsl-stage{display:grid;place-items:center;min-width:0;padding:8px;background:#fff}.direct-sum-lab svg{display:block;width:100%;height:auto;aspect-ratio:26/17}.direct-sum-lab .grid{stroke:#e5eae7;stroke-width:1}.direct-sum-lab .axis{stroke:#a4afa9;stroke-width:1.3}.direct-sum-lab .space-u{stroke:var(--coral);stroke-width:5;opacity:.72}.direct-sum-lab .space-w{stroke:var(--gold);stroke-width:5;opacity:.72}.direct-sum-lab .target{stroke:#405149;stroke-width:4}.direct-sum-lab .part-u{stroke:var(--coral);stroke-width:5}.direct-sum-lab .part-w{stroke:var(--gold);stroke-width:5}.direct-sum-lab .dsl-foot{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);background:var(--soft)}.direct-sum-lab .dsl-foot p{padding:10px 18px}.direct-sum-lab .dsl-foot p+p{border-left:1px solid var(--line)}@media(max-width:700px){.direct-sum-lab .dsl-body{grid-template-columns:1fr}.direct-sum-lab .dsl-controls{grid-template-columns:1fr 1fr;border-right:0;border-bottom:1px solid var(--line)}.direct-sum-lab .dsl-status{grid-column:1/-1}}@media(max-width:460px){.direct-sum-lab .dsl-controls{grid-template-columns:1fr}.direct-sum-lab .dsl-status{grid-column:auto}.direct-sum-lab .dsl-foot{grid-template-columns:1fr}.direct-sum-lab .dsl-foot p+p{border-left:0;border-top:1px solid var(--line)}}
</style><div class="dsl-head"><h3>两条方向能否给出唯一分量</h3><p>珊瑚色是 U，金色是 Wₛ；目标箭头是否能唯一拆成这两个方向？</p></div><div class="dsl-body"><div class="dsl-controls"><label>方向参数 s <output data-s-out>1.0</output><input data-s type="range" min="-2" max="2" step="0.5" value="1" aria-label="子空间 W 的方向参数 s"></label><label>目标 x <output data-x-out>1.0</output><input data-x type="range" min="-2" max="2" step="0.5" value="1" aria-label="目标向量 x 坐标"></label><label>目标 y <output data-y-out>1.0</output><input data-y type="range" min="-2" max="2" step="0.5" value="1" aria-label="目标向量 y 坐标"></label><div class="dsl-status" data-status data-kind="unique" aria-live="polite"><strong data-title>唯一分解</strong><code data-equation>b=y/s=1.00，a=x-b=0.00</code><span data-explanation>两条直线不同，任意目标都有且只有一种分解。</span></div></div><div class="dsl-stage"><svg data-svg viewBox="0 0 520 340" role="img" aria-label="目标向量在两个一维子空间中的分解"><defs><marker id="ds-arrow-target" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#405149"/></marker><marker id="ds-arrow-u" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#b84939"/></marker><marker id="ds-arrow-w" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#b58b1d"/></marker></defs><g data-grid></g><line class="space-u" data-space-u/><line class="space-w" data-space-w/><line class="target" data-target marker-end="url(#ds-arrow-target)"/><line class="part-u" data-part-u marker-end="url(#ds-arrow-u)"/><line class="part-w" data-part-w marker-end="url(#ds-arrow-w)"/><circle cx="260" cy="170" r="4" fill="#17231d"/></svg></div></div><div class="dsl-foot"><p><strong>当 s≠0：</strong>两个方向不重合，b=y/s 与 a=x-y/s 被迫唯一。</p><p><strong>当 s=0：</strong>两个子空间重合；横轴外目标无解，横轴上目标有无穷多种拆法。</p></div><script>
(() => {
  const root=document.currentScript.closest('.direct-sum-lab');
  const ns='http://www.w3.org/2000/svg';
  const origin={x:260,y:170};
  const controls={s:root.querySelector('[data-s]'),x:root.querySelector('[data-x]'),y:root.querySelector('[data-y]')};
  const make=(tag,attrs={})=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));return el};
  const grid=root.querySelector('[data-grid]');
  for(let i=-4;i<=4;i+=1){grid.append(make('line',{x1:origin.x+i*50,x2:origin.x+i*50,y1:0,y2:340,class:i===0?'axis':'grid'}));grid.append(make('line',{x1:0,x2:520,y1:origin.y+i*50,y2:origin.y+i*50,class:i===0?'axis':'grid'}))}
  const setLine=(line,a,b)=>{line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y)};
  const format=value=>Math.abs(value)<1e-9?'0.00':value.toFixed(2);
  const render=()=>{
    const s=Number(controls.s.value),x=Number(controls.x.value),y=Number(controls.y.value);
    root.querySelector('[data-s-out]').value=s.toFixed(1);root.querySelector('[data-x-out]').value=x.toFixed(1);root.querySelector('[data-y-out]').value=y.toFixed(1);
    const unique=Math.abs(s)>1e-9,none=!unique&&Math.abs(y)>1e-9,kind=unique?'unique':(none?'none':'many');
    let a=0,b=0,title,equation,explanation;
    if(unique){b=y/s;a=x-b;title='唯一分解';equation=`b=y/s=${format(b)}，a=x-b=${format(a)}`;explanation='两条直线不同，任意目标都有且只有一种分解。'}
    else if(none){title='无解';equation=`bs=0，但目标第二坐标 y=${format(y)}`;explanation='目标不在 U+W₀ 中；此时 U+W₀ 只是横轴。'}
    else{title='多解';equation=`x=a+b；例如 (a,b)=(${format(x)},0) 或 (${format(x-1)},1)`;explanation='目标在横轴上，但同一向量有无穷多种分解。';a=x;b=0}
    const extent=unique?Math.max(3,Math.abs(a),Math.abs(b),Math.abs(x),Math.abs(y)):3,scale=130/extent;
    const point=([px,py])=>({x:origin.x+px*scale,y:origin.y-py*scale});
    setLine(root.querySelector('[data-space-u]'),point([-extent,0]),point([extent,0]));const t=extent/Math.max(1,Math.abs(s));setLine(root.querySelector('[data-space-w]'),point([-t,-s*t]),point([t,s*t]));setLine(root.querySelector('[data-target]'),origin,point([x,y]));
    const partU=root.querySelector('[data-part-u]'),partW=root.querySelector('[data-part-w]');
    if(none){partU.style.display='none';partW.style.display='none'}else{partU.style.display='';partW.style.display='';const uEnd=point([a,0]);setLine(partU,origin,uEnd);setLine(partW,uEnd,point([a+b,b*s]))}
    const status=root.querySelector('[data-status]');status.dataset.kind=kind;root.querySelector('[data-title]').textContent=title;root.querySelector('[data-equation]').textContent=equation;root.querySelector('[data-explanation]').textContent=explanation;root.querySelector('[data-svg]').setAttribute('aria-label',`U 是横轴，W 的方向为 1, ${s.toFixed(1)}。目标为 ${x.toFixed(1)}, ${y.toFixed(1)}。分解状态：${title}。${equation}`);
  };
  Object.values(controls).forEach(control=>control.addEventListener('input',render));render();
})();
</script></div>

实验揭示了三个不同问题：

- 当 $s\ne0$ 时， $U+W_s=\mathbb R^2$，而且和为直和；
- 当 $s=0$ 且 $y\ne0$ 时，目标甚至不属于 $U+W_0$ ；
- 当 $s=0$ 且 $y=0$ 时，目标属于和，却有无穷多种表示。

所以“覆盖”与“唯一”必须分别检查。

## 教材中的正例：平面加坐标轴

例 1.42 在 $\mathbb F^3$ 中取

$$
U=\{(x,y,0):x,y\in\mathbb F\},
$$

$$
W=\{(0,0,z):z\in\mathbb F\}.
$$

每个 $(x,y,z)\in\mathbb F^3$ 都有分解

$$
(x,y,z)=(x,y,0)+(0,0,z).
$$

逐坐标比较可知这个分解也是唯一的。因此

$$
\mathbb F^3=U\oplus W.
$$

例 1.43 把同一想法推广到 $\mathbb F^n$ 的各个坐标轴子空间。这里不需要内积，也没有使用“垂直”作为定义；直和只关心表示唯一。

## 教材中的反例：覆盖整个空间仍不够

例 1.44 在 $\mathbb F^3$ 中取

$$
\begin{aligned}
V_1&=\{(x,y,0):x,y\in\mathbb F\},\\
V_2&=\{(0,0,z):z\in\mathbb F\},\\
V_3&=\{(0,y,y):y\in\mathbb F\}.
\end{aligned}
$$

每个 $(x,y,z)$ 都能写成 $(x,y,0)+(0,0,z)+(0,0,0)$，所以 $\mathbb F^3=V_1+V_2+V_3$。但零向量除了全零分解外，还有

$$
\begin{aligned}
(0,0,0)
&=(0,1,0)+(0,0,1)\\
&\quad +(0,-1,-1).
\end{aligned}
$$

三个分量依次属于 $V_1,V_2,V_3$，却不全为零。因此表示不唯一，这个和不是直和。更值得警惕的是，三个子空间任意两个的交集都是 $\{0\}$ ；所以三个以上子空间“两两交零”仍不足以保证直和。

## 把唯一性集中到零向量

结论 1.45 说： $V_1+\cdots+V_m$ 是直和，当且仅当方程

$$
v_1+\cdots+v_m=0,
\qquad
v_k\in V_k
$$

只有全零解。两种表示相减后会变成零向量的一种表示；反过来，零向量若有非平凡表示，就能制造表示歧义。完整的两个方向由相邻推导页证明。

当只有两个子空间时，结论 1.46 进一步化为

$$
U+W\text{ 是直和}
\quad\Longleftrightarrow\quad
U\cap W=\{0\}.
$$

这个交集判据只可直接用于两个子空间，例 1.44 已说明为什么不能机械推广。

## 直和不偷偷附加别的条件

- **不要求正交。** 两条不垂直的不同过原点直线仍可给出 $\mathbb R^2$ 的直和。
- **不要求有限维。** 定义与判据本身没有维数假设。
- **直和不必等于整个环境空间。** 只有另写等号 $V=V_1\oplus\cdots\oplus V_m$ 时，才声称覆盖 $V$。

直和提供一种“不重不漏”的分解语言。后面当空间被拆成不变子空间、广义特征空间或正交补时，都必须分别回答：各分量能否覆盖目标空间，以及这种分解是否唯一。

> 教材对应：Axler《线性代数应该这样学》第 1C 节。子空间之和定义 1.36，计算例 1.38，最小子空间结论 1.40，直和定义 1.41，正例 1.42-1.43，非例 1.44，零分解判据 1.45，以及两个子空间的交集判据 1.46。本节没有有限维假设。
