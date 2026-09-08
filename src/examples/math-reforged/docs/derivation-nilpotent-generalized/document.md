# 稳定零空间序列产生广义特征空间

## 前提的分工

零空间把“若干次作用后变零”写成子空间；有限维性迫使递增子空间链停止；特征值前提给出算子与 $\lambda$，从而可形成 $T-\lambda I$；幂零概念描述它在所得空间上的限制。把这些前提合起来，就得到广义特征空间。

若 $v\in\operatorname{null}T^k$，则 $T^kv=0$，从而 $T^{k+1}v=0$。所以

$$
\operatorname{null}T^k
\subseteq\operatorname{null}T^{k+1}.
$$

这些维数是不超过 $n=\dim V$ 的非降整数序列，必在有限步后稳定。

## 一次相等为何导致永久相等

若 $\operatorname{null}T^m=\operatorname{null}T^{m+1}$，取 $v\in\operatorname{null}T^{m+2}$。则 $Tv\in\operatorname{null}T^{m+1}=\operatorname{null}T^m$，故 $T^{m+1}v=0$，即 $v\in\operatorname{null}T^{m+1}$。归纳可得所有后续零空间相同。

## 应用于 $T-\lambda I$

令 $S=T-\lambda I$。有限维稳定性说明

$$
\operatorname{null}S^n=\operatorname{null}S^{n+1}=\cdots.
$$

因此定义 $G(\lambda,T)=\operatorname{null}(T-\lambda I)^n$ 不依赖更大的指数。它在 $T$ 下不变，因为 $T$ 与 $T-\lambda I$ 及其幂可交换。

在 $G(\lambda,T)$ 上，$N=(T-\lambda I)|_G$ 满足 $N^n=0$，所以幂零，而

$$
T|_G=\lambda I+N.
$$

## 结论与边界

广义特征空间收集所有有限步后被 $T-\lambda I$ 消去的方向。有限维性是稳定结论的关键；无限维中零空间链可以无限严格增加。

> 教材依据：8.1-8.22。
