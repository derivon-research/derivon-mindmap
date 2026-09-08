# 线性映射基本定理

## 要把什么联系起来

零空间描述被压掉的方向，值域描述保留下来的输出方向；维数允许计算方向数。目标是证明有限维定义域中的自由度恰好分成这两部分。

设 $T\in\mathcal L(V,W)$，且 $V$ 有限维。先取零空间的一组基

$$
u_1,\ldots,u_m.
$$

把它扩充为 $V$ 的基

$$
u_1,\ldots,u_m,v_1,\ldots,v_n.
$$

于是 $\dim\operatorname{null}T=m$ 且 $\dim V=m+n$。

## 映出的向量张成值域

任意 $x\in V$ 可写成

$$
x=\sum_{j=1}^m a_ju_j+\sum_{k=1}^n b_kv_k.
$$

作用 $T$ 后，$Tu_j=0$，所以

$$
Tx=\sum_{k=1}^n b_kTv_k.
$$

因此 $Tv_1,\ldots,Tv_n$ 张成 $\operatorname{range}T$。

## 它们为什么线性无关

若 $\sum b_kTv_k=0$，则 $T(\sum b_kv_k)=0$，所以 $\sum b_kv_k$ 属于零空间，又可写成 $u_j$ 的线性组合。把两种表达移到一边，得到基 $u_1,\ldots,u_m,v_1,\ldots,v_n$ 的一个零线性组合。基的线性无关性迫使所有 $b_k=0$。

所以 $Tv_1,\ldots,Tv_n$ 是值域的一组基，$\dim\operatorname{range}T=n$。最终

$$
\boxed{\dim V=\dim\operatorname{null}T+\dim\operatorname{range}T}.
$$

## 推出同维空间中的单射满射等价

若另有 $\dim V=\dim W$，则零空间为 $\{0\}$ 当且仅当值域维数等于 $\dim W$，也就当且仅当值域等于 $W$。因此同维有限空间间，单射与满射等价。

## 边界

定理要求 $V$ 有限维；$W$ 是否有限维不必预先假设，因为值域由至多 $\dim V$ 个向量张成。无限维情形不能用简单的自然数减法照搬。

> 教材依据：线性映射基本定理 3.21 及结论 3.23-3.24。
