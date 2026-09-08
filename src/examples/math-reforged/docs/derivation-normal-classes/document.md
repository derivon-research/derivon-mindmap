# 从自伴性得到正算子

> **步骤范围：** 正规与自伴已经拆成独立节点。本步骤以自伴算子为前提，再加入二次型非负条件得到正算子；下文三类算子的比较用于说明严格包含关系。

## 从伴随比较算子与自身

算子保证 $T$ 与 $T^*$ 都作用在同一空间，伴随则把内积中的作用方向反转。比较二者产生自伴、正规和正三类结构。

## 自伴算子

$T=T^*$ 当且仅当

$$
\langle Tv,w\rangle=\langle v,Tw\rangle
$$

对所有 $v,w$ 成立。若 $Tv=\lambda v$ 且 $v\ne0$，则

$$
\lambda\|v\|^2=\langle Tv,v\rangle
=\langle v,Tv\rangle=\overline\lambda\|v\|^2,
$$

故 $\lambda$ 为实数。对不同特征值的特征向量做类似比较，得到正交性。

## 正规算子

$TT^*=T^*T$。对任意 $v$，

$$
\|Tv\|^2=\langle T^*Tv,v\rangle,
\qquad
\|T^*v\|^2=\langle TT^*v,v\rangle.
$$

所以正规推出两范数相等。反过来，若两范数对所有 $v$ 相等，令

$$
A=T^*T-TT^*.
$$

$A$ 自伴，且 $\langle Av,v\rangle=0$ 对所有 $v$ 成立。把 $u+v$（复空间再把 $u+iv$）代入这个二次型并展开，可分别得到 $\operatorname{Re}\langle Au,v\rangle=0$ 和 $\operatorname{Im}\langle Au,v\rangle=0$；实空间只需前一式并利用自伴性。因此 $\langle Au,v\rangle=0$ 对所有 $u,v$ 成立，取 $v=Au$ 得 $A=0$，即 $T$ 正规。自伴算子是正规算子的特殊情形。

## 正算子

若 $T$ 自伴且 $\langle Tv,v\rangle\ge0$ 对所有 $v$ 成立，则 $T$ 正。$S^*S$ 总是正，因为

$$
\langle S^*Sv,v\rangle=\|Sv\|^2.
$$

谱定理会把正性转成“所有特征值非负”，再逐个开平方得到唯一正平方根。

## 结论

三类算子的包含关系是

$$
\text{正}\Longrightarrow\text{自伴}\Longrightarrow\text{正规},
$$

反向一般不成立。判断时必须分别核对等式或二次型条件。

> 教材依据：7.10-7.23 与 7.34-7.43。
