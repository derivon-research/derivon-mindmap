# 零空间

> **节点范围：** 本节点只表示线性映射的零空间。值域是独立节点；下文的并列比较用于辨析二者，不把它们视为同一个概念。

## 一张映射的两份“体检报告”

设 $T:V\to W$ 是线性映射。知道怎样计算 $Tv$，还不等于真正理解 $T$：
有些不同输入可能被它压成同一个输出，有些写在陪域 $W$ 中的目标则
可能永远到不了。

因此，对一个线性映射最先值得问的是两个问题：

1. 哪些输入被完全抹掉，变成零向量？
2. 当输入遍历整个定义域时，哪些输出确实能够出现？

第一个问题产生**零空间**，第二个问题产生**值域**：

> 零空间记录 $T$ 丢掉的输入方向；值域记录 $T$ 实际覆盖的输出范围。

这两份信息分别生活在映射箭头的两端，不能混在一起。

## 先把定义域与陪域放对位置

设 $V,W$ 是同一数域 $\mathbb F$ 上的向量空间，并且

$$
T\in\mathcal L(V,W).
$$

按照 Axler 的定义 3.11， $T$ 的**零空间**是

$$
\operatorname{null}T=\{v\in V:Tv=0_W\}.
$$

- $v\in V$ 表明我们寻找的是输入，所以零空间是定义域的子集：

  $$
  \operatorname{null}T\subseteq V.
  $$
- $Tv=0_W$ 表明这些输入被送到陪域 $W$ 的零向量；
- 定义收集所有满足方程的 $v$，不是只找一个特解。

按照定义 3.16， $T$ 的**值域**是

$$
\operatorname{range}T=\{Tv:v\in V\}.
$$

把其中隐含的量词写出来，就是：一个候选输出 $w\in W$ 属于值域，当且仅当

$$
\begin{aligned}
w\in\operatorname{range}T
&\iff \text{存在 }v\in V,\\
&\phantom{\iff}\text{使得 }Tv=w.
\end{aligned}
$$

因此 $\operatorname{range}T\subseteq W$。值域中的 $w$ 必须有至少一个
原像，但不要求原像唯一。

| 对象 | 在哪里寻找 | 检查的问题 |
| --- | --- | --- |
| $\operatorname{null}T$ | 定义域 $V$ | 哪些 $v$ 满足 $Tv=0_W$？ |
| $\operatorname{range}T$ | 陪域 $W$ | 哪些 $w$ 至少能写成一次 $Tv$？ |

零空间是一个特殊输出 $0_W$ 的全部原像；值域则把所有可能输入的像收集起来。

## 一个例子同时算出两者

教材例 3.12 考察线性映射

$$
\varphi:\mathbb C^3\to\mathbb C.
$$

它的作用规则是

$$
\varphi(z_1,z_2,z_3)=z_1+2z_2+3z_3.
$$

输入 $(z_1,z_2,z_3)$ 落入零空间，当且仅当
$z_1+2z_2+3z_3=0$。令 $z_2=s,z_3=t$，就必须有 $z_1=-2s-3t$，
所以

$$
\operatorname{null}\varphi
=\{(-2s-3t,s,t):s,t\in\mathbb C\}.
$$

每个这样的向量都可以按两个自由参数拆开：

$$
\begin{aligned}
(-2s-3t,s,t)
&=s(-2,1,0)\\
&\quad+t(-3,0,1).
\end{aligned}
$$

这说明有两个可自由变化的输入方向被 $\varphi$ 压成了 $0$。例如

$$
\varphi(-2,1,0)=\varphi(-3,0,1)=0.
$$

再求值域。任取 $c\in\mathbb C$，选择输入 $(c,0,0)$，就有 $\varphi(c,0,0)=c$，因此

$$
\operatorname{range}\varphi=\mathbb C.
$$

一个映射可以丢掉许多输入信息，同时仍能到达陪域中的每个目标。有非零零空间
和值域等于陪域并不矛盾。

## 动手观察：塌掉的输入与可达的输出

下面的实验把定义域和值域并排放置。先改变线性映射，再移动输入 $v$ 和
候选目标 $w$。左图高亮零空间，右图高亮值域；青色箭头是当前输出 $Tv$。
默认映射 $T(x,y)=(x+y,0)$ 会把直线 $x+y=0$ 压成原点，而输出只能
落在横轴上。

<div class="null-range-lab"><style>
.null-range-lab{--ink:#17231d;--muted:#59665f;--line:#c8d1cc;--paper:#fbfcfa;--soft:#f1f5f2;--green:#255f49;--teal:#126f78;--coral:#b84939;--gold:#bd921d;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}
.null-range-lab *{box-sizing:border-box}.null-range-lab .head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:16px 18px;border-bottom:1px solid var(--line);background:var(--soft)}
.null-range-lab h3,.null-range-lab h4{margin:0;color:var(--ink)}.null-range-lab h3{font-size:18px}.null-range-lab h4{font-size:13px}
.null-range-lab p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.6}.null-range-lab .presets{display:flex;flex-wrap:wrap;border:1px solid #aeb9b3;background:#fff}
.null-range-lab button{min-height:36px;padding:0 10px;border:0;border-right:1px solid #aeb9b3;background:#fff;color:var(--ink);font-size:12px;font-weight:750;cursor:pointer}
.null-range-lab button:last-child{border-right:0}.null-range-lab button[aria-pressed="true"]{background:var(--green);color:#fff}
.null-range-lab button:focus-visible,.null-range-lab input:focus-visible{outline:3px solid #edc74a;outline-offset:2px}
.null-range-lab .controls{display:grid;grid-template-columns:repeat(4,minmax(125px,1fr));gap:14px;padding:15px 18px;border-bottom:1px solid var(--line);background:#fff}
.null-range-lab label{display:grid;grid-template-columns:1fr auto;gap:6px;font-size:12px;font-weight:750}.null-range-lab input{grid-column:1/-1;width:100%;accent-color:var(--teal)}
.null-range-lab output{color:var(--coral);font-variant-numeric:tabular-nums}.null-range-lab .readout{display:grid;grid-template-columns:1.2fr 1fr 1fr;border-bottom:1px solid var(--line);background:#f8faf8}
.null-range-lab .readout>div{min-width:0;padding:11px 14px}.null-range-lab .readout>div+div{border-left:1px solid var(--line)}
.null-range-lab .readout strong,.null-range-lab .readout span,.null-range-lab .readout code{display:block;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
.null-range-lab .readout code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.null-range-lab .readout span{color:var(--muted)}
.null-range-lab .plots{display:grid;grid-template-columns:1fr 1fr;background:#fff}.null-range-lab .plot{min-width:0;padding:12px}.null-range-lab .plot+.plot{border-left:1px solid var(--line)}
.null-range-lab .plot-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline;padding:0 4px 6px}.null-range-lab .plot-head span{color:var(--muted);font-size:11px}
.null-range-lab svg{display:block;width:100%;height:auto;aspect-ratio:6/5}.null-range-lab .grid{stroke:#e4e9e6;stroke-width:1}.null-range-lab .axis{stroke:#9eaaa4;stroke-width:1.4}
.null-range-lab .null-locus{fill:none;stroke:var(--coral);stroke-width:8;stroke-linecap:round;opacity:.78}.null-range-lab .range-locus{fill:none;stroke:var(--gold);stroke-width:8;stroke-linecap:round;opacity:.72}
.null-range-lab .null-locus.plane{fill:var(--coral);stroke:none;opacity:.15}.null-range-lab .range-locus.plane{fill:var(--gold);stroke:none;opacity:.15}
.null-range-lab .input-vector{stroke:#405149;stroke-width:4}.null-range-lab .output-vector{stroke:var(--teal);stroke-width:5}.null-range-lab .candidate{stroke-width:3}
.null-range-lab .candidate[data-reachable="true"]{fill:#fff;stroke:var(--green)}.null-range-lab .candidate[data-reachable="false"]{fill:#fff;stroke:var(--coral)}.null-range-lab .origin{fill:var(--ink)}
.null-range-lab .foot{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);background:var(--soft)}.null-range-lab .foot p{padding:10px 18px;margin:0}.null-range-lab .foot p+p{border-left:1px solid var(--line)}
@media(max-width:780px){.null-range-lab .head{grid-template-columns:1fr}.null-range-lab .presets{width:max-content;max-width:100%}.null-range-lab .controls{grid-template-columns:1fr 1fr}.null-range-lab .readout{grid-template-columns:1fr}.null-range-lab .readout>div+div{border-left:0;border-top:1px solid var(--line)}}
@media(max-width:560px){.null-range-lab .controls,.null-range-lab .plots,.null-range-lab .foot{grid-template-columns:1fr}.null-range-lab .plot+.plot,.null-range-lab .foot p+p{border-left:0;border-top:1px solid var(--line)}.null-range-lab button{flex:1 1 46%;border-bottom:1px solid #aeb9b3}}
</style><div class="head"><div><h3>一张映射，两端同时观察</h3><p>改变映射后，比较变成零的输入与仍然可达的目标。</p></div><div class="presets" role="group" aria-label="选择线性映射"><button type="button" data-map="identity" aria-pressed="false">保持全部</button><button type="button" data-map="projection" aria-pressed="false">投影到横轴</button><button type="button" data-map="sum" aria-pressed="true">沿斜线折叠</button><button type="button" data-map="zero" aria-pressed="false">全部归零</button></div></div><div class="controls"><label>输入 x <output data-x-out>1.0</output><input data-x type="range" min="-1.5" max="1.5" step="0.5" value="1" aria-label="输入向量的 x 坐标"></label><label>输入 y <output data-y-out>-1.0</output><input data-y type="range" min="-1.5" max="1.5" step="0.5" value="-1" aria-label="输入向量的 y 坐标"></label><label>目标 a <output data-a-out>1.0</output><input data-a type="range" min="-2.5" max="2.5" step="0.5" value="1" aria-label="候选目标的第一个坐标"></label><label>目标 b <output data-b-out>0.0</output><input data-b type="range" min="-2.5" max="2.5" step="0.5" value="0" aria-label="候选目标的第二个坐标"></label></div><div class="readout"><div><strong data-map-name>沿斜线折叠</strong><code data-map-formula>T(x,y) = (x+y, 0)</code><span data-current-output>当前 T(1.0,-1.0)=(0.0,0.0)</span></div><div><strong>零空间</strong><code data-null-text>{(t,-t): t∈ℝ}</code><span data-null-status aria-live="polite">当前输入在零空间中。</span></div><div><strong>值域</strong><code data-range-text>{(s,0): s∈ℝ}</code><span data-range-status aria-live="polite">候选目标 (1.0,0.0) 可达。</span></div></div><div class="plots"><div class="plot"><div class="plot-head"><h4>定义域 V = ℝ²</h4><span>珊瑚色：null T</span></div><svg data-domain viewBox="0 0 360 300" role="img"><defs><marker data-marker-input markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#405149"/></marker></defs><g data-domain-grid></g><g data-null-shape></g><line class="input-vector" data-input-vector/><circle class="origin" cx="180" cy="150" r="4"/></svg></div><div class="plot"><div class="plot-head"><h4>陪域 W = ℝ²</h4><span>金色：range T</span></div><svg data-codomain viewBox="0 0 360 300" role="img"><defs><marker data-marker-output markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L0 6L7 3Z" fill="#126f78"/></marker></defs><g data-codomain-grid></g><g data-range-shape></g><line class="output-vector" data-output-vector/><circle class="candidate" data-candidate data-reachable="true" r="7"/><circle class="origin" cx="180" cy="150" r="4"/></svg></div></div><div class="foot"><p><strong>左图：</strong>输入落在珊瑚色集合上，青色输出就缩到原点。</p><p><strong>右图：</strong>候选点落在金色集合上，才存在输入把它映到那里。</p></div><noscript><p>静态状态：对 T(x,y)=(x+y,0)，零空间是 x+y=0，值域是横轴。</p></noscript><script>
(() => {
  const root=document.currentScript.closest('.null-range-lab'),ns='http://www.w3.org/2000/svg',origin={x:180,y:150},scale=50;
  const maps={identity:{name:'保持全部',formula:'T(x,y) = (x, y)',m:[1,0,0,1],nullKind:'point',rangeKind:'plane',nullText:'{(0,0)}',rangeText:'ℝ²'},projection:{name:'投影到横轴',formula:'T(x,y) = (x, 0)',m:[1,0,0,0],nullKind:'yaxis',rangeKind:'xaxis',nullText:'{(0,t): t∈ℝ}',rangeText:'{(s,0): s∈ℝ}'},sum:{name:'沿斜线折叠',formula:'T(x,y) = (x+y, 0)',m:[1,1,0,0],nullKind:'anti',rangeKind:'xaxis',nullText:'{(t,-t): t∈ℝ}',rangeText:'{(s,0): s∈ℝ}'},zero:{name:'全部归零',formula:'T(x,y) = (0, 0)',m:[0,0,0,0],nullKind:'plane',rangeKind:'point',nullText:'ℝ²',rangeText:'{(0,0)}'}};
  let active='sum';
  const point=([x,y])=>({x:origin.x+x*scale,y:origin.y-y*scale}),setLine=(line,a,b)=>{line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y)},make=(tag,attrs={})=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));return el};
  const uid=`nrl-${Math.random().toString(36).slice(2)}`,mi=root.querySelector('[data-marker-input]'),mo=root.querySelector('[data-marker-output]');mi.id=`${uid}-i`;mo.id=`${uid}-o`;root.querySelector('[data-input-vector]').setAttribute('marker-end',`url(#${mi.id})`);root.querySelector('[data-output-vector]').setAttribute('marker-end',`url(#${mo.id})`);
  const drawGrid=g=>{for(let i=-3;i<=3;i+=1)g.append(make('line',{x1:origin.x+i*scale,x2:origin.x+i*scale,y1:0,y2:300,class:i?'grid':'axis'}),make('line',{x1:0,x2:360,y1:origin.y+i*scale,y2:origin.y+i*scale,class:i?'grid':'axis'}))};drawGrid(root.querySelector('[data-domain-grid]'));drawGrid(root.querySelector('[data-codomain-grid]'));
  const drawLocus=(g,kind,cls)=>{g.replaceChildren();if(kind==='plane'){g.append(make('rect',{x:0,y:0,width:360,height:300,class:`${cls} plane`}));return}if(kind==='point'){g.append(make('circle',{cx:180,cy:150,r:10,class:cls}));return}const ends={xaxis:[point([-3,0]),point([3,0])],yaxis:[point([0,-3]),point([0,3])],anti:[point([-2.7,2.7]),point([2.7,-2.7])]}[kind],line=make('line',{class:cls});setLine(line,ends[0],ends[1]);g.append(line)};
  const controls={x:root.querySelector('[data-x]'),y:root.querySelector('[data-y]'),a:root.querySelector('[data-a]'),b:root.querySelector('[data-b]')},fmt=n=>Math.abs(n)<1e-9?'0.0':n.toFixed(1),apply=(m,[x,y])=>[m[0]*x+m[1]*y,m[2]*x+m[3]*y],reachable=(map,[a,b])=>map.rangeKind==='plane'||(map.rangeKind==='point'?Math.hypot(a,b)<1e-9:Math.abs(b)<1e-9);
  const render=()=>{const map=maps[active],input=[+controls.x.value,+controls.y.value],target=[+controls.a.value,+controls.b.value],output=apply(map.m,input),inNull=Math.hypot(...output)<1e-9,canReach=reachable(map,target);Object.entries(controls).forEach(([k,c])=>root.querySelector(`[data-${k}-out]`).value=fmt(+c.value));root.querySelector('[data-map-name]').textContent=map.name;root.querySelector('[data-map-formula]').textContent=map.formula;root.querySelector('[data-null-text]').textContent=map.nullText;root.querySelector('[data-range-text]').textContent=map.rangeText;root.querySelector('[data-current-output]').textContent=`当前 T(${fmt(input[0])},${fmt(input[1])})=(${fmt(output[0])},${fmt(output[1])})`;root.querySelector('[data-null-status]').textContent=inNull?'当前输入在零空间中。':'当前输入不在零空间中。';root.querySelector('[data-range-status]').textContent=`候选目标 (${fmt(target[0])},${fmt(target[1])}) ${canReach?'可达':'不可达'}。`;drawLocus(root.querySelector('[data-null-shape]'),map.nullKind,'null-locus');drawLocus(root.querySelector('[data-range-shape]'),map.rangeKind,'range-locus');setLine(root.querySelector('[data-input-vector]'),origin,point(input));setLine(root.querySelector('[data-output-vector]'),origin,point(output));const c=root.querySelector('[data-candidate]'),p=point(target);c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.dataset.reachable=String(canReach);root.querySelector('[data-domain]').setAttribute('aria-label',`${map.name}的定义域；零空间为${map.nullText}，当前输入${inNull?'位于':'不位于'}其中。`);root.querySelector('[data-codomain]').setAttribute('aria-label',`${map.name}的陪域；值域为${map.rangeText}，候选目标${canReach?'可达':'不可达'}。`)};
  root.querySelectorAll('[data-map]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.map;root.querySelectorAll('[data-map]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()}));Object.values(controls).forEach(c=>c.addEventListener('input',render));render();
})();
</script></div>

四种状态还展示了两个极端：恒等映射的零空间只有 $\{0\}$，值域是
整个陪域；零映射把整个定义域都压成 $0$，值域只剩 $\{0\}$。这里不
用“大小”作定量判断；有限维时的精确维数关系要等到线性映射基本定理。

## 这些集合为什么不只是随意的集合

线性映射保持加法与标量乘法，而子空间恰好要求对这些运算封闭。因此教材
结论 3.13 说明

$$
\operatorname{null}T\le V.
$$

结论 3.18 则说明

$$
\operatorname{range}T\le W.
$$

这里的符号 $U\le V$ 表示“$U$ 是 $V$ 的子空间”。

这不要求 $V$ 或 $W$ 有限维，也不要求 $T$ 单射、满射或可逆。完整证明
由相邻推导页面承担。

## 不只发生在坐标向量中

对多项式空间上的微分映射

$$
D:\mathcal P(\mathbb R)\to\mathcal P(\mathbb R),
\qquad Dp=p',
$$

教材例 3.12 与 3.17 给出

$$
\operatorname{null}D=\{\text{常值多项式}\}.
$$

同时，

$$
\operatorname{range}D=\mathcal P(\mathbb R).
$$

微分会丢掉常数项，但每个多项式都有多项式原函数，因此每个目标仍可到达。

再看后向移位

$$
B:\mathbb F^\infty\to\mathbb F^\infty.
$$

它删除数列的第一项：

$$
B(x_1,x_2,x_3,\ldots)=(x_2,x_3,\ldots).
$$

教材例 3.12 给出

$$
\operatorname{null}B=\{(a,0,0,\ldots):a\in\mathbb F\}.
$$

进一步由定义直接可算：输入 $(0,y_1,y_2,\ldots)$ 会被送到任意目标
$(y_1,y_2,\ldots)$，所以 $\operatorname{range}B=\mathbb F^\infty$。

## 解方程时，一个管存在，一个管唯一

方程 $Tv=w$ 有解，当且仅当 $w\in\operatorname{range}T$。若已经找到
一个解 $v_0$，沿任意零空间方向 $n$ 移动都有

$$
T(v_0+n)=w.
$$

反过来，任意两个解之差会落入零空间。因此全部解会组成

$$
v_0+\operatorname{null}T.
$$

这里必须先有特解 $v_0$。若

$$
w\notin\operatorname{range}T,
$$

那么方程没有解。

这只是下一簇问题的入口：值域决定“能不能到达”，零空间描述已经到达同一目标
时还剩哪些自由。定义 3.14 与结论 3.15 会进一步把“零空间只有零向量”
翻译成单射与解的唯一性。

## 最容易混淆的边界

- 零空间在 $V$ 中，值域在 $W$ 中。
- 陪域不等于值域；只有 $\operatorname{range}T=W$ 时， $T$ 才是满射。
- 零空间不是“输出中的零”，而是满足 $Tv=0_W$ 的输入。
- 值域不是一个固定输出，而是所有可能输出的集合。
- 零空间一定含 $0_V$，但不一定只含 $0_V$。
- 子空间结论依赖线性性；一般函数的零点集合不必对线性组合封闭。
- 这里没有有限维假设。

零空间和值域把“信息损失”和“输出覆盖”变成了可以继续研究的子空间。加入
有限维与维数后，我们才能精确计算多少方向被压掉、多少方向成为可达输出。

> 教材对应：Axler《线性代数应该这样学》第 3B 节。零空间是定义 3.11，
> 零空间为子空间是结论 3.13，单射是定义 3.14，单射判据是结论 3.15，
> 值域是定义 3.16，值域为子空间是结论 3.18；具体例子取自 3.12 与
> 3.17。后向移位的值域由定义直接补算。
