# Gram-Schmidt 构造规范正交基

## 三个前提各做什么

基给出线性无关组和张成目标；正交允许从新向量中减去已有方向；范数允许把非零余量归一化。目标是在不改变每一步张成空间的前提下，把方向变得规范正交。

## 递归构造

从线性无关组 $v_1,\ldots,v_m$ 开始。令

$$
e_1=v_1/\|v_1\|.
$$

假设已构造 $e_1,\ldots,e_{k-1}$，定义

$$
f_k=v_k-\sum_{j=1}^{k-1}\langle v_k,e_j\rangle e_j.
$$

对任意 $i<k$，

$$
\langle f_k,e_i\rangle
=\langle v_k,e_i\rangle-
\sum_{j<k}\langle v_k,e_j\rangle\langle e_j,e_i\rangle=0.
$$

这里用规范正交性把求和只留下 $j=i$ 一项。

## 为什么可以归一化

若 $f_k=0$，则 $v_k$ 属于 $e_1,\ldots,e_{k-1}$ 的张成空间；而归纳保持该空间等于 $v_1,\ldots,v_{k-1}$ 的张成空间，这与原组线性无关矛盾。因此 $f_k\ne0$，可定义 $e_k=f_k/\|f_k\|$。

又因为 $f_k$ 由 $v_k$ 减去旧张成空间中的向量得到，反过来 $v_k=f_k+$旧分量，所以

$$
\operatorname{span}(e_1,\ldots,e_k)
=\operatorname{span}(v_1,\ldots,v_k).
$$

## 结论

最终得到张成相同空间的规范正交组。若原组是 $V$ 的基，新组就是规范正交基。输入顺序影响输出，但不影响每个前缀张成保持这一证明。

> 教材依据：6.22-6.38。
