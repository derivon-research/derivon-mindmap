# 双线性泛函的对偶实现张量积

## 两个前提如何进入构造

双线性提供需要被线性化的二变量规则；对偶空间让每对 $(v,w)$ 通过求值成为线性泛函。以下采用教材的有限维定义。

令 $\mathcal B(V,W)$ 为 $V\times W$ 上的标量值双线性映射空间，定义

$$
V\otimes W=\mathcal B(V,W)'.
$$

对 $v,w$ 定义

$$
(v\otimes w)(\beta)=\beta(v,w).
$$

它对 $\beta$ 线性，所以确实属于对偶空间。

## 证明纯张量对输入双线性

对任意 $\beta$，

$$
\begin{aligned}
&((v_1+v_2)\otimes w)(\beta)\\
&\quad=\beta(v_1+v_2,w)\\
&\quad=((v_1\otimes w)+(v_2\otimes w))(\beta).
\end{aligned}
$$

两个泛函在所有 $\beta$ 上取值相同，故相等。另一变量与标量规则同理。

## 构造基

取 $V,W$ 的基 $e_j,f_k$ 和对偶基 $e^j,f^k$。定义双线性型

$$
\beta_{j,k}(v,w)=e^j(v)f^k(w).
$$

把 $v,w$ 按基展开可得

$$
\beta=\sum_{j,k}\beta(e_j,f_k)\beta_{j,k},
$$

所以所有 $\beta_{j,k}$ 构成 $\mathcal B(V,W)$ 的基。再对求值泛函计算

$$
(e_a\otimes f_b)(\beta_{j,k})
=\beta_{j,k}(e_a,f_b)=\delta_{j,a}\delta_{k,b}.
$$

因此 $e_a\otimes f_b$ 正是这组基的对偶基，既线性无关又张成 $\mathcal B(V,W)'=V\otimes W$。于是

$$
\dim(V\otimes W)=\dim V\dim W.
$$

## 证明线性化的存在与唯一

给定双线性映射 $\Gamma:V\times W\to U$，先在基纯张量上规定

$$
\widetilde\Gamma(e_j\otimes f_k)=\Gamma(e_j,f_k),
$$

再按基线性延拓。对任意 $v,w$ 的基展开，双线性说明 $\widetilde\Gamma(v\otimes w)=\Gamma(v,w)$。任何满足此式的线性映射在基纯张量上的值都已固定，所以唯一。

## 结论

张量积不是仅仅发明一个乘号，而是构造一个具有泛性质的空间，使双线性映射与从 $V\otimes W$ 出发的线性映射一一对应。

> 教材依据：9.68-9.92。
