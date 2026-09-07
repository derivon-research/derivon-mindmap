# 幂零算子

> **节点范围：** 本节点只表示幂零算子。广义特征空间是由 $T-\lambda I$ 的幂的零空间构成的独立节点。

## 特征向量不够时，追踪多步后消失的方向

算子 $N\in\mathcal L(V)$ 若存在正整数 $m$ 使 $N^m=0$，称为幂零算子。最小这样的 $m$ 称为幂零指数。幂零并不等于 $N=0$；例如

$$
N=\begin{pmatrix}0&1\\0&0\end{pmatrix}
$$

非零但 $N^2=0$。幂零算子的唯一可能特征值是 $0$，因为 $Nv=\lambda v$ 会推出 $0=N^mv=\lambda^mv$。

## 递增的零空间链

对任意算子，

$$
\operatorname{null}T
\subseteq\operatorname{null}T^2
\subseteq\cdots.
$$

若某一步 $\operatorname{null}T^m=\operatorname{null}T^{m+1}$，则以后各步都相等。有限维时维数不可能无限严格增加，所以最迟在 $\dim V$ 次幂处稳定。

## 广义特征向量与广义特征空间

对特征值 $\lambda$，非零向量 $v$ 若满足

$$
(T-\lambda I)^kv=0
$$

对某个正整数 $k$ 成立，称为对应 $\lambda$ 的广义特征向量。有限维时定义

$$
G(\lambda,T)=\operatorname{null}(T-\lambda I)^{\dim V}.
$$

稳定性说明用任何足够大的指数都会得到同一空间。普通特征空间 $E(\lambda,T)=\operatorname{null}(T-\lambda I)$ 包含在 $G(\lambda,T)$ 中；等号并非总成立。

## 在广义特征空间上的结构

$G(\lambda,T)$ 在 $T$ 下不变。在这个空间上

$$
T|_{G(\lambda,T)}=\lambda I+N,
$$

其中 $N=(T-\lambda I)|_{G(\lambda,T)}$ 幂零。因此一个特征值附近的不可对角化行为全被一个幂零部分记录。

若最小多项式在 $\mathbb F$ 上分解为一次因子，则不同特征值的广义特征空间给出直和分解。复数域上每个算子都满足这个分解条件；实数域上可能有不可约二次因子。

## 易混淆边界

广义特征向量仍要求非零；但广义特征空间当然包含零向量。幂零指数不是空间维数，只有“不超过维数”的上界。不同特征值的广义特征空间相交为 $\{0\}$。

> 教材对应：第 8A、8B 节，8.1-8.22。
