# 以基坐标表示线性映射

## 两个前提怎样汇合

线性映射由基向量的像决定；基又保证每个像在陪域中有唯一坐标。矩阵只是把这些坐标按列集中记录。

设 $\mathcal B=(v_1,\ldots,v_n)$ 是 $V$ 的基，$\mathcal C=(w_1,\ldots,w_m)$ 是 $W$ 的基。对每个 $k$ 唯一写出

$$
Tv_k=\sum_{j=1}^m A_{j,k}w_j.
$$

定义 $A=\mathcal M(T,\mathcal B,\mathcal C)$，其第 $k$ 列为 $(A_{1,k},\ldots,A_{m,k})^t$。

## 为什么任意输入都变成矩阵乘法

若 $v=\sum_kx_kv_k$，则

$$
Tv=\sum_kx_kTv_k
=\sum_j\left(\sum_kA_{j,k}x_k\right)w_j.
$$

括号里的量正是矩阵乘积 $Ax$ 的第 $j$ 个分量，所以

$$
[Tv]_{\mathcal C}=A[v]_{\mathcal B}.
$$

这也说明为什么矩阵乘向量等于各列按输入坐标做线性组合。

## 复合对应乘法

再设 $S\in\mathcal L(W,U)$，使用 $W$ 的同一组中间基。先由 $A$ 把 $V$ 坐标变成 $W$ 坐标，再由 $B=\mathcal M(S)$ 变成 $U$ 坐标，因此

$$
\mathcal M(ST)=BA.
$$

第 $j,k$ 元是 $\sum_r B_{j,r}A_{r,k}$，其中 $r$ 枚举中间空间的坐标。尺寸也强制了顺序：$A$ 为 $m\times n$，$B$ 为 $p\times m$，只有 $BA$ 能作用于 $n$ 维输入坐标。

## 结论

选定定义域和陪域的基后，线性映射与相应尺寸的矩阵一一对应。矩阵中的数字依赖基，但加法、数乘和复合的结构被完整保存。

> 教材依据：3.29-3.43。
