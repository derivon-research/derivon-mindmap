# 线性无关：表示没有暗中的重复

## 张成之后，为什么还要问“是否唯一”

给定有限个向量，张成空间回答的是：**哪些向量能够用它们表示？** 但“能够表示”还没有说明这种表示是不是唯一。

在 $\mathbb R^2$ 中， $e_1=(1,0)$ 与 $e_2=(0,1)$ 已经可以表示每个向量。令 $v_3=e_1+e_2$ 并把它加入向量组，可达范围没有扩大，因为新向量本来就能由前两个向量合成；表示方式却开始重复。例如

$$
(2,1)=2e_1+e_2=e_1+0e_2+v_3.
$$

两种表示相减，重复恰好变成一个等于零向量的非平凡关系：

$$
-e_1-e_2+v_3=0.
$$

这就是检查零向量的原因。我们不是只对零向量感兴趣，而是在用它一次检测所有向量的表示是否唯一。

## 精确定义

设 $V$ 是数域 $\mathbb F$ 上的向量空间， $v_1,\ldots,v_m$ 是 $V$ 中一个有限有序向量组。若对每一组标量 $a_1,\ldots,a_m\in\mathbb F$，都有

$$
\begin{aligned}
&a_1v_1+\cdots+a_mv_m=0\\
&\qquad\Longrightarrow a_1=\cdots=a_m=0.
\end{aligned}
$$

就称 $v_1,\ldots,v_m$ **线性无关**。

所有系数都取零时，等式一定成立：

$$
0v_1+\cdots+0v_m=0.
$$

这叫作**平凡线性关系**。定义并不是禁止零向量被表示，而是要求它只能用这组全零系数表示。

若存在一组**不全为零**的标量使

$$
a_1v_1+\cdots+a_mv_m=0,
$$

就称这个向量组**线性相关**。证明线性无关必须排除所有非平凡关系；证明线性相关只需找出一个非平凡关系作为证人。

定义中的条件各有作用：

- 所有 $v_k$ 必须属于同一个向量空间 $V$，等式右端的 $0$ 是 $V$ 的零向量。
- 系数来自指定的数域，也就是 $\mathbb F$ 中的元素。允许哪些标量会影响“能否抵消”，因此同一组向量换一个标量域后，结论可能改变。
- 这里讨论的是有限有序向量组，不是把重复项自动合并的集合。每个位置都有自己的系数。
- “对每一组系数”是全称条件。只检查几组看起来方便的系数，不能证明线性无关。
- 顺序用于标记每一项，但重新排列不会改变是否存在非平凡零关系，所以不会改变线性无关性。

换一种语言说：线性无关意味着这批生成材料之间没有隐藏的抵消；线性相关意味着至少有一项信息可以由其他项补出来。这个“可删除项”究竟怎样找到，将在线性相关性引理中严格证明。

## 实验：范围不变，系数为什么会重复

下面始终保留 $e_1=(1,0)$ 与 $e_2=(0,1)$。因此无论是否加入第三个向量，每个 $(x,y)$ 都仍可写成 $xe_1+ye_2$，张成范围始终是 $\mathbb R^2$。切换第三项，比较同一目标 $u=(2,1)$ 的系数表示。

<div class="independence-lab"><style>
.independence-lab{--ink:#18211d;--muted:#5c6962;--line:#c9d3cd;--paper:#fbfcfa;--soft:#eef4f0;--red:#b84d3d;--blue:#226b91;--green:#26734d;--gold:#b98713;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.independence-lab *{box-sizing:border-box}.independence-lab .il-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:16px 18px;border-bottom:1px solid var(--line);background:var(--soft)}.independence-lab h3{margin:0 0 5px;font-size:18px}.independence-lab .il-head p,.independence-lab .il-foot{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.independence-lab .il-switch{display:flex;flex-wrap:wrap;flex:0 0 auto;border:1px solid #aebbb4}.independence-lab button{min-height:36px;padding:0 11px;border:0;border-right:1px solid #aebbb4;background:#fff;color:var(--ink);font-weight:750;cursor:pointer}.independence-lab button:last-child{border-right:0}.independence-lab button[aria-pressed="true"]{background:#244f3d;color:#fff}.independence-lab button:focus-visible{outline:3px solid #e9bd3f;outline-offset:2px}.independence-lab .il-body{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(250px,.82fr)}.independence-lab .il-stage{display:grid;place-items:center;padding:10px;background:#fff;border-right:1px solid var(--line);overflow:hidden}.independence-lab svg{display:block;width:100%;height:auto;aspect-ratio:36/25}.independence-lab .grid{stroke:#e5eae7;stroke-width:1}.independence-lab .axis{stroke:#9eaaa3;stroke-width:1.4}.independence-lab .e1{stroke:var(--red);stroke-width:4}.independence-lab .e2{stroke:var(--blue);stroke-width:4}.independence-lab .v3{stroke:var(--green);stroke-width:4}.independence-lab .target{stroke:#202925;stroke-width:5}.independence-lab .il-readout{display:flex;flex-direction:column;gap:14px;padding:18px}.independence-lab .il-list{font:700 13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#254c3c}.independence-lab .il-block{padding-top:12px;border-top:1px solid var(--line)}.independence-lab .il-label{display:block;margin-bottom:4px;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase}.independence-lab .il-code{font:700 13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.independence-lab .il-status{margin-top:auto;padding:10px 12px;border-left:4px solid var(--gold);background:#fff8e4;font-size:12px;line-height:1.65}.independence-lab .il-foot{padding:10px 18px;border-top:1px solid var(--line);background:#fff}.independence-lab .il-foot strong{color:var(--ink)}@media(max-width:700px){.independence-lab .il-head{display:grid}.independence-lab .il-switch{width:100%;display:grid;grid-template-columns:1fr}.independence-lab button{border-right:0;border-bottom:1px solid #aebbb4;text-align:left}.independence-lab button:last-child{border-bottom:0}.independence-lab .il-body{grid-template-columns:1fr}.independence-lab .il-stage{border-right:0;border-bottom:1px solid var(--line);padding:4px}.independence-lab .il-readout{padding:15px}}
</style><div class="il-head"><div><h3>同一范围，不同的表示</h3><p>目标始终是 u=(2,1)；第三项只改变表示是否重复。</p></div><div class="il-switch" role="group" aria-label="选择第三个向量"><button type="button" data-state="none" aria-pressed="true">只用 e₁,e₂</button><button type="button" data-state="sum" aria-pressed="false">加入 v₃=e₁+e₂</button><button type="button" data-state="zero" aria-pressed="false">加入 v₃=0</button></div></div><div class="il-body"><div class="il-stage"><svg viewBox="0 0 360 250" role="img" aria-label="e1、e2 与目标向量 u 的平面图"><defs><marker id="ind-arrow-red" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#b84d3d"/></marker><marker id="ind-arrow-blue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#226b91"/></marker><marker id="ind-arrow-green" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#26734d"/></marker><marker id="ind-arrow-ink" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#202925"/></marker></defs><g class="grid"><path d="M34 23V227M88 23V227M142 23V227M196 23V227M250 23V227M304 23V227M34 23H326M34 77H326M34 131H326M34 185H326"/></g><line class="axis" x1="34" y1="185" x2="326" y2="185"/><line class="axis" x1="88" y1="227" x2="88" y2="23"/><line class="e1" x1="88" y1="185" x2="142" y2="185" marker-end="url(#ind-arrow-red)"/><line class="e2" x1="88" y1="185" x2="88" y2="131" marker-end="url(#ind-arrow-blue)"/><line class="v3" data-v3 x1="88" y1="185" x2="142" y2="131" marker-end="url(#ind-arrow-green)" style="display:none"/><circle data-zero cx="88" cy="185" r="7" fill="none" stroke="#26734d" stroke-width="3" style="display:none"/><line class="target" x1="88" y1="185" x2="196" y2="131" marker-end="url(#ind-arrow-ink)"/><text x="146" y="202" fill="#9d3d31" font-size="13" font-weight="700">e₁</text><text x="98" y="127" fill="#185f83" font-size="13" font-weight="700">e₂</text><text data-v3-label x="148" y="126" fill="#1d6843" font-size="13" font-weight="700" style="display:none">v₃</text><text x="202" y="126" fill="#202925" font-size="14" font-weight="800">u=(2,1)</text></svg></div><div class="il-readout" aria-live="polite"><div class="il-list" data-list>列表：e₁, e₂</div><div class="il-block"><span class="il-label">第一种表示</span><div class="il-code" data-first>u = 2e₁ + e₂；系数 (2,1)</div></div><div class="il-block"><span class="il-label">另一种表示</span><div class="il-code" data-second>没有第三项可改变系数。</div></div><div class="il-block"><span class="il-label">对应的零关系</span><div class="il-code" data-relation>只有 0e₁+0e₂=0。</div></div><div class="il-status" data-status>e₁,e₂ 的系数由目标 u 唯一确定。</div></div></div><p class="il-foot"><strong>始终不变：</strong>e₁,e₂ 还在列表中，所以 span 始终是 ℝ²。变化的是系数表示是否唯一，而不是覆盖范围。</p><script>
(() => {
  const root=document.currentScript.closest('.independence-lab');
  const svg=root.querySelector('svg');
  const states={
    none:{list:'列表：e₁, e₂',first:'u = 2e₁ + e₂；系数 (2,1)',second:'没有第三项可改变系数。',relation:'只有 0e₁+0e₂=0。',status:'e₁,e₂ 的系数由目标 u 唯一确定。',v3:false,zero:false,label:'',labelX:148,labelY:126},
    sum:{list:'列表：e₁, e₂, v₃=e₁+e₂',first:'u = 2e₁ + e₂ + 0v₃；系数 (2,1,0)',second:'u = e₁ + 0e₂ + v₃；系数 (1,0,1)',relation:'−e₁ − e₂ + v₃ = 0（非平凡）',status:'覆盖范围没变，但同一 u 已有不同系数；列表线性相关。',v3:true,zero:false,label:'v₃=e₁+e₂',labelX:148,labelY:126},
    zero:{list:'列表：e₁, e₂, v₃=0',first:'u = 2e₁ + e₂ + 0v₃；系数 (2,1,0)',second:'u = 2e₁ + e₂ + v₃；系数 (2,1,1)',relation:'v₃ = 0（系数 1 非零）',status:'零向量不扩大范围，却让它自己的系数可以任意改变；列表线性相关。',v3:false,zero:true,label:'v₃=0',labelX:99,labelY:174}
  };
  const render=key=>{
    const state=states[key];
    root.querySelector('[data-list]').textContent=state.list;
    root.querySelector('[data-first]').textContent=state.first;
    root.querySelector('[data-second]').textContent=state.second;
    root.querySelector('[data-relation]').textContent=state.relation;
    root.querySelector('[data-status]').textContent=state.status;
    root.querySelector('[data-v3]').style.display=state.v3?'':'none';
    root.querySelector('[data-zero]').style.display=state.zero?'':'none';
    const label=root.querySelector('[data-v3-label]');
    label.style.display=(state.v3||state.zero)?'':'none';
    label.textContent=state.label;
    label.setAttribute('x',String(state.labelX));
    label.setAttribute('y',String(state.labelY));
    root.querySelectorAll('[data-state]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.state===key)));
    svg.setAttribute('aria-label',`当前${state.list}。目标 u 等于 2,1。${state.status}`);
  };
  root.querySelectorAll('[data-state]').forEach(button=>button.addEventListener('click',()=>render(button.dataset.state)));
  render('none');
})();
</script></div>

实验没有使用“二维空间最多有两个线性无关向量”这类稍后的结论。每个相关判断都由屏幕上明确写出的非平凡零关系直接得到。

## 完整正例：逐坐标排除所有隐藏关系

考察 $\mathbb F^4$ 中的向量组

$$
\begin{aligned}
v_1&=(1,0,0,0),\\
v_2&=(0,1,0,0),\\
v_3&=(0,0,1,0).
\end{aligned}
$$

要证明它线性无关，不能只说三个向量“方向不同”，而要从任意可能的零关系开始。设 $a_1,a_2,a_3\in\mathbb F$ 且

$$
a_1v_1+a_2v_2+a_3v_3=(0,0,0,0).
$$

左侧逐坐标相加就是

$$
(a_1,a_2,a_3,0)=(0,0,0,0).
$$

向量相等意味着每个对应坐标相等，因此 $a_1=a_2=a_3=0$。我们从任意一组满足等式的系数出发，最后把它们全部迫成零，所以这三个向量线性无关。

## 完整反例：参数何时制造相关性

令

$$
\begin{aligned}
v_1&=(2,3,1),\\
v_2&=(1,-1,2),\\
v_3&=(7,3,c),
\end{aligned}
$$

其中 $c\in\mathbb F$，且这里的 $\mathbb F$ 是 $\mathbb R$ 或 $\mathbb C$。我们要判断什么情况下 $v_1,v_2,v_3$ 线性相关。

设 $xv_1+yv_2+zv_3=0$。比较三个坐标得到

$$
\begin{aligned}
2x+y+7z&=0,\\
3x-y+3z&=0,\\
x+2y+cz&=0.
\end{aligned}
$$

前两式相加并回代，可得

$$
x=-2z,\qquad y=-3z.
$$

代入第三式后只剩

$$
(c-8)z=0.
$$

若 $c\ne8$，则 $c-8$ 可逆，所以 $z=0$，继而有 $x=y=0$。这时只有平凡关系，向量组线性无关。

若 $c=8$，取 $z=-1$，便有 $x=2$ 与 $y=3$，从而

$$
2v_1+3v_2-v_3=0.
$$

系数不全为零，所以向量组线性相关。于是这组向量线性相关当且仅当 $c=8$。注意，“找到一个关系”足以证明相关；而在 $c\ne8$ 的情形，我们必须说明任意关系都只能是平凡关系。

## 必须亲自检查的边界

**空向量组。** 约定空向量组线性无关。它没有系数可选，唯一的空线性组合就是零向量；不存在所谓“不全为零”的空系数组。

**只有一个向量。** 单向量组 $v$ 线性无关当且仅当 $v\ne0$。若 $v=0$，关系 $1v=0$ 已经非平凡；若 $v\ne0$ 且 $av=0$，一旦 $a\ne0$ 就可乘以 $a^{-1}$ 推出 $v=0$，产生矛盾，所以只能有 $a=0$。

**只有两个向量。** $v_1,v_2$ 线性无关，当且仅当任一向量都不是另一向量的标量倍。若 $v_2=\lambda v_1$，则 $\lambda v_1-v_2=0$ 是非平凡关系。反过来，若 $a_1v_1+a_2v_2=0$ 且某个系数非零，就能除以这个系数，把一个向量解成另一个的标量倍。

**含有零向量。** 任何包含 $0$ 的非空向量组都线性相关：把零向量所在位置的系数取为 $1$，其余取为 $0$，就得到非平凡零关系。

**删去若干项。** 从线性无关组中删去任意若干项，剩余组仍线性无关。否则，剩余项的一个非平凡零关系在被删位置补上系数 $0$，就会成为原组的非平凡零关系，与原组线性无关矛盾。反方向不成立：从相关组中删去合适项可能变成无关组。

## 标量域不是背景装饰

同样两个复数，可以按不同标量域看成不同的向量组。令

$$
v_1=1+i,\qquad v_2=1-i.
$$

把 $\mathbb C$ 看成 $\mathbb R$ 上的向量空间时，若实数 $a,b$ 满足

$$
a(1+i)+b(1-i)=0,
$$

比较实部和虚部得到 $a+b=0$ 与 $a-b=0$，所以 $a=b=0$。此时 $v_1,v_2$ 在 $\mathbb R$ 上线性无关。

把 $\mathbb C$ 看成 $\mathbb C$ 上的向量空间时，复系数 $i$ 被允许，而

$$
i(1+i)+(1-i)=0.
$$

这是一条非平凡关系，所以同一向量组在 $\mathbb C$ 上线性相关。判断线性无关时，必须始终写清标量来自哪个域。

## 常见的错误判断

- “每个向量都非零”只是必要条件，不足以保证整个组线性无关。例如 $e_1,e_2,e_1+e_2$ 都非零，却有非平凡零关系。
- “任意两向量都不成比例”只够处理长度为二的组。三个或更多向量可能没有成比例的两项，却仍会共同抵消。
- 张成范围大不等于线性无关。加入可由旧向量合成的新向量，不会扩大 span，却会增加重复表示。
- 不能在这里用“向量个数不超过维数”作为定义或证明；维数尚未建立。当前所有判断都直接回到零线性关系。
- 线性无关不依赖向量的排列顺序；稍后的相关性引理使用顺序，只是为了指出一个具体的可删除位置。

## 它把我们带到哪里

张成解决“能否表示”，线性无关解决“是否唯一”。下一条推导会证明：若一个有限向量组线性相关，就能按当前顺序找到某个可由前项表示的向量，并把它删去而不改变张成空间。这个删去冗余的机制，随后会让我们从“覆盖范围”走向既能覆盖又没有重复表示的生成组。

> Axler 来源：《线性代数应该这样学》第 2A 节，定义 2.15、例 2.16、定义 2.17、例 2.18，以及线性相关性引理 2.19 的后续预告。标量域边界取自习题 2A.7。
>
> Strang 路线：*Introduction to Linear Algebra*, 5th ed., §1.3, pp. 26-27，以矩阵列和齐次方程 $Ax=0$ 的非平凡解作为相关性的证人。
