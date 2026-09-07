# 维数

> **节点范围：** 本节点只表示有限维向量空间的维数。有限维性已经拆成独立节点；无限维在下文仅作为定义边界。

## “基的长度”为什么不能立刻拿来定义

一个空间可能有许多组不同的基。若我们还不知道这些基长度相同，就贸然说“维数是某一组基的长度”，答案可能随所选的基改变，这个定义便没有确定含义。

因此逻辑顺序必须是：

1. 先说明空间里存在有限张成组；
2. 再从有限张成组削减出基；
3. 用替换法证明任意两组基等长；
4. 最后才把这个共同长度命名为维数。

前一条推导已经完成了第 2、3 步。尤其是，基等长不是维数定义后的显然事实，而是让维数能够被定义的前提。

## 三个正式定义

设 $V$ 是数域 $\mathbb F$ 上的向量空间。

若 $V$ 中存在某个**有限**向量组张成 $V$ ，就称 $V$ 是**有限维向量空间**。这里并没有预先规定张成组必须线性无关；前面的削减定理保证可以从中删去冗余项，得到一组基。

若不存在任何有限向量组张成 $V$ ，就称 $V$ 是**无限维向量空间**。这只是对“存在有限张成组”的否定。

对有限维向量空间 $V$ ，任取它的一组基。所有基已经被证明长度相同，因此把这个共同长度称为 $V$ 的**维数**，记作

$$
\dim V.
$$

标量域 $\mathbb F$ 是定义的一部分。同一个集合配上不同的标量域，允许的线性组合不同，基与维数也可能改变。

<div class="dimension-check"><style>
.dimension-check{--ink:#18211d;--muted:#5c6862;--line:#cad4ce;--soft:#eef4f0;--good:#246749;--bad:#9a473b;box-sizing:border-box;margin:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;color:var(--ink);font-family:Inter,system-ui,sans-serif}.dimension-check *{box-sizing:border-box}.dimension-check .dc-title{padding:13px 15px;background:var(--soft);font-size:13px;font-weight:800}.dimension-check .dc-head,.dimension-check .dc-row{display:grid;grid-template-columns:1.25fr .95fr 1.35fr}.dimension-check .dc-head{border-top:1px solid var(--line);background:#f8faf8;color:var(--muted);font-size:11px;font-weight:800}.dimension-check .dc-row{border-top:1px solid var(--line)}.dimension-check .dc-cell{min-width:0;padding:11px 12px;border-left:1px solid var(--line);font-size:12px;line-height:1.55}.dimension-check .dc-cell:first-child{border-left:0;font-weight:800}.dimension-check .yes{color:var(--good);font-weight:800}.dimension-check .no{color:var(--bad);font-weight:800}@media(max-width:640px){.dimension-check .dc-head{display:none}.dimension-check .dc-row{grid-template-columns:1fr;padding:8px 12px}.dimension-check .dc-cell{display:grid;grid-template-columns:106px minmax(0,1fr);gap:8px;padding:7px 0;border-left:0}.dimension-check .dc-cell::before{content:attr(data-label);color:var(--muted);font-size:11px;font-weight:800}.dimension-check .dc-cell:first-child{font-size:13px}.dimension-check .dc-cell:first-child::before{content:'已知'}}
</style><div class="dc-title">当 dim V = n 时，长度信息要和性质一起使用</div><div class="dc-head"><div class="dc-cell">已知</div><div class="dc-cell">能否判为基</div><div class="dc-cell">理由</div></div><div class="dc-row"><div class="dc-cell" data-label="已知">长度 n 且线性无关</div><div class="dc-cell yes" data-label="能否判为基">能</div><div class="dc-cell" data-label="理由">扩充为基时已无空位可加</div></div><div class="dc-row"><div class="dc-cell" data-label="已知">长度 n 且张成 V</div><div class="dc-cell yes" data-label="能否判为基">能</div><div class="dc-cell" data-label="理由">削减为基时不能删去任何项</div></div><div class="dc-row"><div class="dc-cell" data-label="已知">只有长度 n</div><div class="dc-cell no" data-label="能否判为基">不能</div><div class="dc-cell" data-label="理由">可能既相关又漏掉目标</div></div><div class="dc-row"><div class="dc-cell" data-label="已知">U⊆V 且 dim U=dim V</div><div class="dc-cell yes" data-label="能否判为 U=V">能推出 U=V</div><div class="dc-cell" data-label="理由">U 的基已是 V 中恰当长度的无关组</div></div></div>

## 第一类完整例子： $\mathbb F^n$

在 $\mathbb F^n$ 中令

$$
\begin{aligned}
e_1&=(1,0,\ldots,0),\\
e_2&=(0,1,\ldots,0),\\
&\ \vdots\\
e_n&=(0,0,\ldots,1).
\end{aligned}
$$

对任意 $(x_1,\ldots,x_n)\in\mathbb F^n$ ，都有

$$
(x_1,\ldots,x_n)
=x_1e_1+\cdots+x_ne_n.
$$

所以 $e_1,\ldots,e_n$ 张成 $\mathbb F^n$ 。

若

$$
a_1e_1+\cdots+a_ne_n=0,
$$

左侧的第 $k$ 个坐标就是 $a_k$ 。与零向量逐坐标比较，得到 $a_1=\cdots=a_n=0$，所以这组向量线性无关。

因此 $e_1,\ldots,e_n$ 是 $\mathbb F^n$ 的一组基，长度为 $n$。于是

$$
\dim_{\mathbb F}\mathbb F^n=n.
$$

下标提醒我们：这里的标量来自 $\mathbb F$ 。

## 第二类完整例子：一个由方程描述的子空间

令

$$
U=\{(x,x,y)\in\mathbb F^3:x,y\in\mathbb F\}.
$$

取

$$
u_1=(1,1,0),\qquad u_2=(0,0,1).
$$

任意 $(x,x,y)\in U$ 都满足

$$
(x,x,y)=xu_1+yu_2,
$$

所以 $u_1,u_2$ 张成 $U$ 。

若 $a u_1+b u_2=0$ ，那么

$$
(a,a,b)=(0,0,0),
$$

逐坐标比较得到 $a=b=0$。因此 $u_1,u_2$ 线性无关，是 $U$ 的一组基。这个基有两项，所以

$$
\dim_{\mathbb F}U=2.
$$

这里不能因为 $U$ 写在 $\mathbb F^3$ 里就说它“有三个坐标，所以维数是三”。维数数的是基的长度；描述环境中使用几个坐标，不等于子空间需要几个无冗余生成向量。

## 零空间为什么维数是零

空向量组的张成空间是 $\{0\}$，并且空向量组线性无关，所以它是零向量空间的一组基。空组长度为 $0$，因此

$$
\dim\{0\}=0.
$$

零空间含有一个向量，却有维数零。这再次说明维数不是“空间中有多少个元素”，而是基含有多少项。

## 同一个集合换标量域，维数会改变

把 $\mathbb C$ 看成复向量空间时，单向量组 $(1)$ 是一组基：每个 $z\in\mathbb C$ 都能唯一写成

$$
z=z\cdot1,
$$

所以

$$
\dim_{\mathbb C}\mathbb C=1.
$$

把同一个集合 $\mathbb C$ 看成实向量空间时，允许的系数只能是实数。此时 $(1,i)$ 是一组基，因为每个 $z=x+yi$ 都能由唯一的实数 $x,y$ 写成

$$
z=x\cdot1+y\cdot i.
$$

因此

$$
\dim_{\mathbb R}\mathbb C=2.
$$

这里向量集合和向量加法都没有改变；改变的是允许作为系数的数域。忽略标量域，就无法正确谈论维数。

## 子空间为什么不会比环境空间维数更大

设 $V$ 有限维， $U$ 是 $V$ 的子空间。先要说明 $U$ 自己也是有限维的。

若 $U=\{0\}$ ，结论已经知道。否则在 $U$ 中选一个非零向量 $u_1$。只要当前组还不张成 $U$，就从 $U$ 中再选一个不属于当前 span 的向量并加入。每次加入后，所得组仍线性无关；否则线性相关性引理会指出某个 $u_k$ 处在 $u_1,\ldots,u_{k-1}$ 的 span 中，与选取 $u_k$ 时的条件矛盾。

这个过程不可能选出比 $V$ 的某个有限基更长的线性无关组，因为长度比较定理说：线性无关组的长度不超过张成 $V$ 的基的长度。因此过程会在有限步内停止，停止时所得组线性无关且张成 $U$，也就是 $U$ 的基。

现在把 $U$ 的基看作 $V$ 中的线性无关组，把 $V$ 的基看作 $V$ 中的张成组。再用一次长度比较，得到

$$
\dim U\le\dim V.
$$

这就是子空间维数定理 2.37 的实质理由：子空间中的无关方向仍是环境空间中的无关方向，所以不可能多于环境空间的一组生成材料。

## 恰当长度为什么只需再查一个条件

设 $\dim V=n$。

**长度为 $n$ 且线性无关。** 若 $v_1,\ldots,v_n$ 线性无关，扩充定理允许把它们保留下来并添加若干向量，得到 $V$ 的一组基。但 $V$ 的每组基长度都是 $n$ ；若真添加了向量，新基就会超过 $n$ 项，矛盾。因此无需添加，原组已经张成 $V$，所以是基。这是 2.38。

**长度为 $n$ 且张成 $V$。** 若 $v_1,\ldots,v_n$ 张成 $V$，削减定理允许删除冗余项，得到 $V$ 的一组基。但每组基长度都是 $n$ ；若真删除了向量，所得基就会少于 $n$ 项，矛盾。因此无需删除，原组已经线性无关，所以是基。这是 2.42。

长度单独不够。在 $\mathbb F^2$ 中，向量组

$$
e_1,\ 2e_1
$$

有两项，而 $\dim\mathbb F^2=2$。但是

$$
2(e_1)-1(2e_1)=0
$$

是一条非平凡关系，并且 $e_2$ 不在它的张成空间中。所以它既不线性无关，也不张成 $\mathbb F^2$，当然不是基。

正确的判据是“恰当长度 + 线性无关”或“恰当长度 + 张成”，而不是只数向量个数。

## 等维子空间为什么只能是整个空间

设 $U$ 是有限维空间 $V$ 的子空间，并且

$$
\dim U=\dim V=n.
$$

取 $U$ 的一组基 $u_1,\ldots,u_n$。它在 $V$ 中仍线性无关，长度又恰好是 $\dim V$，所以由 2.38 可知它也是 $V$ 的基。于是它既张成 $U$ 又张成 $V$：

$$
U=\operatorname{span}(u_1,\ldots,u_n)=V.
$$

因此

$$
U=V.
$$

这就是 2.39。条件“ $U$ 是 $V$ 的子空间”不可省略；维数相同的两个无关空间并不会自动成为同一个集合。

## 无限维只否定有限张成组

令 $\mathcal P(\mathbb F)$ 表示所有系数在 $\mathbb F$ 中的多项式组成的向量空间，运算是通常的多项式加法与标量乘法。

任取其中一个有限多项式组。因为多项式只有有限多个，可以选一个整数 $d$ ，使组中每个非零多项式的次数都不超过 $d$。它们的任意线性组合次数仍不超过 $d$，所以多项式

$$
z^{d+1}
$$

不在这个有限组的张成空间中。若所取的组为空或全由零多项式组成，它显然连常数多项式 $1$ 都不能张成。

因此没有任何有限多项式组能够张成 $\mathcal P(\mathbb F)$，所以它是无限维向量空间。这就是例 2.14 的次数上界论证。

“无限维”在这里仅表示“不存在有限张成组”。它并不等于我们已经构造出某个无穷长的基；无穷基是否存在、怎样定义与怎样构造，是另一个需要额外论证的问题，本页没有使用它。

## 维数现在能安全地告诉我们什么

维数是有限维空间任一组基的共同长度。它依赖标量域，不依赖具体选择哪一组基；它约束线性无关组与张成组的长度，并让我们在已知恰当长度时只需再检查“无关”或“张成”中的一个条件。

这套结论也适用于子空间：子空间维数不超过环境空间维数，等号成立时子空间就是整个空间。所有这些判断都建立在前一页已经证明的削减、替换、扩充与基等长之上，没有使用矩阵、行列式，也没有纳入子空间之和的维数公式。

> 教材对应：Axler《线性代数应该这样学》定义 2.9、定义 2.13、例 2.14、基长度定理 2.34、维数定义 2.35、例 2.36，以及结论 2.37–2.39、2.42。恰当长度判据的理由使用前页已证明的 2.30 与 2.32；本文不使用 2.43。
