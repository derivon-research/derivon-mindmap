# 同构

> **节点范围：** 本节点只表示向量空间同构。换基是建立在同构、基与矩阵之上的独立节点。

## 不同外表下的同一种线性结构

可逆线性映射 $T:V\to W$ 称为一个同构。若存在同构，就说 $V$ 与 $W$ 同构。它建立一一对应，同时保持加法和标量乘法，所以在一个空间中成立的纯线性关系可以无损搬到另一个空间。

有限维空间的分类极其简洁：

$$
V\cong W\quad\Longleftrightarrow\quad \dim V=\dim W.
$$

若两边都有维数 $n$，选基 $v_1,\ldots,v_n$ 和 $w_1,\ldots,w_n$，规定 $Tv_j=w_j$ 并线性延拓，就得到同构。反向则由可逆映射同时单射、满射以及维数公式得到。

## 坐标映射本身就是同构

给定 $V$ 的基 $\mathcal B=(v_1,\ldots,v_n)$，坐标映射

$$
C_{\mathcal B}:V\to\mathbb F^n,
\qquad C_{\mathcal B}(v)=[v]_{\mathcal B}
$$

是同构。这说明每个 $n$ 维空间都可用 $\mathbb F^n$ 计算，但坐标模型依赖所选的基。

## 换基矩阵

同一向量在两组基 $\mathcal B,\mathcal C$ 下的坐标由可逆矩阵联系：

$$
[v]_{\mathcal C}=P_{\mathcal C\leftarrow\mathcal B}[v]_{\mathcal B}.
$$

$P_{\mathcal C\leftarrow\mathcal B}$ 的第 $k$ 列是 $\mathcal B$ 的第 $k$ 个基向量在 $\mathcal C$ 下的坐标。箭头说明输入是 $\mathcal B$ 坐标、输出是 $\mathcal C$ 坐标，能减少把矩阵方向写反的错误。

若 $T\in\mathcal L(V)$，它在两组基下的矩阵满足相似关系

$$
[T]_{\mathcal C}=P_{\mathcal C\leftarrow\mathcal B}[T]_{\mathcal B}P_{\mathcal B\leftarrow\mathcal C}.
$$

换基改变描述，不改变算子本身。后面的特征值、迹和行列式正是相似变换下不变的量。

> 教材对应：第 3D 节，定义 3.72、同构判据 3.74、坐标同构 3.75，以及换基 3.84-3.90。
