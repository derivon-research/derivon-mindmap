# 正交补直和产生投影

## 前提如何进入证明

子空间 $U$ 给出要逼近的目标集合；正交补提供分解目标 $V=U\oplus U^\perp$；规范正交基让我们显式算出 $U$ 分量。有限维内积空间的条件保证 $U$ 有有限规范正交基。

取 $U$ 的规范正交基 $e_1,\ldots,e_m$。对任意 $v\in V$，定义

$$
u=\sum_{j=1}^m\langle v,e_j\rangle e_j\in U,
\qquad w=v-u.
$$

对每个 $k$，

$$
\langle w,e_k\rangle
=\langle v,e_k\rangle-
\sum_j\langle v,e_j\rangle\langle e_j,e_k\rangle=0.
$$

所以 $w$ 与 $U$ 的基向量都正交，也就与 $U$ 中每个向量正交，故 $w\in U^\perp$。这证明每个 $v$ 都属于 $U+U^\perp$。

若 $x\in U\cap U^\perp$，则 $\langle x,x\rangle=0$，从而 $x=0$。因此和为直和：

$$
V=U\oplus U^\perp.
$$

分解中的 $u$ 唯一，定义为 $P_Uv$。

## 最佳逼近从毕达哥拉斯得到

任取 $x\in U$，有

$$
v-x=(v-P_Uv)+(P_Uv-x),
$$

第一项在 $U^\perp$，第二项在 $U$，二者正交。因此

$$
\|v-x\|^2=\|v-P_Uv\|^2+\|P_Uv-x\|^2.
$$

第二项非负，且仅在 $x=P_Uv$ 时为零，所以投影是唯一最近点。

> 教材依据：6.46-6.61。
