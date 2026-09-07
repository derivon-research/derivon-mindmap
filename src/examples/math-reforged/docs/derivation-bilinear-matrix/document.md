# 从双线性型得到二次型

## 前提的分工

双线性型前提提供二变量线性结构，令两个输入相同即可得到二次型 $q(v)=\beta(v,v)$。下文的矩阵表示用于说明坐标形式与对称部分，但不是这一定义步骤的必要 tail。

给定基 $v_1,\ldots,v_n$ 与双线性型 $\beta$，定义 $A_{j,k}=\beta(v_j,v_k)$。若

$$
v=\sum_jx_jv_j,\qquad w=\sum_ky_kv_k,
$$

先后对两个变量展开：

$$
\beta(v,w)=\sum_{j,k}x_jy_k\beta(v_j,v_k)=x^tAy.
$$

所以矩阵完整决定 $\beta$；反过来任意方阵都通过该公式定义双线性型。

## 对称性对应转置

交换输入得到 $\beta(w,v)=y^tAx=x^tA^ty$，因此对所有 $v,w$ 有 $\beta(v,w)=\beta(w,v)$ 当且仅当 $A=A^t$。

## 二次型只保留对称部分

定义 $q(v)=\beta(v,v)$。展开 $q(u+v)$：

$$
q(u+v)=q(u)+q(v)+\beta(u,v)+\beta(v,u).
$$

若 $\beta$ 对称，则

$$
\beta(u,v)=\frac12(q(u+v)-q(u)-q(v)).
$$

所以在 $\mathbb R$ 或 $\mathbb C$ 上，二次型唯一恢复对称双线性型。一般型的斜对称部分在 $q$ 中消失。

## 换基提醒

若旧坐标 $x=Sy$，则 $x^tAx=y^t(S^tAS)y$，所以双线性型矩阵按合同变换；不要套用算子矩阵的相似变换。

> 教材依据：9.1-9.23。
