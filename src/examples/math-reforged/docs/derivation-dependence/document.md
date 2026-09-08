# 从表示唯一到可删除的向量

## 现在为什么要做这一步

张成已经告诉我们，若

$$
u\in\operatorname{span}(v_1,\ldots,v_m),
$$

就至少存在一组标量 $a_1,\ldots,a_m\in\mathbb F$，使

$$
u=a_1v_1+\cdots+a_mv_m.
$$

“至少存在”还留下两个问题：这组系数是否唯一？如果不唯一，怎样从向量组中准确找出一个多余项，而不是凭图形猜测？

下面只使用 `span` 这个前提已经提供的内容： $V$ 是 $\mathbb F$ 上的向量空间， $v_1,\ldots,v_m$ 是有限有序向量组，span 收集它们的全部线性组合，并且 $\operatorname{span}()=\{0\}$。不使用基、维数或有限维空间中的长度结论；空间 $V$ 本身可以是无限维的。

## 先把“唯一表示”化成一个零向量问题

考虑下面两个陈述：

- **唯一表示：** $\operatorname{span}(v_1,\ldots,v_m)$ 中每个向量都只有一组关于 $v_1,\ldots,v_m$ 的系数表示。
- **零关系平凡：** 若 $a_1v_1+\cdots+a_mv_m=0$，则必有 $a_1=\cdots=a_m=0$。

我们要证明二者等价。这样，只检查一个特殊目标 $0$，就能回答 span 中所有向量的表示是否唯一。

### 零关系平凡，为什么能保证每个表示唯一

假设零向量只有平凡表示。任取 $u\in\operatorname{span}(v_1,\ldots,v_m)$，再假设它有两组表示：

$$
\begin{aligned}
u&=a_1v_1+\cdots+a_mv_m,\\
u&=c_1v_1+\cdots+c_mv_m.
\end{aligned}
$$

我们的计划是消去共同的目标 $u$，把“两组表示是否相同”改写成一个零关系。两式相减得到

$$
(a_1-c_1)v_1+\cdots+(a_m-c_m)v_m=0.
$$

按假设，零关系只能是平凡的，所以对每个 $j\in\{1,\ldots,m\}$ 都有

$$
a_j-c_j=0.
$$

因此 $a_j=c_j$ 对每个 $j$ 都成立。任取的两组表示其实相同，所以每个 $u$ 的表示唯一。

### 每个表示唯一，为什么能排除非平凡零关系

现在反过来，假设 span 中每个向量的表示唯一。零向量总有全零系数表示：

$$
0=0v_1+\cdots+0v_m.
$$

若另有系数 $a_1,\ldots,a_m$ 满足

$$
0=a_1v_1+\cdots+a_mv_m,
$$

那么这也是零向量的一组表示。唯一性迫使它与全零系数表示相同，于是 $a_1=\cdots=a_m=0$。所以零向量没有非平凡表示。

两个方向合在一起，我们得到

$$
\begin{aligned}
&\text{span 中每个向量的表示唯一}\\
&\quad\Longleftrightarrow\\
&\text{零向量只有平凡线性组合表示}.
\end{aligned}
$$

这时才给结论命名：满足右侧条件的向量组叫作**线性无关组**；不满足它，也就是存在非平凡零关系的向量组，叫作**线性相关组**。空向量组没有非平凡系数可选，因此按约定线性无关。

<div class="dependence-flow"><style>
.dependence-flow{--ink:#17221d;--muted:#5c6861;--line:#cbd4cf;--soft:#f1f5f2;--green:#246749;--red:#a84438;box-sizing:border-box;margin:20px 0;padding:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--soft);color:var(--ink);font-family:Inter,system-ui,sans-serif}.dependence-flow *{box-sizing:border-box}.dependence-flow .df-title{padding:13px 16px 10px;font-size:13px;font-weight:800}.dependence-flow .df-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid var(--line);background:#fff}.dependence-flow .df-step{min-width:0;padding:14px 13px;border-left:1px solid var(--line)}.dependence-flow .df-step:first-child{border-left:0}.dependence-flow .df-no{display:block;margin-bottom:7px;color:var(--green);font-size:11px;font-weight:850}.dependence-flow .df-main{font-size:12px;font-weight:750;line-height:1.55}.dependence-flow .df-use{display:block;margin-top:8px;color:var(--muted);font-size:11px;line-height:1.5}.dependence-flow .df-step:last-child .df-no{color:var(--red)}@media(max-width:760px){.dependence-flow .df-grid{grid-template-columns:1fr}.dependence-flow .df-step{border-left:4px solid var(--green);border-top:1px solid var(--line);padding:12px 14px}.dependence-flow .df-step:first-child{border-left:4px solid var(--green);border-top:0}.dependence-flow .df-step:last-child{border-left-color:var(--red)}}
</style><div class="df-title">一条关系怎样变成一个可删除位置</div><div class="df-grid"><div class="df-step"><span class="df-no">01 比较表示</span><div class="df-main">同一 u 有两组系数</div><span class="df-use">使用 span 的表示含义</span></div><div class="df-step"><span class="df-no">02 相减</span><div class="df-main">得到系数差组成的零关系</div><span class="df-use">使用向量加法与标量乘法</span></div><div class="df-step"><span class="df-no">03 命名</span><div class="df-main">只有平凡零关系 ⇔ 表示唯一</div><span class="df-use">得到线性无关的含义</span></div><div class="df-step"><span class="df-no">04 找位置</span><div class="df-main">相关时取最大非零系数下标 k</div><span class="df-use">使用向量组有限</span></div><div class="df-step"><span class="df-no">05 消去</span><div class="df-main">除以 aₖ，解出 vₖ 并删除它</div><span class="df-use">使用非零域元素可逆</span></div></div></div>

## 线性相关性引理：相关组里一定有可删除项

现在设 $v_1,\ldots,v_m$ 线性相关。按刚刚现场给出的定义，存在不全为零的 $a_1,\ldots,a_m\in\mathbb F$，使

$$
a_1v_1+\cdots+a_mv_m=0.
$$

我们想把其中一个向量单独解出来。不能随便挑一个下标，因为它的系数可能是零；也不能直接挑“最后一个向量”，因为最后一项的系数也可能是零。

令

$$
I=\{j\in\{1,\ldots,m\}:a_j\ne0\}.
$$

系数不全为零，所以 $I$ 非空。向量组是有限的，所以 $I$ 是非空有限集合，因而存在最大元素。记

$$
k=\max I.
$$

这里正是“有限向量组”发挥作用的地方。由 $k$ 的选取，对每个 $j>k$ 都有 $a_j=0$，原关系可缩短为

$$
\sum_{j=1}^{k}a_jv_j=0,
\qquad a_k\ne0.
$$

因为 $\mathbb F$ 是数域，每个非零标量都有乘法逆元；于是可以移项并除以 $a_k$：

$$
v_k=-\sum_{j=1}^{k-1}\frac{a_j}{a_k}v_j.
$$

右侧只使用排在 $v_k$ 前面的向量，因此

$$
v_k\in\operatorname{span}(v_1,\ldots,v_{k-1}).
$$

### $k=1$ 时公式里发生了什么

约定求和下限大于上限时结果为 $0$，也就是空线性组合。若最大非零下标是 $1$，关系就是 $a_1v_1=0$。因为 $a_1\ne0$，乘以 $a_1^{-1}$ 得 $v_1=0$。已知

$$
\operatorname{span}()=\{0\},
$$

所以仍有 $v_1\in\operatorname{span}()$。这不是另一个定理，而是上面“由前项表示”在前面没有任何项时的边界情况。

至此已经证明：每个有限线性相关组中，都存在某个下标 $k$，使第 $k$ 项处于所有前项的张成空间中。

## 反向检查：这样的下标也一定制造相关性

若对某个 $k$ 已知

$$
v_k=\sum_{j=1}^{k-1}b_jv_j,
$$

当 $k=1$ 时，右侧理解为空线性组合，因此就是 $v_1=0$。把等式移到一侧可得

$$
\sum_{j=1}^{k-1}b_jv_j-v_k=0.
$$

$v_k$ 的系数是 $-1$，不是零，所以这是一条非平凡零关系。于是向量组线性相关。

因此，对有限有序向量组，下面两件事等价：存在非平凡零关系；存在一个位置 $k$，其向量可由排在它前面的向量表示。顺序影响的是哪个 $k$ 可以充当证人，不影响非平凡零关系是否存在，也就不影响线性相关性本身。

## 为什么删去这个 $v_k$ 不改变 span

设 $k$ 满足

$$
v_k=\sum_{j=1}^{k-1}b_jv_j,
$$

并把删去第 $k$ 项后的向量组记作

$$
L'=(v_1,\ldots,v_{k-1},v_{k+1},\ldots,v_m).
$$

要证明删除前后张成空间相等，必须证明两个方向的集合包含关系。

**删后的 span 不会更大。** $L'$ 的每个向量本来就在原组里，所以 $L'$ 的任意线性组合也是原组的线性组合。因此

$$
\operatorname{span}(L')
\subseteq
\operatorname{span}(v_1,\ldots,v_m).
$$

**删后的 span 也不会更小。** 任取

$$
u\in\operatorname{span}(v_1,\ldots,v_m).
$$

存在 $c_1,\ldots,c_m\in\mathbb F$ 使

$$
u=\sum_{j=1}^{m}c_jv_j.
$$

把 $v_k$ 的前项表示代入，得到

$$
\begin{aligned}
u={}&\sum_{j=1}^{k-1}(c_j+c_kb_j)v_j\\
&+\sum_{j=k+1}^{m}c_jv_j.
\end{aligned}
$$

右侧没有 $v_k$，所以 $u\in\operatorname{span}(L')$。由于 $u$ 是任取的，

$$
\operatorname{span}(v_1,\ldots,v_m)
\subseteq
\operatorname{span}(L').
$$

两个方向合起来便有

$$
\operatorname{span}(L')
=
\operatorname{span}(v_1,\ldots,v_m).
$$

当 $k=1$ 时， $v_1=0$，上面的“前项表示”是空线性组合；任何式子中的 $c_1v_1$ 都等于零，直接删去即可，所以结论仍成立。

## 用同一组数走完整条路线

在 $\mathbb R^3$ 中取

$$
\begin{aligned}
v_1&=(2,3,1),\\
v_2&=(1,-1,2),\\
v_3&=(7,3,8).
\end{aligned}
$$

直接计算得到

$$
2v_1+3v_2-v_3=0.
$$

这条关系有非零系数，因此三个向量线性相关。它也展示了表示为何不唯一：同一个向量 $v_3$ 同时有

$$
v_3=0v_1+0v_2+1v_3
$$

和

$$
v_3=2v_1+3v_2+0v_3
$$

两组不同的系数。

在关系 $2v_1+3v_2-v_3=0$ 中，最大非零下标是 $k=3$。因为 $v_3$ 的系数 $-1$ 可逆，解出

$$
v_3=2v_1+3v_2.
$$

现在任取原 span 中的向量

$$
u=pv_1+qv_2+rv_3.
$$

代入 $v_3=2v_1+3v_2$ 后，

$$
u=(p+2r)v_1+(q+3r)v_2.
$$

所以每个原本使用 $v_3$ 的表示，都能改写成只使用 $v_1,v_2$ 的表示。删去 $v_3$ 后，张成范围没有改变。

这个例子不能推出“相关组中任意一项都可删除”。引理只保证至少存在一个符合条件的位置；若某项不在其余向量的张成空间里，删掉它就可能缩小 span。正确做法是先由一条非平凡关系找到非零系数，再解出对应向量。

## 顺序究竟改变什么

线性相关性由“是否存在非平凡零关系”决定。重排向量时，只需同步重排系数，同一条关系仍然存在，所以相关或无关的结论不变。

引理中的“由前项表示”却依赖当前顺序。取最大非零下标，是为了保证关系中位于它后面的系数全为零，从而解出的右侧只出现前项。换一种排列，证明可能选出另一个 $k$。因此：**顺序不改变是否相关，但会改变这次证明指出哪个位置可以删除。**

## 最后究竟证明了什么

从 span 出发，我们先证明了：一组向量没有非平凡零关系，当且仅当它对自己张成空间中的每个向量都给出唯一系数表示。这个性质被命名为线性无关。

接着我们证明了线性相关性引理：有限相关组中一定能找到某个由前项表示的向量；删去这个向量，张成空间完全不变。证明真正需要的是有限列表、span 的定义和数域中非零元素可逆，不需要空间有限维，也没有使用基或维数。

于是我们获得了一种可靠的“去冗余”操作：保留覆盖范围，同时删去重复的生成材料。以后把这种删减与“张成整个目标空间”的要求结合，就能构造既覆盖所需范围、又不给出重复系数表示的生成组；这正是走向基的关键一步。

> 教材对应：Axler《线性代数应该这样学》第 2A 节，定义 2.15、定义 2.17、例 2.18，以及线性相关性引理 2.19。唯一表示与零关系的等价沿用定义 2.15 之前的动机推导；数值例沿用例 2.18。
