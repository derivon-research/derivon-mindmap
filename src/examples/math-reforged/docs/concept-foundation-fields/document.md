# 数域

> **节点范围：** 本节点只表示标量数域。有限有序组与坐标空间已经拆成独立节点；下文提到它们，只用于说明数域在线性代数中的作用。

## 线性代数先要约定两种原料

线性代数会反复做两件事：用一个数缩放对象，以及把若干分量按位置组合起来。
如果不先说明“可以用哪些数”和“位置是否属于数据”，后面的向量加法与标量乘法
就没有精确含义。

第一件事产生**数域**与**标量**，第二件事产生**有限有序组**与 $\mathbb F^n$。它们是全书共同使用的语言底座，而不是某个定理的结论。

## 标量来自哪里

Axler 在记号 1.6 中约定

$$
\mathbb F\in\{\mathbb R,\mathbb C\}.
$$

$\mathbb F$ 中的元素称为**标量**。使用 $\mathbb F$ 的好处是：只要一个
论证仅用加、减、乘、除以及这些运算的共同规则，就能同时覆盖实数和复数情形。

### 为什么要有复数

实数中没有平方等于 $-1$ 的数。为使这个方程有解，引入满足

$$
i^2=-1
$$

的数 $i$。定义 1.1 把复数严格定义为实数有序对 $(a,b)$，通常写成 $a+bi$。全体复数构成

$$
\mathbb C=\{a+bi:a,b\in\mathbb R\}.
$$

若 $a,b,c,d\in\mathbb R$，加法与乘法分别定义为

$$
\begin{aligned}
(a+bi)+(c+di)
&=(a+c)\\
&\quad +(b+d)i,
\end{aligned}
$$

$$
\begin{aligned}
(a+bi)(c+di)
&=(ac-bd)\\
&\quad +(ad+bc)i.
\end{aligned}
$$

复数乘法公式不必死记。展开括号并使用 $i^2=-1$，就能重新得到它。教材
例 1.2 计算

$$
\begin{aligned}
(2+3i)(4+5i)
&=8+10i+12i+15i^2\\
&=-7+22i.
\end{aligned}
$$

复数的加法与乘法满足交换律、结合律和分配律；有恒等元 $0,1$ ；每个数有加法逆元；每个非零数有乘法逆元。实数也满足同一套规则。这些性质让 $\mathbb R$ 与 $\mathbb C$ 都成为域。

定义 1.5 用逆元定义减法与除法：减去 $\alpha$ 就是加上它的加法逆元；
除以非零的 $\alpha$ 就是乘以它的乘法逆元。分母非零是不可省略的条件。

> 本图谱沿用教材范围，只把 $\mathbb F$ 解释为 $\mathbb R$ 或 $\mathbb C$。其他域也能支持许多线性代数结论，但不是这里默认的学习对象。

### 数域不能在途中悄悄改变

同一个集合配上不同的标量，可能成为不同的向量空间。例如 $\mathbb C$ 可以按
复标量缩放，也可以只允许实标量缩放；两种结构允许的线性组合不同。

复数也没有与实数一样、能和四则运算兼容的大小次序。除非已经知道一个量是
实数，否则不应写 $z>0$ 或用“正负”讨论复标量。

## 组保存位置，集合只保存成员

定义 1.8 把长度为 $n$ 的组理解为 $n$ 个**按顺序排列**的对象。两个组
相等，当且仅当它们长度相同，而且每个位置上的元素都相同。因此

$$
(3,5)\ne(5,3),
$$

也有

$$
(4,4)\ne(4,4,4).
$$

集合则不同：集合中交换顺序或重复写同一成员，都不会得到新集合。教材还允许长度为 $0$ 的空组 $()$ ；但形如 $(x_1,x_2,\ldots)$ 的无限序列不是有限组。

固定正整数 $n$ 后，定义 1.11 记

$$
\mathbb F^n
=\{(x_1,\ldots,x_n):x_k\in\mathbb F\}.
$$

$x_k$ 是这个组的第 $k$ 个**坐标**。上标 $n$ 记录组的长度，并不是把集合 $\mathbb F$ 做普通乘方。

## 坐标运算为什么必须对齐

在 $\mathbb F^n$ 中，加法与标量乘法都逐坐标进行。若 $x=(x_1,\ldots,x_n)$ 、 $y=(y_1,\ldots,y_n)$，则对每个 $k\in\{1,\ldots,n\}$，

$$
(x+y)_k=x_k+y_k,
$$

而对任意 $\lambda\in\mathbb F$，

$$
(\lambda x)_k=\lambda x_k.
$$

下面改变一个坐标或标量，观察哪些位置随之改变。这个实验要回答的不是“箭头
怎样运动”，而是“有序组的运算会不会把不同位置串在一起”。

<div class="coordinate-lab"><style>
.coordinate-lab{--ink:#17231d;--muted:#5b6761;--line:#c8d2cc;--paper:#fbfcfa;--soft:#f1f5f2;--green:#255f49;--teal:#126f78;--coral:#ba4b3a;--gold:#b48a1c;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.coordinate-lab *{box-sizing:border-box}.coordinate-lab .cl-head{padding:15px 18px;border-bottom:1px solid var(--line);background:var(--soft)}.coordinate-lab h3{margin:0 0 4px;font-size:18px}.coordinate-lab p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.coordinate-lab .cl-controls{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:13px;padding:15px 18px;background:#fff}.coordinate-lab label{display:grid;grid-template-columns:1fr auto;gap:6px;font-size:12px;font-weight:750}.coordinate-lab input{grid-column:1/-1;width:100%;accent-color:var(--teal)}.coordinate-lab input:focus-visible{outline:3px solid #edc74a;outline-offset:2px}.coordinate-lab output{color:var(--coral);font-variant-numeric:tabular-nums}.coordinate-lab .cl-board{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}.coordinate-lab .cl-operation{padding:16px 18px;min-width:0}.coordinate-lab .cl-operation+.cl-operation{border-left:1px solid var(--line)}.coordinate-lab h4{margin:0 0 10px;font-size:14px}.coordinate-lab .cl-row{display:grid;grid-template-columns:42px 1fr;gap:8px;align-items:center;margin:7px 0}.coordinate-lab .cl-row strong{font-size:12px}.coordinate-lab .cl-tuple{display:grid;grid-template-columns:1fr 1fr;gap:6px;font:700 14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}.coordinate-lab .cl-cell{padding:8px;border:1px solid var(--line);background:#fff;text-align:center}.coordinate-lab .cl-cell:first-child{border-color:#d5a295;background:#fff7f4}.coordinate-lab .cl-cell:last-child{border-color:#d1bd78;background:#fffbea}.coordinate-lab .cl-note{padding:10px 18px;border-top:1px solid var(--line);background:var(--soft)}@media(max-width:760px){.coordinate-lab .cl-controls{grid-template-columns:1fr 1fr}.coordinate-lab .cl-board{grid-template-columns:1fr}.coordinate-lab .cl-operation+.cl-operation{border-left:0;border-top:1px solid var(--line)}}@media(max-width:460px){.coordinate-lab .cl-controls{grid-template-columns:1fr}}
</style><div class="cl-head"><h3>位置不串线</h3><p>第一格只和第一格运算，第二格只和第二格运算。</p></div><div class="cl-controls"><label>u₁ <output data-u1-out>2</output><input data-u1 type="range" min="-3" max="3" step="1" value="2" aria-label="向量 u 的第一坐标"></label><label>u₂ <output data-u2-out>-1</output><input data-u2 type="range" min="-3" max="3" step="1" value="-1" aria-label="向量 u 的第二坐标"></label><label>v₁ <output data-v1-out>-1</output><input data-v1 type="range" min="-3" max="3" step="1" value="-1" aria-label="向量 v 的第一坐标"></label><label>v₂ <output data-v2-out>2</output><input data-v2 type="range" min="-3" max="3" step="1" value="2" aria-label="向量 v 的第二坐标"></label><label>标量 λ <output data-lambda-out>2</output><input data-lambda type="range" min="-3" max="3" step="1" value="2" aria-label="标量 lambda"></label></div><div class="cl-board"><div class="cl-operation"><h4>逐坐标相加</h4><div class="cl-row"><strong>u</strong><div class="cl-tuple"><span class="cl-cell" data-u-first>2</span><span class="cl-cell" data-u-second>-1</span></div></div><div class="cl-row"><strong>v</strong><div class="cl-tuple"><span class="cl-cell" data-v-first>-1</span><span class="cl-cell" data-v-second>2</span></div></div><div class="cl-row"><strong>u+v</strong><div class="cl-tuple"><span class="cl-cell" data-sum-first>1</span><span class="cl-cell" data-sum-second>1</span></div></div></div><div class="cl-operation"><h4>同一标量作用于每个位置</h4><div class="cl-row"><strong>u</strong><div class="cl-tuple"><span class="cl-cell" data-scale-u-first>2</span><span class="cl-cell" data-scale-u-second>-1</span></div></div><div class="cl-row"><strong>λu</strong><div class="cl-tuple"><span class="cl-cell" data-scale-first>4</span><span class="cl-cell" data-scale-second>-2</span></div></div></div></div><p class="cl-note"><strong>观察：</strong><span data-status>只改变 u₁ 时，和与倍数的第一格改变，第二格不动。</span></p><script>
(() => {
  const root=document.currentScript.closest('.coordinate-lab');
  const keys=['u1','u2','v1','v2','lambda'];
  const controls=Object.fromEntries(keys.map(key=>[key,root.querySelector(`[data-${key}]`)]));
  const set=(name,value)=>{root.querySelector(`[data-${name}]`).textContent=String(value)};
  const status=root.querySelector('[data-status]');
  status.setAttribute('aria-live','polite');
  const render=()=>{
    const values=Object.fromEntries(keys.map(key=>[key,Number(controls[key].value)]));
    keys.forEach(key=>root.querySelector(`[data-${key}-out]`).value=String(values[key]));
    set('u-first',values.u1);set('u-second',values.u2);set('v-first',values.v1);set('v-second',values.v2);
    set('sum-first',values.u1+values.v1);set('sum-second',values.u2+values.v2);
    set('scale-u-first',values.u1);set('scale-u-second',values.u2);
    set('scale-first',values.lambda*values.u1);set('scale-second',values.lambda*values.u2);
    status.textContent=`当前 u+v=(${values.u1+values.v1}, ${values.u2+values.v2})，λu=(${values.lambda*values.u1}, ${values.lambda*values.u2})。`;
  };
  Object.values(controls).forEach(control=>control.addEventListener('input',render));
  render();
})();
</script></div>

这个实验使用 $\mathbb R^2$，但逐坐标规则对 $\mathbb C^n$ 完全相同。例如

$$
(1,i)+(2,1-i)=(3,1),
$$

以及

$$
i(1,i)=(i,-1).
$$

第二式提醒我们：若工作在 $\mathbb C^2$，允许的标量包括 $i$，不能只保留
实数缩放。

## 零、负向量与几何图像

$\mathbb F^n$ 中的零向量是

$$
0=(0,\ldots,0).
$$

等号左边的 $0$ 是长度为 $n$ 的组，右边每个 $0$ 是标量零；上下文决定类型。
向量 $x=(x_1,\ldots,x_n)$ 的加法逆元是

$$
-x=(-x_1,\ldots,-x_n).
$$

在 $\mathbb R^2$ 中，可以把 $(a,b)$ 画成从原点指向该点的箭头：相加对应
首尾相接，乘以正标量会缩放长度，乘以负标量还会反转方向。这幅几何图只帮助
理解二维情形； $\mathbb R^{5000}$ 同样有严格定义，即使我们无法把它画出来。

## 三个常见误解

- **组不是集合。** 顺序和重复都属于数据。
- **标量乘法不是点积。** 前者输入一个标量和一个向量，输出仍是向量；点积
  输入两个向量，输出是标量，而且要到内积章节才会系统讨论。
- **不同长度的组不能直接相加。** $\mathbb F^2$ 的加法是 $\mathbb F^2\times\mathbb F^2\to\mathbb F^2$ ；它没有定义 $(1,2)+(3,4,5)$。

数域规定“可以拿什么来缩放”，有限有序组规定“坐标怎样保留位置”。下一步会把 $\mathbb F^n$ 中这些运算遵守的规律抽出来：即使对象不再有坐标，也能进行同样的推理。

> 教材对应：Axler《线性代数应该这样学》第 1A 节。复数与运算见定义 1.1、例 1.2、性质 1.3 和定义 1.5； $\mathbb F$ 见记号 1.6；组见定义 1.8 与例 1.9； $\mathbb F^n$ 、坐标及运算见定义 1.11、1.13、1.15、1.17、1.18。
