# 张成

> **节点范围：** 本节点只表示一个向量组的张成。线性组合是独立前提节点；下文从该动作过渡到张成集合。

## 我们想回答什么问题

手里有几个向量时，我们可以把它们拉长、缩短、反向，再把结果相加。**只允许这些操作，我们究竟能到达哪些向量？** “线性组合”描述一次具体的到达方式，“张成空间”收集所有可能到达的位置。

这比记住一个公式更有用：以后问“这些向量够不够表示整个空间”“某个向量是不是多余”“怎样选一组坐标轴”，本质上都在问张成范围有多大。

## 从动作到定义

设 $v_1,\ldots,v_m$ 是同一个向量空间 $V$ 中的向量，$a_1,\ldots,a_m$ 是数域 $\mathbb F$ 中的标量。向量

$$
a_1v_1+\cdots+a_mv_m
$$

称为 $v_1,\ldots,v_m$ 的一个**线性组合**。系数 $a_k$ 可以是正数、负数或零，所以每个生成向量都可以被缩放、反向或暂时不用。

把所有系数选择都试一遍，所得向量的集合就是

$$
\begin{aligned}
S&=\operatorname{span}(v_1,\ldots,v_m),\\
S&=\{a_1v_1+\cdots+a_mv_m\},\\
&\qquad a_1,\ldots,a_m\in\mathbb F.
\end{aligned}
$$

“span”可以理解为“这些向量能覆盖的全部范围”。空向量组没有任何方向可用，约定它的张成空间是 $\{0\}$。

## 系数如何变成一个位置

下面的实验固定两个二维向量。拖动 $a,b$，观察 $av_1$ 与 $bv_2$ 如何首尾相接得到最终向量。再把两个生成向量切换为平行状态：虽然仍有两个滑块，可达范围会从整个平面塌缩成一条直线。

<div class="span-lab"><style>
.span-lab{--ink:#17231d;--muted:#5b6861;--line:#cbd5cf;--paper:#fbfcfa;--teal:#14747c;--coral:#c95745;--gold:#d7a928;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.span-lab *{box-sizing:border-box}.span-lab .sl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid var(--line);background:#eef5f1}.span-lab h3{margin:0 0 4px;font-size:18px}.span-lab .sl-head p,.span-lab .sl-note{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.span-lab .sl-mode{display:flex;flex:0 0 auto;border:1px solid #aebdb5}.span-lab button{min-height:34px;padding:0 11px;border:0;border-right:1px solid #aebdb5;background:#fff;color:var(--ink);font-weight:700;cursor:pointer}.span-lab button:last-child{border-right:0}.span-lab button[aria-pressed="true"]{background:#1e5d4a;color:#fff}.span-lab button:focus-visible,.span-lab input:focus-visible{outline:3px solid #f0c94e;outline-offset:2px}.span-lab .sl-body{display:grid;grid-template-columns:minmax(210px,.72fr) minmax(0,1.5fr);min-height:350px}.span-lab .sl-controls{display:flex;flex-direction:column;gap:17px;padding:18px;border-right:1px solid var(--line)}.span-lab label{display:grid;grid-template-columns:1fr auto;gap:7px;font-size:12px;font-weight:750}.span-lab output{font-variant-numeric:tabular-nums;color:var(--coral)}.span-lab input{grid-column:1/-1;width:100%;accent-color:var(--teal)}.span-lab .sl-equation{padding:12px;border-left:4px solid var(--gold);background:#fff;font:700 13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}.span-lab .sl-reach{margin-top:auto;padding-top:13px;border-top:1px solid var(--line);font-size:12px}.span-lab .sl-reach strong{display:block;margin-top:3px;color:#17614c;font-size:15px}.span-lab .sl-stage{display:grid;place-items:center;padding:10px;overflow:hidden;background:#fff}.span-lab svg{width:100%;height:auto;aspect-ratio:16/9}.span-lab .grid{stroke:#e5eae7;stroke-width:1}.span-lab .axis{stroke:#a9b5ae;stroke-width:1.4}.span-lab .part-a{stroke:var(--coral);stroke-width:4}.span-lab .part-b{stroke:var(--gold);stroke-width:4}.span-lab .result{stroke:var(--teal);stroke-width:5}.span-lab .sl-note{padding:10px 18px;border-top:1px solid var(--line);background:#fff}.span-lab .sl-note strong{color:var(--ink)}@media(max-width:640px){.span-lab .sl-head{display:grid}.span-lab .sl-mode{width:max-content}.span-lab .sl-body{grid-template-columns:1fr}.span-lab .sl-controls{border-right:0;border-bottom:1px solid var(--line)}.span-lab .sl-stage{padding:4px}.span-lab button{padding:0 9px;font-size:12px}}
</style><div class="sl-head"><div><h3>张成范围实验</h3><p>同样是两个系数，生成向量的方向决定了可达范围。</p></div><div class="sl-mode" role="group" aria-label="生成向量关系"><button type="button" data-mode="plane" aria-pressed="true">不平行</button><button type="button" data-mode="line" aria-pressed="false">互相平行</button></div></div><div class="sl-body"><div class="sl-controls"><label>系数 a <output data-out-a>0.8</output><input data-a aria-label="系数 a" type="range" min="-1.5" max="1.5" step="0.1" value="0.8"></label><label>系数 b <output data-out-b>0.6</output><input data-b aria-label="系数 b" type="range" min="-1.5" max="1.5" step="0.1" value="0.6"></label><div class="sl-equation" aria-live="polite"><div data-formula></div><div data-coordinate></div></div><div class="sl-reach">把系数全部试一遍，可达范围是<strong data-reach>整个平面 ℝ²</strong></div></div><div class="sl-stage"><svg viewBox="0 0 720 405" role="img" aria-label="两个生成向量的线性组合"><defs><marker id="span-arrow-coral" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#c95745"/></marker><marker id="span-arrow-gold" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#d7a928"/></marker><marker id="span-arrow-teal" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#14747c"/></marker></defs><g data-grid></g><line class="part-a" data-part-a marker-end="url(#span-arrow-coral)"/><line class="part-b" data-part-b marker-end="url(#span-arrow-gold)"/><line class="result" data-result marker-end="url(#span-arrow-teal)"/><text data-label-a fill="#a33f32" font-size="13" font-weight="700">av₁</text><text data-label-b fill="#9a7811" font-size="13" font-weight="700">bv₂</text><text data-label-result fill="#0f6168" font-size="14" font-weight="800">av₁+bv₂</text></svg></div></div><p class="sl-note"><strong>观察：</strong>不平行时，两个独立方向可以组合出平面中的任意位置；平行时，改变两个系数仍只能沿同一条线移动。自由参数的个数不等于真正拥有的方向数。</p><script>
(() => {
  const root = document.currentScript.closest('.span-lab'); const svg = root.querySelector('svg'); const grid = root.querySelector('[data-grid]'); const ns = 'http://www.w3.org/2000/svg'; const origin = {x:360,y:202}; const scale = 68;
  for(let i=-5;i<=5;i+=1){const v=document.createElementNS(ns,'line');v.setAttribute('x1',String(origin.x+i*scale));v.setAttribute('x2',String(origin.x+i*scale));v.setAttribute('y1','0');v.setAttribute('y2','405');v.setAttribute('class',i===0?'axis':'grid');grid.append(v);const h=document.createElementNS(ns,'line');h.setAttribute('x1','0');h.setAttribute('x2','720');h.setAttribute('y1',String(origin.y+i*scale));h.setAttribute('y2',String(origin.y+i*scale));h.setAttribute('class',i===0?'axis':'grid');grid.append(h)}
  const inputA=root.querySelector('[data-a]'); const inputB=root.querySelector('[data-b]'); let mode='plane'; const point=(vector,factor=1)=>({x:origin.x+vector[0]*factor*scale,y:origin.y-vector[1]*factor*scale}); const setLine=(line,from,to)=>{line.setAttribute('x1',from.x);line.setAttribute('y1',from.y);line.setAttribute('x2',to.x);line.setAttribute('y2',to.y)};
  const render=()=>{const a=Number(inputA.value);const b=Number(inputB.value);const v1=[2,1];const v2=mode==='plane'?[-1,2]:[1,.5];const pa=point(v1,a);const resultVector=[a*v1[0]+b*v2[0],a*v1[1]+b*v2[1]];const p=point(resultVector);setLine(root.querySelector('[data-part-a]'),origin,pa);setLine(root.querySelector('[data-part-b]'),pa,p);setLine(root.querySelector('[data-result]'),origin,p);const place=(el,pos,dx,dy)=>{el.setAttribute('x',pos.x+dx);el.setAttribute('y',pos.y+dy)};place(root.querySelector('[data-label-a]'),pa,8,-8);place(root.querySelector('[data-label-b]'),p,8,17);place(root.querySelector('[data-label-result]'),p,8,-8);root.querySelector('[data-out-a]').value=a.toFixed(1);root.querySelector('[data-out-b]').value=b.toFixed(1);root.querySelector('[data-formula]').textContent=`${a.toFixed(1)}v₁ + ${b.toFixed(1)}v₂`;root.querySelector('[data-coordinate]').textContent=`= (${resultVector[0].toFixed(1)}, ${resultVector[1].toFixed(1)})`;root.querySelector('[data-reach]').textContent=mode==='plane'?'整个平面 ℝ²':'一条过原点的直线';svg.setAttribute('aria-label',`系数 a 为 ${a.toFixed(1)}，b 为 ${b.toFixed(1)}，结果向量坐标为 ${resultVector[0].toFixed(1)}, ${resultVector[1].toFixed(1)}`)};
  root.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;root.querySelectorAll('[data-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render()}));inputA.addEventListener('input',render);inputB.addEventListener('input',render);render();
})();
</script></div>

## 一个算得出的例子

Axler 在 2.3 节选取 $v_1=(2,1,-3),\quad v_2=(1,-2,4)$。向量 $(17,-4,2)$ 的确可达，因为

$$
(17,-4,2)=6v_1+5v_2.
$$

但把最后一个坐标改成 $5$ 后， $(17,-4,5)$ 就不可达：若前两个坐标成立，系数已经被迫取为 $6$ 和 $5$，这时第三个坐标只能是 $2$，不可能同时变成 $5$。因此“属于某个张成空间”最终可以转化为“关于系数的方程组有没有解”。

## 容易混淆的边界

- 线性组合使用的是**有限个**向量和有限次求和。
- 张成空间一定经过 $0$，因为把所有系数取为零就得到零向量。一个不过原点的仿射平面不是子空间，也不能是某组向量的张成空间。
- 加入一个已经能由其余向量组合出的向量，不会扩大张成空间；它只增加一种重复的描述方式。
- 生成向量本身属于它们的张成空间：令对应系数为 $1$，其余系数为 $0$ 即可。

## 它接下来解决什么

张成把“我能否用这些材料造出目标”变成一个精确问题。再加入“表示方式不能重复”的要求，就会得到线性无关；同时满足“能覆盖”和“不重复”的向量组，就是基。

> Axler 来源：《线性代数应该这样学》第 2A 节，定义 2.2、2.4，例 2.3，以及结论 2.6。
>
> Strang 路线：*Introduction to Linear Algebra*, 5th ed., §1.1, pp. 1-7。教材尚未使用 `span` 术语，但完整给出了“取所有线性组合”以及直线、平面、全空间三种可达范围；本图按概念身份归入同一节点。
