# 由线性映射构造对偶映射

## 两个前提怎样产生反向作用

对偶空间前提提供定义在向量空间上的线性泛函；线性映射前提允许用预复合把陪域上的泛函拉回定义域。本步骤的唯一 head 是对偶映射。下文对偶空间与对偶基的内容作为前提回顾保留，基不是定义对偶映射的必要 tail。

## 对偶空间确实是向量空间

令 $V'=\mathcal L(V,\mathbb F)$。对泛函 $\varphi,\psi$ 逐点定义

$$
(\varphi+\psi)(v)=\varphi(v)+\psi(v),
\qquad (a\varphi)(v)=a\varphi(v).
$$

线性性在这些运算下保持，向量空间公理来自 $\mathbb F$，所以 $V'$ 是向量空间。

## 构造对偶基

给定基 $v_1,\ldots,v_n$，定义

$$
\varphi_j\left(\sum_{k=1}^na_kv_k\right)=a_j.
$$

基的唯一表示保证这个定义没有歧义，且直接可见 $\varphi_j$ 线性、$\varphi_j(v_k)=\delta_{jk}$。任意 $\varphi\in V'$ 满足

$$
\varphi=\sum_{j=1}^n\varphi(v_j)\varphi_j,
$$

所以 $\varphi_1,\ldots,\varphi_n$ 张成 $V'$；在基向量上求值又证明它们线性无关。故它们是基并且 $\dim V'=\dim V$。

## 对偶映射的方向

对 $T\in\mathcal L(V,W)$，定义 $T'\varphi=\varphi\circ T$。复合线性映射仍线性，所以 $T'\varphi\in V'$；逐点计算可证 $T'$ 本身线性。

若采用对偶基，矩阵元为

$$
(T'\psi_j)(v_k)=\psi_j(Tv_k),
$$

这正把 $T$ 的第 $j,k$ 元换到第 $k,j$ 位置，所以

$$
\mathcal M(T')=\mathcal M(T)^t.
$$

## 结论边界

对偶映射是预复合产生的转置结构，不使用内积，也没有复共轭。伴随要等到内积出现后才定义。

> 教材依据：3.108-3.132。
