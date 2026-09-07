# 张量积

## 把双线性问题变成普通线性问题

给定有限维空间 $V,W$，令 $\mathcal B(V,W)$ 为 $V\times W$ 上所有标量值双线性映射的空间。Axler 定义

$$
V\otimes W=\mathcal B(V,W)'.
$$

对 $v\in V,w\in W$，纯张量 $v\otimes w$ 是作用在双线性型上的求值泛函：

$$
(v\otimes w)(\beta)=\beta(v,w).
$$

这与常见的商空间构造同构，但当前页面遵循教材的有限维对偶构造。

## 张量符号满足双线性关系

由 $\beta$ 的双线性性，

$$
(v_1+v_2)\otimes w=v_1\otimes w+v_2\otimes w,
$$

另一变量和标量规则同理。注意 $(v_1+v_2)\otimes(w_1+w_2)$ 会展开成四项，而非只保留两项。

## 基与维数

若 $e_1,\ldots,e_m$ 是 $V$ 的基，$f_1,\ldots,f_n$ 是 $W$ 的基，则所有 $e_j\otimes f_k$ 构成 $V\otimes W$ 的基。因此

$$
\dim(V\otimes W)=(\dim V)(\dim W).
$$

任意张量是纯张量的线性组合，但一般不等于单个 $v\otimes w$。

## 泛性质

对任意双线性映射 $\Gamma:V\times W\to U$，存在唯一线性映射

$$
\widetilde\Gamma:V\otimes W\to U
$$

满足 $\widetilde\Gamma(v\otimes w)=\Gamma(v,w)$。这才是张量积的核心用途：把所有双线性问题唯一地转成从同一个空间出发的线性问题。

> 教材对应：第 9D 节，9.68-9.92。
