# 伪逆

## 逆映射失效时保留什么

若 $T:V\to W$ 不可逆，可能有两种障碍：零空间非零导致解不唯一，值域不等于 $W$ 导致某些方程无解。伪逆 $T^\dagger:W\to V$ 同时处理二者：只在 $T$ 真正可逆的奇异方向上反演，其余方向取零。

取 SVD

$$
Tv=\sum_{j=1}^r s_j\langle v,e_j\rangle f_j,
\qquad s_j>0.
$$

定义

$$
T^\dagger w
=\sum_{j=1}^r\frac{\langle w,f_j\rangle}{s_j}e_j.
$$

它把值域方向 $f_j$ 映回 $e_j$，把 $(\operatorname{range}T)^\perp$ 映为零。

## 两个投影恒等式

逐奇异方向计算得

$$
T^\dagger T=P_{(\operatorname{null}T)^\perp},
$$

$$
TT^\dagger=P_{\operatorname{range}T}.
$$

因此若 $T$ 可逆，这两个投影都是恒等算子，$T^\dagger=T^{-1}$；一般情形下伪逆不是左右逆。

## 最小二乘与最小范数

给定 $y\in W$，$TT^\dagger y=P_{\operatorname{range}T}y$ 是值域中离 $y$ 最近的向量，所以 $x=T^\dagger y$ 使 $\|Tx-y\|$ 最小。所有达到同一最佳像的解相差一个零空间向量，而 $T^\dagger y\in(\operatorname{null}T)^\perp$，故它还是这些最小二乘解中范数最小的唯一一个。

## 一个对角例子

若 $T(x,y)=(2x,0)$，则 $T^\dagger(a,b)=(a/2,0)$。分量 $b$ 不在值域中，被正交投影丢弃；输入第二坐标属于零空间，为取得最小范数而选 $0$。

> 教材对应：第 6C 节 6.67-6.71；SVD 表达见 7.75。
