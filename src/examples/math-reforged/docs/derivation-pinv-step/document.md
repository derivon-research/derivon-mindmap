# 在正奇异方向逐项取倒数

## 两个前提各解决一个障碍

SVD 把 $T$ 拆成互相正交的独立缩放方向；正交投影告诉我们怎样处理目标中不属于值域的分量。伪逆只反演正缩放，并把其余分量置零。

取

$$
Tv=\sum_{j=1}^r s_j\langle v,e_j\rangle f_j,
\qquad s_j>0.
$$

定义

$$
T^\dagger w
=\sum_{j=1}^r s_j^{-1}\langle w,f_j\rangle e_j.
$$

## 核对两个复合

对 $v$ 展开，$T^\dagger Tv$ 保留 $e_1,\ldots,e_r$ 分量，而零奇异方向被去掉。正奇异方向张成 $(\operatorname{null}T)^\perp$，所以

$$
T^\dagger T=P_{(\operatorname{null}T)^\perp}.
$$

对 $w$，先用 $T^\dagger$ 只读取 $f_j$ 分量，再由 $T$ 乘回 $s_j$，得到

$$
TT^\dagger w=\sum_{j=1}^r\langle w,f_j\rangle f_j
=P_{\operatorname{range}T}w.
$$

## 最佳近似与最小范数

$TT^\dagger w$ 是值域中离 $w$ 最近的向量，因此 $T^\dagger w$ 使残差 $\|Tx-w\|$ 最小。任何产生同一最佳像的 $x$ 都形如 $T^\dagger w+n$，其中 $n\in\operatorname{null}T$。两项正交，故

$$
\|T^\dagger w+n\|^2=\|T^\dagger w\|^2+\|n\|^2,
$$

最小范数在 $n=0$ 时唯一达到。

## 结论

伪逆在可逆情形退化为逆，在一般情形给出规范的最小二乘解。它不是对所有输入都满足的双侧逆，正确恒等式是上面的两个正交投影。

> 教材依据：6.67-6.71 与 7.75。
