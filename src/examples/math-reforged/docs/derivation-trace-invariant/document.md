# 相似变换保持迹

## 三个前提怎样相遇

矩阵让我们定义对角元之和；特征多项式规定代数重数；若当型提供一组基，使每个特征值在对角线上恰好按该重数出现。要把迹提升为算子概念，先证明对角元之和不随基改变。

若 $A$ 为 $m\times n$、$B$ 为 $n\times m$，则

$$
\operatorname{tr}(AB)
=\sum_{j=1}^m\sum_{k=1}^nA_{j,k}B_{k,j}.
$$

交换有限求和次序，得到

$$
\sum_{k=1}^n\sum_{j=1}^mB_{k,j}A_{j,k}
=\operatorname{tr}(BA).
$$

所以 $\operatorname{tr}(AB)=\operatorname{tr}(BA)$，但这不表示 $AB=BA$。

## 先从坐标推导换基公式

设 $A_{\mathcal B}$、$A_{\mathcal C}$ 是同一算子在两组基下的矩阵，$S$ 把 $\mathcal C$ 坐标变成 $\mathcal B$ 坐标，即 $[v]_{\mathcal B}=S[v]_{\mathcal C}$。一方面

$$
[Tv]_{\mathcal B}=A_{\mathcal B}S[v]_{\mathcal C},
$$

另一方面 $[Tv]_{\mathcal B}=S A_{\mathcal C}[v]_{\mathcal C}$。这对所有坐标向量成立，所以

$$
A_{\mathcal C}=S^{-1}A_{\mathcal B}S.
$$

现在应用循环交换公式：

$$
\operatorname{tr}A_{\mathcal C}
=\operatorname{tr}(S^{-1}A_{\mathcal B}S)
=\operatorname{tr}(A_{\mathcal B}SS^{-1})
=\operatorname{tr}A_{\mathcal B}.
$$

因此可以定义算子迹而不指定基。

## 与特征值总和连接

设 $V$ 为复空间。若当基把矩阵分成 $J_r(\lambda)$ 块；每个这样的块有 $r$ 个对角元都等于 $\lambda$。同一 $\lambda$ 的块大小总和正是 $\dim G(\lambda,T)$，也就是特征多项式给出的代数重数。因此

$$
\operatorname{tr}T
=\sum_{\lambda}(\text{代数重数})\lambda.
$$

## 结论边界

实算子可用实矩阵直接定义迹；复化后矩阵元素和对角元不变，非实特征值成共轭对，所以同一求和解释仍成立。迹是相似不变量，但不是完整分类量；迹相同不能推出矩阵相似。循环交换可写成 $\operatorname{tr}(ABC)=\operatorname{tr}(BCA)$，却不能任意重排因子。

> 教材依据：8.47-8.54。
