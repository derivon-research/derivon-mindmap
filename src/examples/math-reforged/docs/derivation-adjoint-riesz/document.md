# Riesz 表示定理产生伴随

## 三个前提的作用

线性映射 $T$ 产生泛函 $v\mapsto\langle Tv,w\rangle$；内积让“泛函由某个向量表示”有意义；规范正交基给出有限维 Riesz 表示定理的显式证明。

## 先证明 Riesz 表示

设 $e_1,\ldots,e_n$ 是 $V$ 的规范正交基，$\varphi\in V'$。令

$$
u=\sum_{j=1}^n\overline{\varphi(e_j)}e_j.
$$

按本书第一变量线性的约定，对 $v=\sum a_je_j$，可核对

$$
\langle v,u\rangle=\sum_ja_j\varphi(e_j)=\varphi(v).
$$

若另有 $u'$ 给出同一泛函，则 $\langle v,u-u'\rangle=0$ 对所有 $v$ 成立；取 $v=u-u'$ 得 $u=u'$。所以表示向量存在且唯一。

## 对每个输出向量定义伴随像

固定 $w\in W$。因为 $T$ 线性，

$$
\varphi_w(v)=\langle Tv,w\rangle
$$

是 $V$ 上的线性泛函。Riesz 定理给出唯一向量 $u_w\in V$ 使

$$
\langle Tv,w\rangle=\langle v,u_w\rangle
$$

对所有 $v$ 成立。定义 $T^*w=u_w$。

## 证明 $T^*$ 线性

对 $w_1,w_2$ 与标量 $a,b$，任取 $v$，第二变量的共轭线性给出

$$
\begin{aligned}
\langle Tv,aw_1+bw_2\rangle
&=\overline a\langle Tv,w_1\rangle+
\overline b\langle Tv,w_2\rangle\\
&=\overline a\langle v,T^*w_1\rangle+
\overline b\langle v,T^*w_2\rangle\\
&=\langle v,aT^*w_1+bT^*w_2\rangle.
\end{aligned}
$$

Riesz 表示向量的唯一性于是给出

$$
T^*(aw_1+bw_2)=aT^*w_1+bT^*w_2.
$$

共轭在等式两侧按同一规则出现，最终 $T^*$ 本身仍是线性的。

## 结论与条件

伴随方向从 $W$ 回到 $V$，且由内积唯一确定。这里使用有限维 Riesz 定理；不能把此证明无条件推广到任意无限维内积空间。

> 教材依据：6.42 与 7.1-7.9。
