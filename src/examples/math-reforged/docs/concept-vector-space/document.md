# 向量空间

## “向量”不是一种外形

平面箭头、有限坐标组、无限序列和函数看起来完全不同。它们却都能进行两种
相同类型的操作：

- 两个同类对象相加；
- 用数域 $\mathbb F$ 中的标量缩放一个对象。

线性代数真正依赖的不是对象有没有箭头或坐标，而是这两种运算是否遵守一套
稳定规则。满足这套规则的环境称为**向量空间**，其中的元素称为**向量**
或**点**。

> 向量空间是一个允许线性组合，而且线性组合始终按熟悉算术规则工作的世界。

## 先说明两种运算是什么

按照定义 1.19，集合 $V$ 上的加法是一个函数

$$
+:V\times V\longrightarrow V,
$$

它把每对 $u,v\in V$ 送到 $u+v\in V$。标量乘法是一个函数

$$
\mathbb F\times V\longrightarrow V,
$$

它把 $\lambda\in\mathbb F$ 与 $v\in V$ 送到 $\lambda v\in V$。

两个陪域都写成 $V$，已经包含**封闭性**：相加或缩放后不能跑出 $V$。
仅有两种运算仍不够；任意胡乱规定的运算未必支持可靠推理。

## 正式定义中的每项条件为何存在

定义 1.20 说，若上述运算满足以下条件， $V$ 就是 $\mathbb F$ 上的向量空间。下面所有公式都必须对任意适当的向量和标量成立。

### 加法不应依赖排列与括号

对任意 $u,v,w\in V$，

$$
u+v=v+u,
$$

$$
(u+v)+w=u+(v+w).
$$

交换律说明相加的先后不改变结果；结合律说明多个向量相加时，括号位置不产生
歧义。于是可以稳定地写 $u+v+w$。

### 必须有一个统一的零向量

存在 $0_V\in V$，使得对每个 $v\in V$，

$$
v+0_V=v.
$$

量词顺序是“存在一个 $0_V$，对所有 $v$ 都有效”，不是为每个 $v$ 临时挑
一个不同的零。没有零向量，就无法表达“没有贡献的向量”，也无法建立后面的
齐次方程与零空间。

### 每个向量必须能够被抵消

对每个 $v\in V$，存在 $w\in V$，使

$$
v+w=0_V.
$$

在证明逆元唯一后，这个 $w$ 才记作 $-v$。加法逆元让减法成为可能，也保证
方程两边可以合法消去同一个向量。

### 连续缩放必须与标量乘法一致

对任意 $a,b\in\mathbb F$ 与 $v\in V$，

$$
(ab)v=a(bv),
$$

$$
1v=v.
$$

第一式说明“先乘 $b$ 再乘 $a$ ”与“一次乘 $ab$ ”相同；第二式说明标量 $1$ 不改变向量。

### 两条分配律把两种加法接起来

对任意 $a,b\in\mathbb F$ 与 $u,v\in V$，

$$
a(u+v)=au+av,
$$

$$
(a+b)v=av+bv.
$$

第一条拆开向量之和，第二条拆开标量之和。它们是标量算术与向量加法之间的
桥梁，也是以后展开线性组合的依据。

## 一条反例就足以使定义失败

公理是全称要求：一个结构必须通过全部条件。下面切换教材中的模型与边界例，
查看“最先应检查什么”以及失败时的具体证据。

<div class="axiom-lab"><style>
.axiom-lab{--ink:#17231d;--muted:#5b6761;--line:#c8d2cc;--paper:#fbfcfa;--soft:#f1f5f2;--green:#255f49;--teal:#126f78;--coral:#b84a39;--gold:#b58b1d;box-sizing:border-box;margin:18px 0;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif}.axiom-lab *{box-sizing:border-box}.axiom-lab .al-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:15px 18px;border-bottom:1px solid var(--line);background:var(--soft)}.axiom-lab h3{margin:0 0 4px;font-size:18px}.axiom-lab p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.axiom-lab .al-modes{display:flex;flex-wrap:wrap;border:1px solid #aeb9b3;background:#fff}.axiom-lab button{min-height:36px;padding:0 11px;border:0;border-right:1px solid #aeb9b3;background:#fff;color:var(--ink);font-size:12px;font-weight:750;cursor:pointer}.axiom-lab button:last-child{border-right:0}.axiom-lab button[aria-pressed="true"]{background:var(--green);color:#fff}.axiom-lab button:focus-visible{outline:3px solid #edc74a;outline-offset:2px}.axiom-lab .al-body{display:grid;grid-template-columns:minmax(190px,.7fr) minmax(0,1.3fr)}.axiom-lab .al-list{display:grid;gap:7px;padding:16px 18px;border-right:1px solid var(--line);background:#fff}.axiom-lab .al-check{display:grid;grid-template-columns:20px 1fr;gap:7px;align-items:start;font-size:12px}.axiom-lab .al-mark{display:grid;place-items:center;width:18px;height:18px;border:1px solid #9eaaa3;color:var(--muted);font-weight:900}.axiom-lab .al-check[data-state="pass"] .al-mark{border-color:var(--green);background:#e8f3ed;color:var(--green)}.axiom-lab .al-check[data-state="fail"] .al-mark{border-color:var(--coral);background:#fff0ec;color:var(--coral)}.axiom-lab .al-evidence{display:grid;align-content:center;gap:10px;min-width:0;padding:18px}.axiom-lab .al-name{font-size:16px}.axiom-lab code{display:block;padding:10px 12px;border-left:4px solid var(--gold);background:#f7f8f5;color:var(--ink);font:700 13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.axiom-lab .al-result{font-weight:800;color:var(--green)}.axiom-lab .al-result[data-pass="false"]{color:var(--coral)}.axiom-lab .al-foot{padding:10px 18px;border-top:1px solid var(--line);background:var(--soft)}@media(max-width:720px){.axiom-lab .al-head{grid-template-columns:1fr}.axiom-lab .al-modes{width:max-content;max-width:100%}.axiom-lab .al-body{grid-template-columns:1fr}.axiom-lab .al-list{grid-template-columns:1fr 1fr;border-right:0;border-bottom:1px solid var(--line)}}@media(max-width:440px){.axiom-lab .al-list{grid-template-columns:1fr}.axiom-lab button{flex:1 1 42%;padding:0 7px}}
.axiom-lab .al-check[data-state="unexamined"]{color:var(--muted)}
</style><div class="al-head"><div><h3>公理压力测试</h3><p>选择一个“集合 + 运算”，查看它通过全部条件，还是被一个反例否决。</p></div><div class="al-modes" role="group" aria-label="选择待检查的结构"><button type="button" data-case="coordinates" aria-pressed="true">𝔽²</button><button type="button" data-case="zero" aria-pressed="false">{0}</button><button type="button" data-case="functions" aria-pressed="false">函数空间</button><button type="button" data-case="empty" aria-pressed="false">空集</button><button type="button" data-case="extended" aria-pressed="false">扩充实数</button></div></div><div class="al-body"><div class="al-list"><div class="al-check" data-check="closure"><span class="al-mark">✓</span><span>两种运算封闭</span></div><div class="al-check" data-check="add"><span class="al-mark">✓</span><span>加法交换、结合</span></div><div class="al-check" data-check="zero"><span class="al-mark">✓</span><span>零向量存在</span></div><div class="al-check" data-check="inverse"><span class="al-mark">✓</span><span>加法逆元存在</span></div><div class="al-check" data-check="scale"><span class="al-mark">✓</span><span>缩放结合且 1v=v</span></div><div class="al-check" data-check="distribute"><span class="al-mark">✓</span><span>两条分配律</span></div></div><div class="al-evidence"><strong class="al-name" data-name>逐坐标运算的 𝔽²</strong><p data-description>每条公理都逐坐标归结为数域中的算术规律。</p><code data-evidence>(x+y)ₖ=xₖ+yₖ，(λx)ₖ=λxₖ</code><span class="al-result" data-result data-pass="true">通过：这是 𝔽 上的向量空间。</span></div></div><p class="al-foot"><strong>阅读方式：</strong>红色标出的是足以否决结构的一项；其他条件显示为未继续判定。</p><script>
(() => {
  const root=document.currentScript.closest('.axiom-lab');
  const cases={
    coordinates:{name:'逐坐标运算的 𝔽²',description:'每条公理都逐坐标归结为数域中的算术规律。',evidence:'(x+y)ₖ=xₖ+yₖ，(λx)ₖ=λxₖ',pass:true,fail:null},
    zero:{name:'只含零向量的集合 {0}',description:'零向量也可以是空间里唯一的向量；所有运算都只能得到 0。',evidence:'0+0=0，λ0=0',pass:true,fail:null},
    functions:{name:'逐点运算的函数空间 𝔽ˢ',description:'在每个输入点上调用数域规律，便能逐点验证全部公理。',evidence:'(f+g)(x)=f(x)+g(x)，(λf)(x)=λf(x)',pass:true,fail:null},
    empty:{name:'空集',description:'空集没有任何元素，因此找不到一个加法恒等元。',evidence:'不存在 0ᵥ∈∅',pass:false,fail:'zero'},
    extended:{name:'习题中的扩充实数',description:'给 ℝ∪{∞,-∞} 规定的加法不满足结合律。',evidence:'(∞+∞)+(-∞)=0，但 ∞+(∞+(-∞))=∞',pass:false,fail:'add'}
  };
  const stateLabels={pass:'通过',fail:'失败',unexamined:'未继续判定'};
  root.querySelector('.al-list').setAttribute('role','list');
  root.querySelectorAll('[data-check]').forEach(row=>{
    row.setAttribute('role','listitem');
    row.querySelector('.al-mark').setAttribute('aria-hidden','true');
  });
  root.querySelector('[data-result]').setAttribute('aria-live','polite');
  const render=key=>{
    const item=cases[key];
    root.querySelectorAll('[data-check]').forEach(row=>{
      const state=item.pass?'pass':(row.dataset.check===item.fail?'fail':'unexamined');
      row.dataset.state=state;
      row.querySelector('.al-mark').textContent=state==='pass'?'✓':(state==='fail'?'×':'—');
      const label=row.querySelector('span:last-child').textContent;
      row.setAttribute('aria-label',`${label}：${stateLabels[state]}`);
    });
    root.querySelector('[data-name]').textContent=item.name;
    root.querySelector('[data-description]').textContent=item.description;
    root.querySelector('[data-evidence]').textContent=item.evidence;
    const result=root.querySelector('[data-result]');
    result.dataset.pass=String(item.pass);
    result.textContent=item.pass
      ?`通过：这是 𝔽 上的向量空间。依据：${item.evidence}`
      :`不通过：${item.description} 证据：${item.evidence}。其他条件未继续判定。`;
  };
  root.querySelectorAll('[data-case]').forEach(button=>button.addEventListener('click',()=>{
    root.querySelectorAll('[data-case]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    render(button.dataset.case);
  }));
  render('coordinates');
})();
</script></div>

这个组件没有用有限样本“证明”公理；它把教材中的一般理由或反例证据展示出来。特别地， $\{0\}$ 是合法的最小向量空间，不能因为它只有一个元素就把它当成失败的退化情形。

## 同一套规则可以作用于不同对象

### 有限坐标组

$\mathbb F^n$ 按逐坐标加法与标量乘法构成 $\mathbb F$ 上的向量空间。
它是定义的动机模型，而不是定义本身。

### 无限序列

教材例 1.23 定义

$$
\mathbb F^\infty
=\{(x_1,x_2,\ldots):x_k\in\mathbb F\}.
$$

加法与标量乘法逐项进行。这里的无限序列不是定义 1.8 中的有限组，却仍可以
是向量。

### 函数

对任意集合 $S$，定义 1.24 用 $\mathbb F^S$ 表示所有函数 $f:S\to\mathbb F$，并逐点规定

$$
(f+g)(x)=f(x)+g(x),
$$

$$
(\lambda f)(x)=\lambda f(x).
$$

教材例 1.25 在 $S$ 非空的假设下说明 $\mathbb F^S$ 是向量空间。
它的零向量不是标量零，而是**零函数**

$$
0:S\to\mathbb F,
\qquad
0(x)=0.
$$

函数 $f$ 的加法逆元是函数 $-f$，满足 $(-f)(x)=-f(x)$。这说明
“向量”可以是一整个函数，而不只是若干坐标。

## 从公理推出，而不是继续增加公理

定义只要求加法恒等元存在。结论 1.26 证明它唯一：若 $0_V$ 与 $0'_V$
都是恒等元，则

$$
0'_V=0'_V+0_V=0_V+0'_V=0_V.
$$

结论 1.27 同样证明每个向量的加法逆元唯一，所以记号 $-v$ 与 $w-v=w+(-v)$ 才没有歧义。

下面三条常用公式也不是额外公理：

$$
0v=0_V,
$$

$$
a0_V=0_V,
$$

$$
(-1)v=-v.
$$

第一式左边的 $0$ 是标量零，右边的 $0_V$ 是向量零。证明第一式时，
分配律给出

$$
0v=(0+0)v=0v+0v.
$$

在两边加上 $0v$ 的加法逆元，得到 $0v=0_V$。同理，

$$
a0_V=a(0_V+0_V)=a0_V+a0_V
$$

推出 $a0_V=0_V$。最后，

$$
v+(-1)v=(1+(-1))v=0v=0_V,
$$

所以 $(-1)v$ 正是 $v$ 的加法逆元。

这些推导没有使用坐标，因而对函数、序列和以后出现的所有向量空间都成立。

## 数域和运算都是结构的一部分

按照定义 1.22， $\mathbb R$ 上的向量空间称为实向量空间， $\mathbb C$ 上的向量空间称为复向量空间。标量范围决定允许哪些缩放；若只验证实数缩放，却宣称得到复向量空间，论证并不完整。

集合本身也不足以决定结构。判断一个候选对象时，必须同时写清集合、加法、
标量乘法和标量域，然后逐项检查量词。向量空间为后续学习提供统一环境：
下一步可以研究它内部仍保持全部运算的子集，也可以研究保持这些运算的函数。

> 教材对应：Axler《线性代数应该这样学》第 1B 节。运算定义 1.19，
> 向量空间正式定义 1.20，向量/点定义 1.21，实与复向量空间定义 1.22，
> 序列例 1.23，函数空间记号与例子 1.24-1.25，唯一性结论 1.26-1.27，
> 记号 1.28-1.29，以及基本结论 1.30-1.32。空集与扩充实数边界分别来自
> 习题 4、6。
