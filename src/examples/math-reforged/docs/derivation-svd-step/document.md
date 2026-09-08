# 对 $T^*T$ 应用谱定理

## 三个前提怎样启动构造

伴随使 $T^*T$ 成为定义域 $V$ 上的算子；谱定理可规范正交对角化这个正算子；奇异值记录相应特征值的非负平方根。目标是从这些数据构造完整分解。

## $T^*T$ 是正算子

先用伴随运算规则检查

$$
(T^*T)^*=T^*(T^*)^*=T^*T,
$$

所以 $T^*T$ 自伴。再对任意 $v\in V$ 计算

$$
\langle T^*Tv,v\rangle=\langle Tv,Tv\rangle=\|Tv\|^2\ge0.
$$

所以 $T^*T$ 自伴且特征值非负。谱定理给出 $V$ 的规范正交基 $e_1,\ldots,e_n$，使

$$
T^*Te_j=s_j^2e_j,\qquad s_j\ge0.
$$

## 正奇异值方向的像为何正交

对 $s_j>0$ 定义 $f_j=Te_j/s_j$。则

$$
\langle f_j,f_k\rangle
=\frac{\langle Te_j,Te_k\rangle}{s_js_k}
=\frac{\langle T^*Te_j,e_k\rangle}{s_js_k}
=\frac{s_j^2\langle e_j,e_k\rangle}{s_js_k}.
$$

所以 $j\ne k$ 时为零，$j=k$ 时为 $1$。这些 $f_j$ 规范正交。

若 $s_j=0$，则 $\|Te_j\|^2=\langle T^*Te_j,e_j\rangle=0$，故 $Te_j=0$。因此零奇异方向恰落在零空间中。

## 完成分解

把 $f_1,\ldots,f_r$ 扩充为 $W$ 的规范正交基。对任意 $v$，在 $e_j$ 基下展开并作用 $T$：

$$
Tv=\sum_{j=1}^r s_j\langle v,e_j\rangle f_j.
$$

这就是 SVD。正奇异值个数等于这些非零像的个数，也就是 $\dim\operatorname{range}T$。

> 教材依据：7.64-7.80。
