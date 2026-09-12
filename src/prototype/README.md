# PROTOTYPE — 多路线选择的前端形态（#100）

**丢弃用。** 这个目录只回答一个问题：学习者的工作区里已经有若干条确认过的路线时，
「我现在在哪条上」与「怎么换到另一条」应该长什么样。它不实现 #100，不改应用代码，
也不写任何文件。

## 跑起来

```bash
npm run dev
```

然后打开 <http://localhost:1420/prototype.html>，或直接带变体参数：

- <http://localhost:1420/prototype.html?variant=A>
- <http://localhost:1420/prototype.html?variant=B>
- <http://localhost:1420/prototype.html?variant=C>

底部浮条和 `←` `→` 键切换变体。这个页面**不在生产构建里**：`vite build` 只取
`index.html` 与 `legacy.html`。

截三张图：`node src/prototype/shoot.mjs`（服务器要在跑）。

## 三个变体在争什么

| | 路线列表住在哪 | 主affordance | 代价 |
| --- | --- | --- | --- |
| **A · 路线书架** | 学习导航里新开一个「我的路线」视图 | 选一条 | 导航多一项；列表与「路线学习」两个地方都像入口 |
| **B · 侧栏切换器** | 不新增视图，挂在走路线时侧栏头部 | 边走边换 | 列表被藏起来，第一次进来要先开一次弹层 |
| **C · 开局选择** | 进入学习就落在这里（主从页） | 继续上次 | 抢掉了 orientation 的落地位置；列表顶部和选中项会重复 |

三者对同一批事实的取舍不同，不是换皮：A 把「集合」当页面，B 把「当前路线」当页面，
C 把「下一步动作」当页面。

## 数据是真的，记录是假的

`routes-data.ts` 用 `src/testing/routeSolver.ts` 的贪心求解器在真实的
`src/examples/math-reforged` 图上真算了一遍，所以步骤、标签、成本、子图都是真的。
`id` / `description` / `basis` 哈希和「以前确认过」这层框架是编的。
`state.json` 是一份手写的掌握快照，进度（`n/N`、当前第几步）完全由它推导 —— 与
`docs/learner-records.md` 一致：路线里没有游标，也没有任何进度字段。

## 收尾

定了哪个变体之后：把胜出的部分折进 `src/modes/learning/`，把三个变体连同这个页面
一起提交到丢弃分支（不进 main），并在 #100 上留一行指针和结论。
