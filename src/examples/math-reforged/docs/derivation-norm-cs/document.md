# 内积诱导范数

## 从定义到关键不等式

由内积定义 $\|v\|=\sqrt{\langle v,v\rangle}$。要证明这确实产生几何长度，关键是 Cauchy-Schwarz 与三角不等式。下文使用正交分解作为证明技巧，但“正交”由另一条定义步骤独立承载。

## 先制造正交分解

若 $v\ne0$，令

$$
c=\frac{\langle u,v\rangle}{\|v\|^2},
\qquad w=u-cv.
$$

由于本书约定第一变量线性，

$$
\langle w,v\rangle
=\langle u,v\rangle-c\langle v,v\rangle=0.
$$

因此 $u=cv+w$ 且 $cv\perp w$。毕达哥拉斯等式给出

$$
\|u\|^2=|c|^2\|v\|^2+\|w\|^2
\ge\frac{|\langle u,v\rangle|^2}{\|v\|^2}.
$$

乘以 $\|v\|^2$ 并开平方，得到

$$
|\langle u,v\rangle|\le\|u\|\|v\|.
$$

$v=0$ 时不等式直接成立。等号恰好在 $w=0$，也就是 $u,v$ 线性相关时成立。

## 推出三角不等式

展开并取实部：

$$
\|u+v\|^2
=\|u\|^2+2\operatorname{Re}\langle u,v\rangle+\|v\|^2.
$$

由 $\operatorname{Re}z\le|z|$ 和 Cauchy-Schwarz，右侧不超过 $(\|u\|+\|v\|)^2$，开平方即得三角不等式。

## 结论与容易漏掉的条件

除以 $\|v\|^2$ 前必须单独处理 $v=0$。复空间中展开范数时交叉项是 $2\operatorname{Re}\langle u,v\rangle$，不能写成 $2\langle u,v\rangle$。

> 教材依据：6.7-6.21。
