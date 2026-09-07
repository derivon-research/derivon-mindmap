# 基：不重也不漏的表示材料

## 为什么只问一个条件还不够

张成与线性无关解决的是两个不同问题。

一组向量张成 $V$，意味着 $V$ 中每个目标都**至少能表示一次**。可是生成向量之间若有冗余，同一个目标可能有多组系数。

一组向量线性无关，意味着它所能表示的每个向量都**至多表示一次**。可是它的张成空间可能只占 $V$ 的一部分，有些目标根本无法表示。

我们真正想要的是同一组向量同时做到：没有漏掉任何目标，也没有给任何目标重复的系数。这正是“基”要表达的性质。

## 定义：两个条件必须同时成立

设 $V$ 是数域 $\mathbb F$ 上的向量空间， $v_1,\ldots,v_n$ 是 $V$ 中的有限有序向量组。若

$$
\operatorname{span}(v_1,\ldots,v_n)=V,
$$

并且 $v_1,\ldots,v_n$ 线性无关，就称这个向量组是 $V$ 的一组**基**。

定义中的每一部分都不能省略：

- **向量都属于 $V$。** “是谁的基”必须写清楚；基是相对于目标空间 $V$ 而言的。
- **这是有限有序向量组。** 同一批向量换一个排列仍然是基，但随后得到的坐标分量会跟着换位置。
- **张成 $V$。** 对每个 $v\in V$，都存在 $a_1,\ldots,a_n\in\mathbb F$ 使 $v=a_1v_1+\cdots+a_nv_n$。它负责“不漏”。
- **线性无关。** 只有全零系数才能使 $a_1v_1+\cdots+a_nv_n=0$。它负责“不重”。

重要的是，这两个条件必须由**同一个向量组**同时满足。分别找到一组能张成的向量和另一组线性无关的向量，并不能拼成对原组的结论。

<div class="basis-balance"><style>
.basis-balance{--ink:#18211d;--muted:#5d6962;--line:#cbd4cf;--soft:#eef4f0;--good:#246749;--warn:#9b4b3e;box-sizing:border-box;margin:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;color:var(--ink);font-family:Inter,system-ui,sans-serif}.basis-balance *{box-sizing:border-box}.basis-balance .bb-title{padding:13px 15px;background:var(--soft);font-size:13px;font-weight:800}.basis-balance .bb-head,.basis-balance .bb-row{display:grid;grid-template-columns:1.1fr 1fr 1fr 1.15fr}.basis-balance .bb-head{border-top:1px solid var(--line);background:#f8faf8;color:var(--muted);font-size:11px;font-weight:800}.basis-balance .bb-row{border-top:1px solid var(--line)}.basis-balance .bb-cell{min-width:0;padding:11px 12px;border-left:1px solid var(--line);font-size:12px;line-height:1.55}.basis-balance .bb-cell:first-child{border-left:0;font-weight:800}.basis-balance .yes{color:var(--good);font-weight:800}.basis-balance .no{color:var(--warn);font-weight:800}@media(max-width:650px){.basis-balance .bb-head{display:none}.basis-balance .bb-row{grid-template-columns:1fr;padding:8px 12px}.basis-balance .bb-cell{display:grid;grid-template-columns:106px minmax(0,1fr);gap:8px;padding:7px 0;border-left:0}.basis-balance .bb-cell::before{content:attr(data-label);color:var(--muted);font-size:11px;font-weight:800}.basis-balance .bb-cell:first-child{font-size:13px}.basis-balance .bb-cell:first-child::before{content:'情况'}}
</style><div class="bb-title">“存在”与“唯一”必须在同一组向量上会合</div><div class="bb-head"><div class="bb-cell">情况</div><div class="bb-cell">每个目标有表示</div><div class="bb-cell">表示至多一次</div><div class="bb-cell">能否成为基</div></div><div class="bb-row"><div class="bb-cell" data-label="情况">只满足线性无关</div><div class="bb-cell no" data-label="每个目标有表示">不一定</div><div class="bb-cell yes" data-label="表示至多一次">是</div><div class="bb-cell no" data-label="能否成为基">可能漏掉目标</div></div><div class="bb-row"><div class="bb-cell" data-label="情况">只满足张成</div><div class="bb-cell yes" data-label="每个目标有表示">是</div><div class="bb-cell no" data-label="表示至多一次">不一定</div><div class="bb-cell no" data-label="能否成为基">可能重复表示</div></div><div class="bb-row"><div class="bb-cell" data-label="情况">张成且线性无关</div><div class="bb-cell yes" data-label="每个目标有表示">是</div><div class="bb-cell yes" data-label="表示至多一次">是</div><div class="bb-cell yes" data-label="能否成为基">是：恰好表示一次</div></div></div>

## 一组不是标准轴的基

在 $\mathbb F^2$ 中取

$$
v_1=(1,2),\qquad v_2=(3,5),
$$

其中 $\mathbb F$ 可以是 $\mathbb R$ 或 $\mathbb C$。我们不用图形直觉，而是直接检验任意目标是否有且只有一组系数。

任取 $(x,y)\in\mathbb F^2$，设

$$
a(1,2)+b(3,5)=(x,y).
$$

比较两个坐标，必须有

$$
\begin{aligned}
a+3b&=x,\\
2a+5b&=y.
\end{aligned}
$$

用第二式减去第一式的两倍，得到 $-b=y-2x$，所以

$$
b=2x-y.
$$

再代回第一式，得到

$$
a=3y-5x.
$$

反过来，把这两个系数代回去，确实有

$$
\begin{aligned}
&(3y-5x)(1,2)\\
&\quad +(2x-y)(3,5)=(x,y).
\end{aligned}
$$

这条公式对每个 $(x,y)$ 都成立，所以 $v_1,v_2$ 张成 $\mathbb F^2$。同时，前面的方程又说明：任何能够表示 $(x,y)$ 的系数都被迫等于 $3y-5x$ 与 $2x-y$，没有第二种选择。因此这组向量线性无关，并且是 $\mathbb F^2$ 的一组基。

这里没有使用行列式、矩阵或维数。我们只是求解两个标量方程，并分别看见了“总能解出”和“解被唯一迫定”。

## 坐标属于“向量与有序基”这对关系

一旦有序基

$$
B=(v_1,v_2)
$$

固定下来，向量 $u$ 的唯一系数表就称为 $u$ 关于 $B$ 的坐标。

例如取 $u=(4,1)$。把 $x=4$ 与 $y=1$ 代入上面的通式，得到

$$
\begin{aligned}
a&=3\cdot1-5\cdot4=-17,\\
b&=2\cdot4-1=7,
\end{aligned}
$$

所以

$$
(4,1)=-17v_1+7v_2.
$$

关于有序基 $B=(v_1,v_2)$，坐标是 $(-17,7)$。若只交换顺序，改用 $B'=(v_2,v_1)$，同一等式写成

$$
(4,1)=7v_2-17v_1,
$$

于是坐标变成 $(7,-17)$。改变的是记录系数的顺序，不是向量 $(4,1)$ 本身。

这也解释了为什么基必须作为有序组来使用。说“某向量的坐标”而不说明相对于哪一组有序基，信息是不完整的。

## 只无关还会漏掉目标

考虑 $\mathbb F^3$ 中的向量

$$
p=(1,2,-4),\qquad q=(7,-5,6).
$$

先检查它们线性无关。若 $ap+bq=0$，比较前两个坐标得到

$$
\begin{aligned}
a+7b&=0,\\
2a-5b&=0.
\end{aligned}
$$

第一式给出 $a=-7b$。代入第二式得到 $-19b=0$，所以 $b=0$ 且 $a=0$。因此 $p,q$ 线性无关。

但是它们不张成 $\mathbb F^3$。具体目标 $(0,0,1)$ 就无法到达：若

$$
ap+bq=(0,0,1),
$$

前两个坐标仍会迫使 $a=b=0$，可这时第三个坐标只能是 $0$，不可能等于 $1$。所以 $p,q$ 不是 $\mathbb F^3$ 的基。

这次失败不是“表示重复”，而是有些向量根本没有表示。

## 只张成仍可能重复

再看 $\mathbb F^2$ 中的向量组

$$
\begin{aligned}
r_1&=(1,2),\qquad r_2=(3,5),\\
r_3&=(4,13).
\end{aligned}
$$

前两项就是刚才验证过的 $v_1,v_2$。对任意 $(x,y)\in\mathbb F^2$，都有

$$
\begin{aligned}
(x,y)={}&(3y-5x)r_1\\
&+(2x-y)r_2+0r_3.
\end{aligned}
$$

所以三项组成的向量组确实张成 $\mathbb F^2$。但是

$$
19r_1-5r_2-r_3=0,
$$

因为 $19(1,2)-5(3,5)=(4,13)$。这是一条非平凡零关系，所以该组线性相关，不是基。

这次没有漏掉目标，失败在于第三项制造了重复表示。例如 $r_3$ 既可以用系数 $(0,0,1)$ 表示，也可以用 $(19,-5,0)$ 表示。

## 空向量组的边界

空向量组的张成空间按约定是 $\{0\}$，并且空向量组线性无关。因此空向量组是零向量空间 $\{0\}$ 的一组基。

它不是任何非零向量空间的基，因为空线性组合只能得到零向量，不能张成非零目标。这个边界再次说明：“是否为基”必须连同目标空间一起判断。

## 几个容易混淆的判断

- 张成不自动意味着线性无关；加入一个已能由旧向量表示的向量，span 不变，却会产生重复系数。
- 线性无关不自动意味着张成目标空间；它只保证已能表示的向量不会有两组系数。
- 基不是一个子空间，而是目标空间中的一个有限有序向量组。
- “标准基”只是某些具体空间中自然选定的一组基，不是“基”的额外必要条件。 $\mathbb F^2$ 的 $(1,2),(3,5)$ 与标准基不同，却同样是基。
- 这里不能用向量个数、维数或行列式作判断。定义只要求直接检查张成性与线性无关性。

## 这一定义真正换来了什么

基把两个前置概念严丝合缝地接在一起：张成保证每个 $v\in V$ 至少有一种表示，线性无关保证它至多有一种表示。因此，每个向量都恰好对应一组系数。

这使“抽象向量”能够被稳定地记录成坐标，同时保留一个重要事实：坐标会随有序基改变，向量本身不会。下一条推导将把“张成且线性无关”与“每个向量有唯一表示”严格证明为等价条件。

> 教材对应：Axler《线性代数应该这样学》第 2B 节，定义 2.26、例 2.27(b)–(d)，以及基的判定准则 2.28 与式 (2.29)。本文的完整正例采用 2.27(b)，两类失败分别采用 2.27(c) 与 2.27(d)。
