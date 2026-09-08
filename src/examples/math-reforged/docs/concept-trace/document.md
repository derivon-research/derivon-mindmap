# 迹

## 对角线之和为何属于算子本身

对 $n\times n$ 矩阵 $A$，定义

$$
\operatorname{tr}A=A_{1,1}+\cdots+A_{n,n}.
$$

关键恒等式是，只要 $AB$ 与 $BA$ 都是方阵，

$$
\operatorname{tr}(AB)=\operatorname{tr}(BA).
$$

一般并没有 $AB=BA$；只有迹相等。若 $B=S^{-1}AS$，则

$$
\operatorname{tr}B
=\operatorname{tr}(S^{-1}AS)
=\operatorname{tr}(ASS^{-1})
=\operatorname{tr}A.
$$

同一算子在不同基下的矩阵相似，所以可定义 $\operatorname{tr}T=\operatorname{tr}\mathcal M(T)$ 而不注明基。

## 与特征值的关系

在复空间上取上三角基或若当基，主对角元就是按代数重数排列的特征值，因此

$$
\operatorname{tr}T=\lambda_1+\cdots+\lambda_n
$$

其中重复计数。实算子的非实特征值在复化后成共轭对，和仍为实数。

## 例子与规则

$$
\operatorname{tr}
\begin{pmatrix}a&b\\c&d\end{pmatrix}=a+d.
$$

迹满足线性性和 $\operatorname{tr}(ST-TS)=0$。但 $\operatorname{tr}(ST)=\operatorname{tr}S\,\operatorname{tr}T$ 一般错误；乘法性属于行列式。

迹只给出特征值总和，无法单独恢复算子或全部谱。许多不同矩阵有同一迹；它是有用的不变量，不是完整分类量。

> 教材对应：第 8E 节，定义 8.47-8.54。
