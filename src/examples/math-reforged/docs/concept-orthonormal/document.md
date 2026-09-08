# 规范正交基

> **节点范围：** 本节点只表示规范正交基。Gram-Schmidt 是从一般基构造规范正交基的推导步骤，不是本节点的一部分。

## 理想坐标轴的条件

向量组 $e_1,\ldots,e_m$ 规范正交，指

$$
\langle e_j,e_k\rangle=
\begin{cases}1,&j=k,\\0,&j\ne k.\end{cases}
$$

它们自动线性无关：若 $\sum a_je_j=0$，与 $e_k$ 取内积即得 $a_k=0$。若还张成 $V$，就称规范正交基。

## 坐标不再需要解方程

对规范正交组，投影到各方向的系数直接由内积读取。若 $e_1,\ldots,e_n$ 是规范正交基，则

$$
v=\sum_{j=1}^n\langle v,e_j\rangle e_j,
\qquad
\|v\|^2=\sum_{j=1}^n|\langle v,e_j\rangle|^2.
$$

第二式是 Parseval 等式。对尚未张成整个空间的规范正交组，只能得到投影部分，不能把第一式等同于 $v$。

## Gram-Schmidt 过程

给定线性无关组 $v_1,\ldots,v_m$，递归定义

$$
e_1=\frac{v_1}{\|v_1\|},
$$

$$
f_k=v_k-\sum_{j=1}^{k-1}\langle v_k,e_j\rangle e_j,
\qquad e_k=\frac{f_k}{\|f_k\|}.
$$

$f_k$ 是从 $v_k$ 中减去已有方向后的余量。它与每个先前 $e_j$ 正交；线性无关保证 $f_k\ne0$，所以归一化合法。每一步还保持

$$
\operatorname{span}(e_1,\ldots,e_k)
=\operatorname{span}(v_1,\ldots,v_k).
$$

## 例子

从 $v_1=(1,1),v_2=(1,0)$ 出发，

$$
e_1=\frac1{\sqrt2}(1,1),
$$

减去 $v_2$ 在 $e_1$ 上的投影后得到 $(1/2,-1/2)$，归一化为 $e_2=(1,-1)/\sqrt2$。

Gram-Schmidt 依赖输入顺序；不同顺序可产生不同规范正交基，但每个前缀的张成关系都得到保留。

> 教材对应：第 6B 节，定义 6.22、Gram-Schmidt 6.31、结论 6.32-6.38。
