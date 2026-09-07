# 线性映射的矩阵

## 矩阵是选定基后的记录表

设 $T\in\mathcal L(V,W)$，定义域基为 $v_1,\ldots,v_n$，陪域基为 $w_1,\ldots,w_m$。每个 $Tv_k$ 都能唯一写成

$$
Tv_k=A_{1,k}w_1+\cdots+A_{m,k}w_m.
$$

把这些系数放在第 $k$ 列，得到 $m\times n$ 矩阵

$$
\mathcal M(T,(v_1,\ldots,v_n),(w_1,\ldots,w_m))=(A_{j,k}).
$$

矩阵的列数等于定义域基长度，行数等于陪域基长度。第 $k$ 列不是随意计算出来的数字，而是 $Tv_k$ 在陪域基下的坐标。

## 为什么它能处理任意向量

若 $v=x_1v_1+\cdots+x_nv_n$，则线性性给出

$$
Tv=\sum_{k=1}^n x_kTv_k.
$$

因此坐标向量满足

$$
[Tv]_{\mathcal C}=\mathcal M(T,\mathcal B,\mathcal C)[v]_{\mathcal B}.
$$

这解释了矩阵乘向量的列组合规则：输入坐标 $x_k$ 正是各列的权重。

## 一个完整例子

令 $T:\mathbb R^2\to\mathbb R^2$，$T(x,y)=(2x+y,x-y)$。关于标准基，

$$
Te_1=(2,1),\qquad Te_2=(1,-1),
$$

所以

$$
\mathcal M(T)=\begin{pmatrix}2&1\\1&-1\end{pmatrix}.
$$

对 $(x,y)$，矩阵乘法给出 $x(2,1)+y(1,-1)=(2x+y,x-y)$，与原映射一致。

## 运算对应关系

相同基约定下，$S+T$ 对应矩阵相加，$aT$ 对应矩阵数乘，复合 $ST$ 对应矩阵乘积

$$
\mathcal M(ST)=\mathcal M(S)\mathcal M(T).
$$

乘积次序与函数复合一致：先作用 $T$，再作用 $S$。矩阵依赖基；换基会改变矩阵，却不会改变抽象线性映射。

> 教材对应：第 3C 节，定义 3.29、例 3.32，以及矩阵乘法 3.37-3.43。
