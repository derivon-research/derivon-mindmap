# 特征值

> **节点范围：** 本节点只表示特征值。特征向量是给定算子与特征值后满足特征方程的非零向量，已经拆成独立节点。

## 在复杂变化中寻找最简单的方向

一个算子可能把大多数向量同时旋转、拉伸和剪切。直接追踪所有向量很困难，于是我们先找一种特殊方向：向量经过算子后仍留在原来的直线上，只是长度改变或方向反转。

这样的方向像是变换内部自带的坐标轴。沿它反复应用算子非常简单：如果 $Tv=\lambda v$，那么 $T^kv=\lambda^kv$。这就是特征向量能帮助理解长期动力、递推数列、微分方程和对角化的原因。

## 从一维不变子空间得到定义

这里的 $T\in\mathcal L(V)$ 是**算子**，也就是从 $V$ 映回 $V$ 的线性映射。取非零向量 $v$，它的全部标量倍组成一条过原点的直线 $\operatorname{span}(v)$。

如果 $T$ 把这条线仍映到自身，那么 $Tv$ 必须是 $v$ 的某个标量倍：

$$
Tv=\lambda v.
$$

此时，标量 $\lambda$ 称为算子 $T$ 的**特征值**，非零向量 $v$ 称为对应于该特征值的**特征向量**。

缩放量的数值会直接告诉我们这个方向发生了什么：

$$
\begin{aligned}
|\lambda|>1 &\quad\text{表示放大},\\
0<|\lambda|<1 &\quad\text{表示缩小},\\
\lambda<0 &\quad\text{还会反向},\\
\lambda=0 &\quad\text{表示压到原点}.
\end{aligned}
$$

为什么必须排除 $v=0$？因为零向量对任意标量都满足

$$
T0=\lambda 0.
$$

若允许零向量，任何数都会毫无区分地成为“特征值”。

## 旋转一个方向，寻找命中时刻

选择算子并转动灰色输入向量。珊瑚色是输出 $Tv$。当两支箭头落在同一条直线上时，当前方向就是特征方向；实验会给出对应缩放量 $\lambda$。

<div class="eigen-lab"><style>
.eigen-lab{--ink:#17231d;--muted:#5b6761;--line:#c9d3cd;--paper:#fbfcfa;--green:#25644f;--teal:#14747c;--coral:#c95745;--gold:#d2a323;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.eigen-lab *{box-sizing:border-box}.eigen-lab .el-head{display:grid;grid-template-columns:1fr auto;gap:14px;padding:16px 18px;border-bottom:1px solid var(--line);background:#eef4f0}.eigen-lab h3{margin:0 0 4px;font-size:18px}.eigen-lab p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.eigen-lab .el-presets{display:flex;border:1px solid #adbbb3}.eigen-lab button{min-height:34px;padding:0 11px;border:0;border-right:1px solid #adbbb3;background:#fff;color:var(--ink);font-size:12px;font-weight:750;cursor:pointer}.eigen-lab button:last-child{border-right:0}.eigen-lab button[aria-pressed="true"]{background:var(--green);color:#fff}.eigen-lab button:focus-visible,.eigen-lab input:focus-visible{outline:3px solid #f0c94e;outline-offset:2px}.eigen-lab .el-body{display:grid;grid-template-columns:minmax(215px,.72fr) minmax(0,1.4fr)}.eigen-lab .el-controls{display:flex;flex-direction:column;gap:15px;padding:18px;border-right:1px solid var(--line)}.eigen-lab label{display:grid;grid-template-columns:1fr auto;gap:7px;font-size:12px;font-weight:750}.eigen-lab input{grid-column:1/-1;width:100%;accent-color:var(--teal)}.eigen-lab output{color:var(--coral);font-variant-numeric:tabular-nums}.eigen-lab .el-matrix{padding:11px;border-left:4px solid var(--gold);background:#fff;font:700 12px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}.eigen-lab .el-status{margin-top:auto;padding:12px;border:1px solid #aebdb5;background:#fff}.eigen-lab .el-status strong{display:block;margin-bottom:3px;font-size:15px;color:var(--ink)}.eigen-lab .el-status[data-hit="true"]{border-color:#2e765d;background:#e9f4ed}.eigen-lab .el-status[data-hit="true"] strong{color:#176247}.eigen-lab .el-stage{display:grid;place-items:center;padding:8px;background:#fff}.eigen-lab svg{width:100%;height:auto;aspect-ratio:16/9}.eigen-lab .grid{stroke:#e5eae7;stroke-width:1}.eigen-lab .axis{stroke:#adb7b1;stroke-width:1.3}.eigen-lab .direction{stroke:#9caaa2;stroke-width:2;stroke-dasharray:7 6}.eigen-lab .input{stroke:#43564c;stroke-width:5}.eigen-lab .output{stroke:var(--coral);stroke-width:5}.eigen-lab .el-foot{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.eigen-lab .el-foot p{padding:10px 18px}.eigen-lab .el-foot p+p{border-left:1px solid var(--line)}.eigen-lab strong{color:var(--ink)}@media(max-width:680px){.eigen-lab .el-head{grid-template-columns:1fr}.eigen-lab .el-presets{width:max-content;max-width:100%}.eigen-lab .el-body{grid-template-columns:1fr}.eigen-lab .el-controls{border-right:0;border-bottom:1px solid var(--line)}.eigen-lab .el-foot{grid-template-columns:1fr}.eigen-lab .el-foot p+p{border-left:0;border-top:1px solid var(--line)}}
</style><div class="el-head"><div><h3>特征方向探测器</h3><p>输出是否仍在输入方向所在的直线上？</p></div><div class="el-presets" role="group" aria-label="选择算子"><button type="button" data-operator="stretch" aria-pressed="true">非均匀拉伸</button><button type="button" data-operator="shear" aria-pressed="false">剪切</button><button type="button" data-operator="rotate" aria-pressed="false">旋转 90°</button></div></div><div class="el-body"><div class="el-controls"><label>输入方向 <output data-angle-out>28°</output><input data-angle aria-label="输入向量方向角" type="range" min="0" max="180" step="1" value="28"></label><div class="el-matrix" aria-live="polite"><div data-operator-name></div><div data-matrix></div><div data-vectors></div></div><div class="el-status" data-status data-hit="false" aria-live="polite"><strong data-status-title>还不是特征方向</strong><span data-status-text>输出离开了输入所在直线。</span></div></div><div class="el-stage"><svg viewBox="0 0 720 405" role="img" aria-label="输入向量与算子输出向量的方向比较"><defs><marker id="eigen-arrow-dark" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#43564c"/></marker><marker id="eigen-arrow-coral" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#c95745"/></marker></defs><g data-grid></g><line class="direction" data-direction/><line class="input" data-input marker-end="url(#eigen-arrow-dark)"/><line class="output" data-output marker-end="url(#eigen-arrow-coral)"/><circle cx="360" cy="202" r="5" fill="#17231d"/><text data-input-label fill="#35453d" font-size="14" font-weight="800">v</text><text data-output-label fill="#a23f32" font-size="14" font-weight="800">Tv</text></svg></div></div><div class="el-foot"><p><strong>读图：</strong>虚线表示输入向量所在的整条直线；同向和反向都算“留在这条线中”。</p><p><strong>试一试：</strong>非均匀拉伸时检查 0° 与 90°；再看实平面上的 90° 旋转为何始终无法命中。</p></div><script>
(() => {
  const root=document.currentScript.closest('.eigen-lab');const ns='http://www.w3.org/2000/svg';const origin={x:360,y:202};const scale=105;const operators={stretch:{name:'非均匀拉伸',m:[1.8,0,0,.65]},shear:{name:'水平剪切',m:[1,1,0,1]},rotate:{name:'逆时针旋转 90°',m:[0,-1,1,0]}};let active='stretch';
  const grid=root.querySelector('[data-grid]');for(let i=-3;i<=3;i+=1){const v=document.createElementNS(ns,'line');v.setAttribute('x1',String(origin.x+i*scale));v.setAttribute('x2',String(origin.x+i*scale));v.setAttribute('y1','0');v.setAttribute('y2','405');v.setAttribute('class',i===0?'axis':'grid');grid.append(v);const h=document.createElementNS(ns,'line');h.setAttribute('x1','0');h.setAttribute('x2','720');h.setAttribute('y1',String(origin.y+i*scale));h.setAttribute('y2',String(origin.y+i*scale));h.setAttribute('class',i===0?'axis':'grid');grid.append(h)}
  const point=v=>({x:origin.x+v[0]*scale,y:origin.y-v[1]*scale});const setLine=(line,a,b)=>{line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y)};const angleInput=root.querySelector('[data-angle]');
  const render=()=>{const angle=Number(angleInput.value);const theta=angle*Math.PI/180;const v=[1.35*Math.cos(theta),1.35*Math.sin(theta)];const op=operators[active];const m=op.m;const tv=[m[0]*v[0]+m[1]*v[1],m[2]*v[0]+m[3]*v[1]];const vNorm=Math.hypot(...v);const tNorm=Math.hypot(...tv);const cross=v[0]*tv[1]-v[1]*tv[0];const hit=tNorm>1e-8&&Math.abs(cross)/(vNorm*tNorm)<.025;const lambda=(v[0]*tv[0]+v[1]*tv[1])/(vNorm*vNorm);const inputEnd=point(v);const outputEnd=point(tv);setLine(root.querySelector('[data-input]'),origin,inputEnd);setLine(root.querySelector('[data-output]'),origin,outputEnd);const unit=[v[0]/vNorm,v[1]/vNorm];setLine(root.querySelector('[data-direction]'),point([-3.3*unit[0],-3.3*unit[1]]),point([3.3*unit[0],3.3*unit[1]]));const place=(el,p)=>{el.setAttribute('x',p.x+8);el.setAttribute('y',p.y-8)};place(root.querySelector('[data-input-label]'),inputEnd);place(root.querySelector('[data-output-label]'),outputEnd);root.querySelector('[data-angle-out]').value=`${angle}°`;root.querySelector('[data-operator-name]').textContent=op.name;root.querySelector('[data-matrix]').textContent=`T = [[${m[0]}, ${m[1]}], [${m[2]}, ${m[3]}]]`;root.querySelector('[data-vectors]').textContent=`v → (${v[0].toFixed(2)}, ${v[1].toFixed(2)}),  Tv → (${tv[0].toFixed(2)}, ${tv[1].toFixed(2)})`;const status=root.querySelector('[data-status]');status.dataset.hit=String(hit);root.querySelector('[data-status-title]').textContent=hit?'命中特征方向':'还不是特征方向';root.querySelector('[data-status-text]').textContent=hit?`Tv ≈ ${lambda.toFixed(2)}v，所以 λ ≈ ${lambda.toFixed(2)}。`:'输出离开了输入所在直线。';root.querySelector('svg').setAttribute('aria-label',`${op.name}作用于方向角 ${angle} 度的向量，${hit?'命中特征方向，缩放量约为 '+lambda.toFixed(2):'输出不与输入共线'}`)};
  root.querySelectorAll('[data-operator]').forEach(button=>button.addEventListener('click',()=>{active=button.dataset.operator;root.querySelectorAll('[data-operator]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render()}));angleInput.addEventListener('input',render);render();
})();
</script></div>

## 一个直接例子

若 $T(x,y)=(2x,3y)$，那么

$$
T(1,0)=2(1,0),\qquad T(0,1)=3(0,1).
$$

所以横轴方向的非零向量都是特征值 $2$ 的特征向量，纵轴方向的非零向量都是特征值 $3$ 的特征向量。一般的向量 $(1,1)$ 会变成 $(2,3)$，方向改变，因此不是特征向量。

注意，特征向量不是孤零零的一支箭头：若 $v$ 是对应于 $\lambda$ 的特征向量，那么任意非零倍数 $cv$ 也满足 $T(cv)=\lambda(cv)$。真正特殊的是一整条一维不变子空间。

## 用零空间表达同一件事

把 $Tv=\lambda v$ 的右侧移到左侧，得到

$$
(T-\lambda I)v=0.
$$

因此对应于 $\lambda$ 的所有特征向量，加上零向量，恰好构成

$$
E(\lambda,T)=\operatorname{null}(T-\lambda I),
$$

称为对应于 $\lambda$ 的**特征空间**。这一步很关键：寻找“保持方向的向量”被改写成寻找一个线性映射的非零零空间。

## 并非每个算子都有实特征方向

Axler 的例 5.9 考察实平面上的 $90°$ 旋转 $T(w,z)=(-z,w)$。任何非零实向量都会被转到垂直方向，不可能成为自身的实数倍，所以它在 $\mathbb R^2$ 上没有特征值。这不是计算失败，而是几何事实。

若把数域扩充到 $\mathbb C$，方程会给出 $\lambda^2=-1$，于是出现特征值 $i$ 与 $-i$。所以“有没有特征值”不仅取决于算子，也取决于所用数域。

> 教材对应：Axler《线性代数应该这样学》第 5A 节，关于一维不变子空间的引入、定义 5.5、5.8，以及例 5.9。
