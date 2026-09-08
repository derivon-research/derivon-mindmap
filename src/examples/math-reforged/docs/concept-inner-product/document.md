# 内积空间

## 给抽象向量加入长度和角度

一般向量空间只有线性组合，没有天然的长度、夹角或最近点。内积用一个标量 $\langle u,v\rangle$ 衡量两个向量的几何关系，并且必须与线性结构兼容。

本图谱沿用 Axler 的约定：内积对**第一个变量线性**。函数

$$
\langle\cdot,\cdot\rangle:V\times V\to\mathbb F
$$

满足对任意 $u,v,w\in V$、$a\in\mathbb F$：

1. 正定性：$\langle v,v\rangle\ge0$，且等号当且仅当 $v=0$；
2. 第一变量可加：$\langle u+v,w\rangle=\langle u,w\rangle+\langle v,w\rangle$；
3. 第一变量齐次：$\langle av,w\rangle=a\langle v,w\rangle$；
4. 共轭对称：$\langle u,v\rangle=\overline{\langle v,u\rangle}$。

带内积的向量空间称为内积空间。

## 第二变量为何出现共轭

由共轭对称和第一变量线性可推出

$$
\langle u,av+bw\rangle
=\overline a\langle u,v\rangle+\overline b\langle u,w\rangle.
$$

所以复内积对第二变量是共轭线性的。若忘掉共轭，$\langle z,z\rangle$ 可能不是非负实数。

标准复内积为

$$
\langle z,w\rangle
=z_1\overline{w_1}+\cdots+z_n\overline{w_n}.
$$

例如 $\langle(1,i),(1,i)\rangle=1+i(-i)=2$。若误写成分量直接相乘，则得到 $1+i^2=0$，违反正定性。

## 不止一种内积

在 $\mathbb R^n$ 上，若 $A$ 是正定对称矩阵，可定义 $\langle x,y\rangle_A=x^tAy$。同一个向量空间可以有不同内积，从而有不同长度和正交关系；“正交”必须相对于已指定的内积理解。

内积将产生范数、正交、规范正交基、投影和伴随，并最终把算子对角化与几何结构连接起来。

> 教材对应：第 6A 节，定义 6.3，例 6.4-6.6。
