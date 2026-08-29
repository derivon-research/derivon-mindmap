# Derivon 大图性能与 G6 迁移计划

> 状态：方案已批准，进入直接迁移实施。
>
> 生命周期：本文件用于调查、方案确认与实施跟踪。用户确认整个性能重构任务完全完成后删除；在此之前保留每次性能实验（包括被否决或回滚的实验）的结果。
>
> 执行策略已于 2026-08-28 调整：项目处于快速迭代 demo 期，不再为旧 renderer 保留 fallback，也不以完整交互等价、双平台 release 测量或低风险渐进迁移作为下个版本的前置条件。下一轮直接让 G6 成为唯一 renderer，允许重构交互与内部架构，以最快速度产出可用版本。
>
> 当前实施状态（2026-08-29）：本轮实现和自动验证已完成。G6 Canvas 仍是唯一 production renderer；Canvas-native `136 x 64` concept cards、cost-only stacked diamonds、typed ports、cycle-safe cubic edges、compound/premise/conclusion drag、partial marquee、group drag、dimmed passivity、toolbar derivation create/edit forms 和 passive onboarding hint 已实施。Automatic layout 使用 cancellable Worker hybrid + card-aware separation；positions/manual drag 仍只在 session memory，不写任何 JSON。85 unit、19 browser E2E、13 Rust、fmt/clippy/build/typecheck/diff checks、desktop/mobile production Canvas pixels、macOS `.app`/DMG 和 release process smoke 均通过。1k 三跑 graph-ready/heap/long-task gates 通过；focus median 385.9 ms 仍高于 300 ms target并已记录。等待用户手动体验与最终完成确认；此前不删除 PLAN。

## 0. Demo 期执行指令（覆盖后文旧门禁）

以下指令优先级高于本计划中仍保留的历史性 Go/No-Go、fallback 和完整 parity 描述：

1. **直接迁移，不保留 renderer switch。** G6 改为默认且唯一 graph surface；`?renderer=g6` 只可短暂用于施工，不作为发布架构。迁移完成即删除 XYFlow canvas、provider、store、node components、样式与依赖。
2. **允许改变交互，不追求逐像素复刻。** 保留用户工作流和领域语义即可；连接、多选、replacement、focus 可以重做成更适合 Canvas 的交互，不必复制 ReactFlow handles、marquee 或 node toolbar。
3. **核心功能优先。** 下个版本必须支持打开工作区、浏览、搜索、选择、检查器编辑、拖动、自动布局、创建概念/推导、replacement、路线求解与高亮、文档编辑、undo/redo。minimap、hover card、完整教程、完整键盘/读屏和高级框选可延期。
4. **性能数据用于发现灾难性回退，不作为逐项审批。** 保留 1,000-concept smoke 和 bundle/heap/interaction 记录；只要没有空白、崩溃、不可操作或数量级回退，就继续推进，不因小幅噪声回滚架构重构。
5. **发布验证收窄。** 下个 demo release 只要求浏览器 production build、当前开发机 Tauri build/smoke 和核心流程 E2E；Windows、冻结硬件矩阵、20 次泄漏 soak、完整 accessibility audit 延后。
6. **布局使用 hybrid。** 少于 400 个投影节点默认使用 LR Dagre，保证入口与推导方向可读；达到阈值后使用 deterministic bipartite force。两者都在 Worker 中运行，positions 不持久化。
7. **已知 4 个旧 E2E 红项不阻塞迁移。** 不伪造通过，但允许删除或重写与旧 XYFlow/Joyride target 绑定的测试。新测试围绕 G6 的实际工作流建立。
8. **优先删除旧代码。** 不为了回滚能力保留两套 selection、viewport、event 或 node state；迁移中一旦 G6 路径覆盖工作流，就立即删除对应 XYFlow 路径。

## 1. 结论摘要

1. **当前瓶颈首先是渲染架构，不是 Rust 路线算法。** 路线求解已通过 `spawn_blocking` 离开 WebView UI 线程；打开路线模式本身不调用求解器。当前 React Flow 的 DOM 节点、SVG 边、全量 React 对象重建和同步布局才是主路径。
2. **G6 Canvas 技术路线已验证，下一步直接全面重写。** 1,000-concept progressive LOD 已显著优于 XYFlow；demo 期不再等待完整 native 矩阵或所有 parity gate。
3. **不再维护双 renderer。** GraphScene 是领域到画布的唯一边界，G6 是唯一 production consumer；已有 benchmark 继续作为回归观测工具，不再决定是否迁移。
4. **不要把 React/HTML 节点带到 G6。** React 只管理工具栏、检查器、路线面板和唯一的 hover card；大图中的概念、推导、label、port 和 edge 全部使用 G6 原生图形。
5. **Production layout 使用 Dagre/force hybrid。** 可控规模图优先 LR Dagre，使入口和推导层级可辨；大图使用 deterministic bipartite force。force premise springs 不复制 whole-hyperedge weight，只有 junction-to-head distance 携带 bounded weight signal。
6. **视觉上采用圆形概念点 + 菱形推导点 + 渐进式 label。** 下个版本优先使用右侧检查器承载完整信息；hover card 可延期，禁止重新引入每节点常驻 DOM 卡片。

## 2. 调查范围与现状

### 2.1 代码结构

- 技术栈：React 19、Vite 6、Tauri 2、`@xyflow/react` 12、Dagre、Rust `derivon-core`。
- `src/domain.ts` 的领域协议相对独立；`src/projection.ts` 和 `src/layout.ts` 已分离投影与布局纯函数，这是可保留的边界。
- `src/App.tsx` 有 2,213 行并包含约 120 个 React hooks 调用，混合了：领域命令、历史、工作区 I/O、投影、布局、XYFlow 数据适配、交互模式、路线、教程及大部分 UI。渲染细节虽然有 `GraphNodes.tsx`，但 graph runtime 与应用控制器没有真正隔离。
- `GraphNodes.tsx` 直接依赖 XYFlow Handle/Toolbar；`App.tsx` 直接构造 XYFlow node/edge、读写 XYFlow store，并在事件中执行领域命令。迁移时不能只替换一个组件。
- 当前 64 概念 + 68 超边测试被称为 large workspace，但没有 1,000 节点、延迟、长任务、FPS 或内存断言。

### 2.2 投影规模放大

G6 和 XYFlow 都不原生表达 B-超边。现有二部投影应保留：

```text
概念 tail(s) -> 推导节点 -> 概念 head
```

因此性能目标不能只写 schema point 数：

```text
visual nodes = concepts + visible hyperedge groups
visual edges = sum(tail count) + visible hyperedge groups
```

若有 1,000 个概念、1,000 条推导、平均每条两个 tails，实际约为 **2,000 个 visual nodes + 3,000 条 visual edges**。所有基准和预算按投影后 element 数报告。

## 3. 已测基线

方法：本机 1440x900 headless Chromium、Vite development build、链式图、已有坐标、每档三次。Long Task 使用浏览器 PerformanceObserver；这是可复现的 synthetic baseline，不替代 Tauri release、Windows WebView2、macOS WKWebView 和真实 Math Reforged trace。

| 概念数 | 投影节点/边 | DOM 元素 | 首次绘图主要长任务 | 无 focus 打开路线模式 |
|---:|---:|---:|---:|---:|
| 64 | 127 / 126 | 1,628 | 98–126 ms | 84–88 ms |
| 250 | 499 / 498 | 5,906 | 171–190 ms + 158–165 ms | 120–171 ms |
| 1,000 | 1,999 / 1,998 | 23,156 | 424 ms + 669–784 ms；一次冷样本 2,453 ms | 250–298 ms，含 189–238 ms 长任务 |

补充的 1,000 概念场景：

- 首次 hover 反馈约 205–225 ms；后续相邻 hover 约 46–49 ms。
- 先进入局部 focus，再打开路线模式约 625–750 ms，并观察到约 533–660 ms 长任务。
- 粗略 `usedJSHeapSize` 从 64 概念约 35 MB 增至 1,000 概念约 139 MB；该 Chromium API 只作趋势参考。

结论：即使 `onlyRenderVisibleElements` 已启用，初始 `fitView` 会让整图都位于视口，因而仍创建所有 React/SVG 元素；它不能解决当前目标规模。

## 4. 线程与算法隔离审计

### 4.1 已正确隔离

- `src-tauri/src/lib.rs:7`：`solve_route` 使用 `tauri::async_runtime::spawn_blocking`，Core Graph 构建与 `solve_many` 不占 WebView UI 线程。
- `src-tauri/src/workspace.rs:138-198`：save/read/revision/write 的主要磁盘与 hash 工作大多进入 `spawn_blocking`。
- 前端 `invoke()`、目录 API、WebCrypto digest 是异步接口；路线结果使用 Promise 返回。

### 4.2 仍需修正或测量

- ~~`choose_workspace` 在 async command 中直接同步读取，`read_workspace_file` 为同步 command。~~ **2026-08-28 已修正：**两者均通过 `tauri::async_runtime::spawn_blocking` 执行，Rust workspace 磁盘 I/O 现在具有一致的 blocking boundary。
- Rust 每 1.5 秒 revision 检查会扫描并 hash manifest 引用的全部文档；已离开 UI 线程，但大工作区会造成持续 I/O。后续应测量并考虑文件 metadata/增量 revision，而不是猜测性改缓存。
- 浏览器未连接目录时，`App.tsx:382` 在每次 document/files 变化后同步 `JSON.stringify` 整个 workspace 并写 `localStorage`。大图编辑会产生 UI 长任务。
- `layoutDocument`/Dagre、`layoutNeighborhood`、`projectDocument`、grouping 和所有 React `useMemo` 都在 WebView UI 线程。`useMemo` 与 `startTransition` 都不会把计算移到 Worker。

## 5. 已定位的前端热点

1. `neighborhood()` 每次 hover 都扫描全部 hyperedges，并对 tails 执行查找；`hoveredIds` 改变后又重建全部 edge 对象。高频交互路径是 O(E + total tails) 加一次全图 edge update。
2. `toggleRouteMode()` 同时清空 `focusedId` 和 `selectedId`。若用户位于局部视图，这会同步退出局部布局、切回全局位置、重建全部 nodes/edges，然后再挂载路线面板。
3. `projectedNodes` 为每个节点创建新的 style/data/callback 对象；其 effect 再 map 一次写入 XYFlow controlled state。一次领域或模式变化可穿过多层全量数组。
4. 边使用 SVG path；概念使用 HTML card；每个节点还有 Handles、toolbar、文字和 tags。1,000 concepts 在链式图已产生 23k DOM 元素。
5. MiniMap、全量 fit、selection store、测量节点尺寸与 hit testing 都增加隐性成本。`onlyRenderVisibleElements` 并不等于 scene virtualization。
6. `historyReducer` 保存最多 100 个 document snapshot。结构共享减轻了一部分复制，但大规模 position map 和 graph array 更新仍会累积内存。
7. route result 当前通过“给所有非路线元素设置 dimmed 状态”表达。无论 XYFlow 还是 G6，这种全图负状态更新都比“只增强少量路线元素”昂贵。

## 6. G6 5.1.1 能力与风险

### 6.1 与需求匹配的能力

| Derivon 需求 | G6 能力 | 建议 |
|---|---|---|
| 大图渲染 | 默认 Canvas；可安装 `@antv/g-webgl`；支持分层 renderer | 技术验证同时测 Canvas/WebGL，不能只测官方 demo |
| 概念/推导形状 | circle、diamond/自定义 node、native label、halo、badge | 每节点控制在少量 primitive；禁止 React/HTML node |
| 连接端口 | node port 与自定义 placement | 映射 concept in/out 与 derivation premise/conclusion；在 POC 验证 edge anchor/创建行为 |
| 选择/拖动/缩放 | click/brush/lasso select、drag-element/canvas、zoom、events | 领域语义仍由自己的 controller 决定，不让 behavior 直接改 manifest |
| 连接创建 | create-edge behavior + events/custom behavior | 用 adapter 实现三种 Derivon 连接语义，不把普通 edge 当领域事实 |
| hover/路线高亮 | element state、hover behavior、增量 update | 只更新 changed ID 集合，关闭 animation；不要每次给全图写 inactive state |
| 大图导航 | Minimap、focus/fit viewport、edge filter lens、fisheye | 第一版只用 Minimap 与 viewport API；插件逐个测量后启用 |
| 拖动画布优化 | `optimize-viewport-transform`，官方建议 500+ elements | pan/zoom 时仅保留 node key shape，临时隐藏 edge/label/port |
| label 密度 | `auto-adapt-label`、zoom/state style | 先用简单 zoom 阈值和业务优先级；内置 centrality/碰撞排序也必须测量 |
| 数据变更 | add/update/remove node/edge data、draw/render | 建立明确 diff 层；语义更新禁止 `setData + render` 全量刷新 |
| 布局 | Dagre、AntV Dagre、D3 Force、ForceAtlas2、自定义 `BaseLayout`；Worker、WASM、GPU | Force 与自定义 hypergraph force 作为首要候选；Dagre 只作为 hierarchical baseline |
| Undo/redo | History plugin | 不采用为业务历史来源，避免 G6 history 与 document history 双写 |
| React 生命周期 | 单 Graph instance，可在 effect cleanup `destroy()` | React 只持有 ref 和事件桥；Strict Mode 下必须保证 create/destroy 对称 |

### 6.2 必须正视的风险

- 官方 massive-data 示例展示 5k/20k/60k **简单元素**，不能外推到 Derivon 的 label、自定义推导节点、ports、state 和编辑行为。
- 以下 G6 v5 performance issue 在调查时仍为 open：
  - #7534：2,000 nodes + labels 在 v5 卡顿/崩溃；
  - #7402：500 nodes/edges 静置 CPU、拖动 CPU/内存问题；
  - #7574：1,000–3,000 custom nodes 相对 v4 明显回退。
- G6 `@antv/g6` npm unpacked size 约 7.6 MB，`@antv/layout` 约 11.4 MB；这不是 gzip bundle 数字，但说明必须检查 tree-shaking、route split 和最终 bundle，不能默认迁移没有下载/启动成本。
- WebGL 实测已 No-Go；下个版本只使用 Canvas，不维护 WebGL fallback。未来若重新评估 WebGL，再单独验证 WKWebView/WebView2 context、字体、DPR、context loss 与 CSP。
- Canvas 移除逐节点 DOM 后会损失天然键盘焦点和 screen-reader 语义。必须通过搜索、可键盘操作的选择列表、检查器 live region 和明确焦点回归补齐可访问性。

## 7. 目标架构

```text
AuthoringDocument (唯一持久化领域事实)
        |
        v
GraphIndex (按 graph revision 构建的 ID/邻接/分组索引)
        |
        +--> ProjectionService (replacement / parallel hyperedge / subgraph)
        +--> RouteService (Tauri IPC)
        +--> LayoutService (已实施 Worker；可取消、带 request ID 与算法版本)
        |
        v
GraphScene (renderer-neutral nodes/edges/states)
        |
        v
G6GraphSurface (唯一 production graph runtime)
        |
        +--> imperative viewport API (fit/focus/clientToGraph)
        +--> typed authoring intents (select/connect/drag/route)
```

建议模块边界：

- `domain/`：AuthoringDocument、校验、commands、inverse patches；不 import React/G6。
- `graph-model/`：GraphIndex、hyperedge grouping、projection、scene IDs；纯函数和可单测数据结构。
- `application/`：authoring reducer/controller、workspace service、route service、mode state machine。
- `graph-surface/`：renderer-neutral topology/runtime、scene diff 和 typed event intents。`src/graphScene.ts` 覆盖 empty-tail、multi-tail、parallel alternative 和 replacement projection；`graphSceneRuntime.ts` 定义 position/selection/focus/hover/route state 与 keyed diff。迁移后由 G6 独占消费，不再为 XYFlow 做第二次 adapter map。
- `graph-surface/g6/`：`G6GraphSurface.tsx` 已成为唯一 production surface，实现单实例 lifecycle、Strict Mode teardown guard、selective extension registration、增量 add/update/remove、changed-state update、300-node/96-edge frame batches、drag/click/contextmenu event bridge、imperative fit/focus/client-to-graph/zoom API 和 >300 concepts overview LOD。
- `workers/`：`layout.worker.ts` + `layoutService.ts` 已实施；新请求终止旧 Worker，response 必须匹配 request ID，旧结果不能覆盖新 graph。
- 现有 inspector、RoutePanel、DocumentEditor、onboarding 继续由 React 渲染。

### 7.1 状态所有权规则

1. `AuthoringDocument` 是唯一业务事实；G6 data 只是可销毁的 scene mirror。
2. G6 event 只发 typed intent，例如 `selectConcept(id)`、`createDerivation(source, target)`；不能直接改 document。
3. demo release 不强制先完成完整 mode reducer；允许沿用现有 React state，但所有 canvas event 必须收口为 typed intents，避免 G6 直接修改 document。
4. GraphIndex 持有 `pointById`、`edgeById`、incoming/outgoing/incident、groupByMemberId；hover 查询为 O(degree)，不扫描全图。
5. Scene diff 只产生 add/update/remove 和 changed state IDs；路线模式打开时 graph scene 应为零更新，路线结果只更新路线与上一条路线的差集。
6. G6 Graph 在 canvas mount 时创建一次，在 workspace 切换时 set/diff data，在 unmount 时 `off()` + `destroy()`；React render 不重建实例。
7. 业务 undo/redo 使用 command/inverse patch；不启用 G6 History 作为第二套事实来源。

## 8. 布局与位置策略

### 8.1 Force 为什么是首要候选

Derivon 的全图不是 DAG；合法的知识关系可能形成有外部入口的环。Dagre 可以作为方向清晰的对照布局，但不能作为未经验证的默认答案。另一方面，`weight` 表示“所有 tails 已掌握后，理解并验证整个步骤的边际认知成本”，较高成本映射为较长空间距离具有可解释性。因此 force 值得作为第一类候选，而不仅是可选 overview。

但需要守住两个数学边界：

- weight 属于完整 hyperedge，不能把同一个 `w(h)` 同时赋给每条 `tail -> derivation` 投影线；tail 越多就会被重复表达，违背 whole-step cost 语义。
- 当前 0–5 标尺支持加法和路线比较，却不自动证明“5 的视觉距离应是 1 的五倍”。距离函数应是有最小间距和最大间距的单调映射，例如 `L(w) = base + scale * f(w)`；线性、平方根或对数映射必须通过图可读性实验确定。
- Force equilibrium 同时受斥力、碰撞、共享节点和其他超边约束，最终二维欧氏距离不会严格等于成本，路径几何长度也不会严格等于集合成本。它是成本的视觉编码与布局势能，路线求解器仍是唯一计算权威。

### 8.2 成本感知的二部投影 force

第一版不必立即发明完整算法，可以利用现有概念点 + 推导点投影：

- `tail -> derivation junction` 使用与成本无关、按 tail 数归一化的短弹簧，只表达“这些前提共同汇入一步”；不能每条都承担整个成本。
- `derivation junction -> head` 的 ideal distance 使用该 hyperedge（或可见平行组）的 `L(weight)`，让成本只出现一次。
- junction 受所有 tails 的归一化合力约束，趋近 tails 的几何中心；head 与 junction 的距离表达完成这一步的成本。
- repulsion/collision 防止概念、推导和 label 重叠；固定 random seed 与有限 iterations 保证可复现。

必须专门定义边界情况：

- **多 tails：**合力按 `1 / |T(h)|` 归一，避免前提越多吸引力越大；还需验证几何中心是否会错误暗示各 tail 的独立贡献。
- **空 tail：**不能把它当学习者 start set。POC 比较 per-component virtual source、弱外圈 anchor 或无 tail spring 三种画法。
- **平行 hyperedges：**当前 UI 把同 tails/head 的多条推导组成一个 visual group。布局长度不能因用户切换 active alternative 而跳动；候选规则是使用 group 的最低成本、稳定聚合值，或让多条推导保持独立但视觉聚簇，必须经产品语义确认。
- **方向：**普通 d3-force 不使用箭头方向。可以只靠 edge arrow，也可以给 SCC condensation 加弱的宏观方向约束；这种约束必须是 soft constraint，因为环内不可能满足全局单调 x 顺序。

### 8.3 自定义 hypergraph force

若二部投影 force 的几何仍不理想，再实现领域布局。可把每条超边视作一个 factor：tails 的归一化联合约束决定 junction，`junction -> head` 的目标长度由 `L(w)` 决定，并额外加入 collision、component separation、mental-map stability 与可选 SCC directional penalty。

G6 允许继承 `BaseLayout` 实现 iterative layout（`execute`/`tick`/`stop`）并注册。但领域布局不应只能在 G6 内运行：

- 核心算法实现为 renderer-neutral `LayoutService`，输入 GraphScene/超边数据，输出 ID -> position；
- 在独立 Worker 中运行，带 revision/requestId、取消和超时，过期结果不得覆盖新图；
- G6 custom layout 只作薄 adapter，或直接消费 Worker 返回的位置；这样将来更换 renderer 时不用重写数学布局；
- topology edit 只局部 reheat/增量稳定，不因 route、hover、selection 等视图状态重跑全图布局。

POC 对照至少包括：

1. d3-force 默认 link distance；
2. 上述成本感知二部 force；
3. 自定义 hypergraph force；
4. AntV Dagre 或 SCC + Dagre hierarchical baseline。

使用 weighted stress、edge crossing、overlap、布局总时长、主线程长任务、交互 FPS、相同 seed 稳定性、拓扑小改后的总位移和人工可读性共同评判，不能只看“看起来散开了”。

### 8.4 Schema 与 view 边界

现有参考资料已经说明 core graph、authoring payload、view 是三层；但把三层放进同一个 `workspace.json` 仍只是存储选择，不是数学要求。这里接受“canonical schema 不应持久化运行时坐标”的方向：

- `.derivon/workspace.json` 的 canonical graph 不再要求 `view.positions`；领域、文档所有权和 weight 不依赖坐标。
- 完整 positions、viewport、selection、active parallel derivation、hover 等只属于当前运行时内存；不写入 manifest、browser localStorage layout cache 或独立 JSON。
- 每次 workspace load 和 graph topology/weight 变化都重新运行 force；route/focus 只计算临时 neighborhood positions。
- 手工 drag 只改变当前会话 runtime positions。切换 workspace 或重载后由 force 重新计算，不导出 pins/layout snapshot。
- `view.replacements` 与 positions 不同：它是会改变所有协作者所见投影的作者意图，可能需要共享。应决定把它移入独立、带版本且引用 graph digest 的 `.derivon/presentation.json`，还是继续与 manifest 原子保存；不能因为二者都叫 view 就和瞬时坐标一起处理。

实施状态（2026-08-28）：自动布局已通过 renderer-neutral Worker 接入。少于 400 个投影节点时使用 LR Dagre，达到阈值时使用 deterministic bipartite force；该切换恢复了可控规模图的入口和推导方向。force premise spring 距离固定且 strength 按 `1 / |T(h)|` 归一；只有 junction-to-head spring distance 编码 bounded `sqrt(weight)`，路线 solver 仍是成本权威。runtime positions 不持久化；旧 v0.2 positions 严格校验后丢弃，旧 browser layout-cache storage 在启动时删除。新请求终止旧 Worker，workspace load 与 topology/weight 变化重新计算全图，focus neighborhood 也按同一阈值选算法。

## 9. 视觉与交互建议

### 9.1 Progressive disclosure

- 低 zoom：概念为 14–20 px 圆点，推导为更小菱形；隐藏普通 label/port，保留选中、搜索命中、路线起终点和路线成员的 label。
- 中 zoom：显示经过碰撞筛选或业务优先级筛选的 native Canvas label。
- 高 zoom：显示完整 label、必要 ports、推导 weight/premise count；仍不创建逐节点 DOM card。
- pan/zoom 期间启用 `optimize-viewport-transform`，隐藏 edge、label、halo、port；停止后 debounce 恢复。

### 9.2 Concept card

- hover 120–180 ms 后只创建一张 DOM overlay card，锚定 G6 canvas-to-client 坐标，并与圆点保持 12–20 px 间距；根据边界选择象限，不能遮住目标点。
- card 只显示 label、ID、简短关系计数和明确操作；完整编辑仍在右侧 inspector。
- click 锁定选择并支持键盘；touch 不依赖 hover。移动离开、viewport transform 或 workspace 变化时销毁 card。
- 可以直接使用 G6 Tooltip 的 HTML 能力，也可以使用一个 React portal；POC 比较生命周期和定位后选择一种，禁止每节点一个 portal。

### 9.3 路线与边

- 基础图使用较克制的低对比边；hover 只增强一跳邻域；路线结果只增强 route IDs，不给所有背景元素逐一写 dimmed state。
- route mode 打开只改变侧栏和输入语义，不改变 graph data/layout。关闭 focus 必须是单独、明确的用户动作。
- 推导菱形不能被普通 direct edge 替代，否则 joint tails、parallel hyperedges、weight 和文档所有权都会丢失。
- Edge Bundling/Filter Lens 可作为大图探索工具，但不能默认改写方向可读性；只有在独立 benchmark 与用户测试后启用。

## 10. 下一版本直接迁移计划

目标：在下一轮实现中完成 **G6 默认化、核心工作流可用、XYFlow 删除、demo release 可构建**。不再按旧 Phase 0–5 等待门禁。

### 下一上下文 handoff

- 工作区已有大量未提交改动；不要 reset，也不要重新引入 positions persistence。
- 首先完整读取 `PLAN.md` 第 0、10、14 节，以及 `src/App.tsx`、`src/G6GraphSurface.tsx`、`src/graphScene.ts`、`src/graphSceneRuntime.ts`、`src/g6SceneSnapshot.ts`。
- 当前 G6 通过 `?renderer=g6` 工作；默认仍为 XYFlow。开发地址为 `http://127.0.0.1:1420/`。
- 当前已验证：75 frontend unit、13 Rust tests、排除 4 个旧红项后的 54/54 E2E；G6 dev/production nonblank 与 301-concept LOD tests 通过。
- 当前性能证据已经足够，不要在删除 XYFlow 前重新研究 renderer 或 force layout。第一项代码工作应是 imperative surface API 和替换 `useReactFlow` 调用。
- 允许重写/删除依赖 ReactFlow DOM、handles、marquee、Joyride canvas node targets 的 E2E；保留领域语义 tests 和 workspace/schema tests。
- 完成每个核心工作流后立即删除对应 XYFlow 代码，不建立长期 compatibility abstraction。

### 实施结果（2026-08-28）

- **Workstream A 完成：**G6 默认化；imperative viewport API 已替换 `useReactFlow`；XYFlow store/provider/conditional renderer 已删除。
- **Workstream B 核心完成：**browse/search/select/focus、Shift 多选、两步连接与 search target、drag/layout、replacement、parallel inspector、route state、document/history 均可用；自动全图布局和 focus neighborhood 通过可取消 Worker hybrid layout 执行；高级 Canvas interaction 按明确延期执行。
- **Workstream C 完成：**`GraphNodes.tsx`、selection debug、ReactFlow CSS、`@xyflow/react` 和 renderer-bound E2E 已删除；历史 XYFlow benchmark 留在非 spec 文件中。
- **Workstream D 完成：**76 unit、11 G6 workflow E2E、13 Rust tests、frontend build、perf typecheck、fmt/clippy、production 1k no-coordinate hybrid smoke、macOS Tauri `.app`/DMG build 与 release-process smoke 均通过。

### Workstream A：切断 XYFlow runtime（已完成）

1. 给 `G6GraphSurface` 增加 `forwardRef` imperative API：`fitView(ids?)`、`focusElement(ids)`、`clientToGraph(position)`、`zoomBy()`。
2. 在 `App.tsx` 用 surface ref 替换所有 `useReactFlow().fitView/screenToFlowPosition`。
3. 删除 `useNodesState`、`useStoreApi`、`onNodesChange`、ReactFlow selection snapshot/debug bridge；`selectedNodeIds` 成为唯一 selection state。
4. 让 G6 runtime 在默认路径始终构建，移除 `experimentalRenderer` 和 renderer query switch；可保留单一 G6 lazy/Suspense 边界以维持 async chunk，但不得存在第二 renderer 分支。
5. 删除 `<ReactFlowProvider>`，确认 App 不再 import `@xyflow/react` runtime。

### Workstream B：重建核心 Canvas 交互（核心完成）

1. **browse/select/focus：**click 选择；再次 click 或明确 toolbar command 进入 focus；pane click 清空；modifier click 打开文档。
2. **multi-select：**优先实现 Shift-click；框选不是下个 release 必需项。replacement 所需批量选择可使用现有 `ConceptMultiSelect`/搜索式 UI，不依赖 Canvas marquee。
3. **connect intent：**采用快速的两步连接模式，不等待复杂 ports/custom behavior：选择 source，进入连接模式，再点击 target。复用现有三种领域规则：concept->concept 创建推导、concept->derivation 追加 tail、derivation->concept 设置 head。
4. **drag/layout：**G6 drag end 只更新当前 runtime positions；全图与 focus neighborhood 通过同一 Worker hybrid layout 计算后 materialize + fit，不写 JSON cache。
5. **replacement：**保留 inspector segment 和选择集合定义流程；不要求节点内 replacement tag。Canvas 上只需能选择 concepts 并选择 replacement target。
6. **parallel derivation：**通过 inspector select 切换 active member；Canvas 不必在本版本复刻 stack badge button。
7. **route：**route panel 保持 React；Canvas click/context intent 设置 start/target，求解结果驱动 G6 materialization/state delta。
8. **authoring/document/history：**保留现有 React inspector、DocumentEditor、workspace I/O 和 document history，renderer 不拥有业务事实。

### Workstream C：删除旧实现（已完成）

1. 删除 `GraphNodes.tsx`、XYFlow projected nodes/edges、handles、controls、minimap 和全部 `.react-flow*` CSS。
2. 从 `package.json` 删除 `@xyflow/react`，清理 lockfile。
3. 删除只服务 XYFlow 的 selection diagnostics/tests；把仍有价值的领域行为测试改写为 G6 workflow tests。
4. 保留 isolated XYFlow benchmark artifact 作为历史数据即可，不要求继续可执行；生产 build 不得包含 XYFlow chunk。

### Workstream D：最小发布验证（已完成）

1. `npm test`、TypeScript production build、Rust fmt/clippy/test。
2. 核心 smoke：打开 bundled workspace、选择/编辑、拖动、创建 concept、创建/修改 derivation、replacement、route solve/highlight、document edit、undo/redo、workspace JSON round-trip。
3. G6 lifecycle：development Strict Mode、production preview、workspace switch、窗口 resize、空图和 1,000-concept fixture均不空白/不崩溃。
4. 记录一次 1,000-concept production-path ready/hover/route/heap 数据；只拦截灾难性回退。
5. 在当前开发机完成一次 Tauri build/smoke。Windows 和正式硬件矩阵延期。

### 下个版本完成定义

- 无 query 参数时直接显示 G6。
- production source、bundle 和 dependencies 中不再存在 XYFlow。
- 上述核心 smoke 可完成；允许高级交互和视觉细节缺失。
- 1,000-concept workspace 可打开、搜索、focus、查看路线，且无持续主线程冻结。
- 已知限制写入 release notes，不建立 runtime fallback。

### 明确延期

- 当前 large-graph force 只实现 whole-hyperedge-safe 的二部 fallback；更完整的 custom hypergraph factor、SCC direction constraint、局部 reheat 与人工布局质量评估延期。
- minimap、hover DOM card、zoom-adaptive label collision perfection。
- marquee/lasso、复杂 ports、节点内 replacement tags/parallel badges。
- 完整 Joyride canvas targets、完整键盘导航和 screen-reader graph traversal。
- Windows WebView2 release matrix、长期 idle CPU、20 次 destroy/reopen leak soak。
- 修复与新核心流程无关的旧 4 个 E2E 红项。

## 11. 长期性能目标（不阻塞下个 demo release）

目标 fixture：1,000 concepts + 1,000 hyperedges + avg 2 tails，即约 2,000 visual nodes + 3,000 visual edges。以下预算保留为产品成熟期目标；下一 demo release 只用它们识别空白、崩溃、持续冻结和数量级回退，不因单项越线恢复 XYFlow或延迟迁移。

| 指标 | 长期目标 |
|---|---:|
| route mode open（无论是否处于 focus） | p95 <= 100 ms，max <= 200 ms |
| hover visual response | p95 <= 50 ms，无 >50 ms long task |
| select/start/target toggle | p95 <= 100 ms |
| pan/zoom | p95 frame <= 20 ms；交互期间无持续 >50 ms long task |
| workspace loaded -> force layout -> first usable graph | <= 3.5 s |
| full auto layout | UI 可交互、主线程无 >50 ms layout task；总时长单独报告 |
| route IPC（默认 200 ms core budget） | p95 <= 300 ms end-to-end |
| idle graph | 无持续 layout/render loop；CPU 回落到基线 |
| memory | 稳态 <= 250 MB；20 次 open/destroy 后无单调增长 >5% |
| initial JS bundle | 报告 gzip delta；超预算必须 code-split 或说明收益，不接受未知增长 |

在确定最低目标设备前，这些值是提议预算；确认设备后冻结，不能为了让实现通过而事后放宽。

## 12. 测试策略

下个 demo release 的即时测试范围以第 10 节 Workstream D 为准。以下是长期完整矩阵，不要求在直接迁移这一轮全部完成：

- **Pure unit tests**：GraphIndex 邻接、projection、parallel groups、replacement、route diff、scene diff、force determinism、command inverse。
- **Contract tests**：同一 AuthoringDocument 经 GraphScene 与 G6 snapshot 后保持 semantic IDs/连接语义；XYFlow 删除后不再维护可执行 adapter contract。
- **G6 lifecycle tests**：Strict Mode mount/unmount、workspace switch、event listener 数、destroy 后 heap、过期 worker result 丢弃。
- **Interaction E2E**：所有现有连接语义、multi-select、replacement、focus、route target context action、document open、undo/redo、minimap、keyboard search。
- **Visual tests**：desktop/mobile、不同 DPR/zoom、长 label、中文/数学文本、tooltip 边界、route highlight；Canvas screenshot 还需做非空像素检查。
- **Performance tests**：固定 fixture 与操作脚本，采集 User Timing、Long Tasks、CDP trace、FPS/frame time、memory；至少 5 次并和 baseline variance 比较。
- **Native tests**：Rust command 的 blocking boundary、route budget、workspace large-file read/revision；macOS 与 Windows release WebView 都跑。

当前测试状态（2026-08-29）：85/85 frontend unit tests、20/20 browser E2E 与 13/13 Rust tests 通过；Cargo fmt/clippy、production/performance typecheck 和 diff checks 通过。新增覆盖 card-aware force non-overlap、typed port geometry/three direct gestures、compound ghost intent、whole-hyperedge hover、dimmed passivity、partial marquee、group drag、element-drag/canvas-pan mutual exclusion、derivation focused-view render-loop prevention、tooltip、form cancel/self-cycle/create/edit/undo、no-position round-trip 与 onboarding passive hint。Element drag regression test 精确要求 selected delta 等于 pointer delta、unselected delta 为零；空白区域 camera pan 仍单独可用。已移除会在 viewport transform 时临时隐藏 edges 的 `OptimizeViewportTransform`，确保 element drag、edge auto-pan、blank-canvas pan 与 zoom 期间 background edges 持续保持原 dimmed opacity；用户手动验证正确。Focused-view selection cleanup 在内容未变化时保留原 state reference，避免 React effect 无限更新；修复前 WebKit WebContent 持续约 90% CPU、约 748 MB footprint并重复报告 `Maximum update depth exceeded`，修复后人工复测无卡死，CPU回落至0–0.4%，RSS约70–76 MB。Desktop/mobile production preview 无 page/console errors、无 horizontal overflow，Canvas pixel checks 非空；macOS `.app`/DMG 和 release process smoke 通过。

## 13. 实验记录模板

| 日期/提交 | 数据与环境 | 假设 | 唯一变量 | Baseline -> Result | 方差 | 正确性 | Verdict |
|---|---|---|---|---|---|---|---|
| 2026-08-28 / worktree | Chromium production preview，1k concepts / 1k hyperedges / 3k projected edges，3 runs | 固化 XYFlow baseline | benchmark harness | 26,166 DOM；heap 109 MB；draw long task 489–524 ms；hover p95 193 ms；route open p95 145 ms | 三次趋势一致 | 2k nodes / 3k edges 数量断言通过 | kept as baseline |
| 2026-08-28 / worktree | 同上，G6 Canvas full scene + all labels | Canvas 直接替换即可达标 | renderer | DOM 21；heap 131–139 MB；初始化约 2 s long task；hover p95 70 ms；route open p95 36 ms | 三次趋势一致 | native circle/diamond/labels/edges | rejected configuration |
| 2026-08-28 / worktree | G6 Canvas POC | 只注册所需 G6 extensions 可消除启动瓶颈 | registration set | G6 chunk 410.81 -> 299.34 kB gzip；约 2 s full-label 初始化不变 | 构建确定 | smoke passed | kept for bundle reduction；startup claim rejected |
| 2026-08-28 / worktree | G6 WebGL 2.1.1，64 concepts | WebGL 提供更多大图余量 | renderer | init long task 1.45 s；hover 589 ms；64-step highlight 17.96 s | 单样本已远超 hard budget | ABI/type compatible，行为结果完成 | reverted / No-Go |
| 2026-08-28 / worktree | G6 Canvas，1k concepts，labels/overview edges/derivations hidden | Progressive LOD 降低 scene cost | visible scene | heap 24.5 MB；1k circles draw 77–86 ms；hover/route/highlight 27–37 ms | 三次趋势一致 | semantic graph 仍为 2k/3k | continue with batching |
| 2026-08-28 / worktree | 上述 LOD + 300 concept batch + route junction/edge batches | 分帧保持功能所需 route scene 且消除 long task | draw scheduling | no >50 ms long task；heap 23.1 MB；hover p95 30.3 ms；route open p95 32.7 ms；64-step route materialization p95 97.5 ms | 三次均过交互预算 | route 加入 64 junction + 192 edges | kept for feature-parity implementation |
| 2026-08-28 / worktree | XYFlow production preview，1k/1k/3k，3 runs | 邻接索引降低 hover 扫描成本 | GraphIndex | hover p95 193 -> 150.5 ms（约 22%）；route open 145 -> 110.5 ms；bundle +0.37 kB gzip | 三次 hover 147–151 ms | 4 个 GraphIndex tests + 原 suite | kept；仍不宣称达标 |
| 2026-08-28 / worktree | schema v0.3 + local layout cache，XYFlow 1k/1k/3k，2 x 3 runs | positions 可移出 canonical/history 且不增加持续交互开销 | state ownership | ready median 2.85–2.87 s；hover runs 139–171 ms；route runs 104–115 ms；bundle 544.42 -> 544.58 kB gzip | 第二组三次回到原方差；无持续回退 | 66 unit、4 position E2E、v0.2 migration round-trip | kept；架构收益，不宣称性能收益 |
| 2026-08-28 / worktree | production GraphScene contract，XYFlow 1k/1k/3k，2 x 3 runs | renderer-neutral topology 可替代 App 内 XYFlow 专用投影构造 | scene boundary | typical route 106–119 ms，1 个 246 ms 系统离群；hover 140–173 ms；ready 2.80–2.97 s；bundle 544.90 kB gzip | 第二组三次 route 106/109/111 ms | 70 unit；关键 scene/route/parallel E2E 通过 | kept；性能中性架构 refactor |
| 2026-08-28 / worktree | GraphSceneRuntime 同时接入 XYFlow，1k/1k/3k，3 runs | 两个 renderer 共用完整 presentation runtime 可保持 XYFlow 性能 | runtime adapter | hover 137–146 -> 281–305 ms；ready/route 基本不变 | 三次均约 2x hover latency | unit/关键 E2E 通过，但性能 gate 失败 | reverted from XYFlow；G6 flag 下保留 runtime |
| 2026-08-28 / worktree | production G6 adapter，small fixture + 301-concept threshold | selective async adapter 可不污染默认入口并执行 production LOD | renderer integration | initial chunk 544.90 -> 546.26 kB gzip；G6 async chunk 301.02 kB；301 concepts 初始 301 nodes/0 edges | build 确定；dev/production E2E 均通过 | nonblank canvas pixel、zoom/fit、Strict Mode、LOD assertions | 当时 kept behind query；现按 demo 指令提升为唯一 renderer |
| 2026-08-28 / worktree | G6 Canvas isolated LOD，1k/1k/3k，3 runs（clean port 4190） | adapter work 未破坏已验证 G6 candidate | candidate regression | heap 23.1 MB；hover p95 30.8 ms；route open p95 18.9 ms；focused route open p95 34.7 ms；64-step materialization p95 98.4 ms；无 long task | 三次趋势一致 | 1k concepts + on-demand 64 junction/192 edges | 技术候选通过；demo 指令取消其余迁移前门禁 |
| 2026-08-28 / worktree | production App G6 direct migration，1k concepts，1 run | isolated candidate 收益可在完整 App 保留且不需要 XYFlow fallback | production renderer | ready 2184.4 ms；route open 91.4 ms；search+focus 180.7 ms；DOM 159；heap 42.1 MB；无 interaction long task；initial 1000 nodes/0 edges -> focus 1003/9 | 单次 release smoke，非趋势样本 | 75 unit；11 E2E；13 Rust；macOS `.app`/DMG 与 process smoke | kept；G6 promoted to sole renderer |
| 2026-08-28 / worktree | Dagre auto layout，1k concepts / 1k cyclic hyperedges，无 cache | compatibility Dagre 可直接承担大图自动布局 | layout algorithm | `RangeError: Maximum call stack size exceeded` in `successors` recursion；无 positions | Node 与 Worker 均稳定复现 | fixture 是合法 cyclic B-hypergraph | 当时 rejected large/retained small；后续 always-force 指令删除 Dagre branch |
| 2026-08-28 / worktree | Worker Dagre + deterministic bipartite force fallback，1k/1k/3k，warm + missing cache，各 1 run | renderer-neutral Worker 可提供 cyclic-safe 自动布局且不阻塞主线程 | layout service + algorithm threshold | missing cache layout ready 2879.5 ms / graph ready 2915.5 ms；warm ready 2182.1 ms；route 79.6 ms；focus 168.6–183.3 ms；heap 31.2–35.1 MB；无 initial/interaction long task | 单次 smoke，非趋势样本 | 2k finite positions；fixed-seed repeat；request cancellation；78 unit/11 E2E | 当时 kept，后由 always-force/no-position-persistence 指令取代 |
| 2026-08-28 / worktree | always-force Worker，1k/1k/3k，无任何坐标 JSON，3 runs | 删除 Dagre 与 layout cache 后仍可稳定加载、交互和迁移 | sole layout algorithm + runtime-only positions | layout ready median 3509.7 ms；graph ready 3533.1 ms；route 96.6 ms；focus 254.2 ms；heap 31.2–39.6 MB；focus materialization long task 90–94 ms | 三次 ready 3.508–3.567 s，趋势一致 | 2k finite deterministic positions；旧 cache 启动删除；v0.2 positions 校验后丢弃；75 unit/11 E2E | rejected as default：可控规模图难以辨认入口；positions runtime-only 决策保留 |
| 2026-08-28 / worktree | hybrid Worker restored，阈值 400；1k/1k/3k，无坐标 JSON，3 runs | 小图 LR Dagre 恢复入口/方向，大图 force 保持 cyclic safety | algorithm selection only | 1k layout ready median 3516.2 ms；graph ready 3541.4 ms；route 63.2 ms；focus 251.6 ms；heap 31.2–39.6 MB；focus long task 87–92 ms | 三次 ready 3.511–3.555 s；与 always-force 大图噪声范围重叠 | sample 小图严格满足 A.x < junction.x < B.x；1k cyclic 2k positions；76 unit/11 E2E | kept；默认可读性优先；initial 467.41 kB gzip + 66.76 kB Worker + 301.26 kB G6 async |
| 2026-08-29 / worktree | card-aware force，1k concepts/1k junctions，unit fixture | 仅增大 circular collision radius 可保证 `136 x 64` cards 不重叠 | radius 34 -> 95，3 collision iterations | 两次 deterministic layout 约 6.8 s，仍有 `p-332/p-622` rectangle overlap | 稳定失败 | finite/deterministic，但 exact bounds contract 失败 | rejected；改用轻 collision + deterministic rectangle separation pass |
| 2026-08-29 / worktree | production cards + all 1k neutral labels，1 run | 常驻 card labels 仍可满足大图 gates | label LOD only | ready 3.72 s；focus 572 ms；heap 60.3 MB；interaction long tasks 138–173 ms | 单次已明显越过多项 gate | Canvas/nonblank/workflows passed | rejected configuration；card silhouettes retained，neutral large-overview labels hidden |
| 2026-08-29 / worktree | large-label LOD + runtime/card/port restore，1 run | active-context labels 可恢复内存/long-task budget | neutral label materialization | ready 3.56 s；route 179.1 ms；focus 404.3 ms；heap 31.2 MB；max focus task 106 ms | 单次方向明确 | cards/active labels/ports and workflows passed | kept LOD direction；继续优化 state draw |
| 2026-08-29 / worktree | state update scheduling experiments，1k，单跑迭代 | 240-state batching / merged datum states / active-first state pass 可降 focus | syncSnapshot scheduling | batching focus 412 ms、merged states 339–399 ms、active-first约390–434 ms；long task最终降至 <=100 ms | focus总时长未达300，单跑有噪声 | 19 E2E 保持通过 | mixed：active-first progressive pass retained for long-task bound；无收益的 search/animation experiments reverted |
| 2026-08-29 / worktree | final card/Bezier/ports/form build，1k/1k/3k，无坐标 JSON，3 runs | 完整 visual/interaction restore 在 production gates 内 | final integrated configuration | layout median 3575.9 ms；graph ready 3599.6 ms；route 162.7 ms；focus 385.9 ms；heap 29.4–31.2 MB；max initial/focus task 97 ms | ready 3.562–3.621 s；focus 373.0–394.2 ms | 2k finite positions、concept non-overlap、85 unit、19 E2E | kept with one residual：focus >300 ms target；ready/heap/long-task/bundle gates pass |

历史性能实验仍按当时规则记录 kept/reverted。自 demo 直接迁移指令生效后，不再因为性能中性或小幅回退撤销必要架构重构；只修复灾难性回退，并在迁移完成后继续优化。

## 14. 已确认执行决策

1. **立即全面迁移 G6 Canvas**，不再等待旧硬门禁，不保留 XYFlow runtime fallback。
2. **自动布局使用 Worker hybrid：**少于 400 个投影节点使用 LR Dagre，达到阈值使用 deterministic bipartite force；完整 custom hypergraph force 继续迭代。
3. whole-step cost 到 ideal distance、parallel group 几何规则留到后续布局迭代；路线 solver 始终是成本权威。
4. 概念使用 Canvas-native `136 x 64` rect card，推导使用 cost-only stacked diamond；大图 neutral labels 渐进隐藏，hover card 和复杂 badge 延后。
5. 下个 demo release 不等待最低目标设备和 Windows matrix；先在当前开发机完成 browser production 与 Tauri smoke。
6. canonical schema v0.3 已移除 positions；replacements 暂留共享 manifest，positions/local pins 只存在于当前运行时内存，不进入任何 JSON。
7. interaction 允许重做，只需保持领域语义与核心工作流；不要求 ReactFlow 行为逐项复刻。
8. 迁移完成后立即删除 `@xyflow/react`、provider、node components、selection store 和相关 CSS/tests。

## 15. XYFlow 视觉与连接语义恢复（设计确认中）

用户指令（2026-08-28）：概念由圆点恢复为 XYFlow 时期的矩形卡片；静态边和拖线恢复为弧线；概念卡左侧红色入口、右侧蓝色出口；推导菱形中央只显示成本；恢复从 port 交互式拉关系线的语义。G6 仍是唯一 renderer，不恢复 XYFlow runtime。

### 15.1 已核实的旧版视觉事实

- 概念卡为 `136 x 64`：`#fafbf9` fill、`#6f7973` border，中央 13px semibold label，下方 9px monospace ID；旧版还可显示 replacement tag。
- 概念左 port `concept-in` 是红色 conclusion target；右 port `concept-out` 是蓝色 premise source。
- 推导为 `54 x 54` 菱形；左 port `premise-in` 为蓝色，右 port `conclusion-out` 为红色。
- premise edge 蓝色 `#2f7087`，conclusion edge 红色 `#a44f3f`，均带箭头；ReactFlow `default` edge 与连接 assist line 都是 cubic Bezier。
- 旧版菱形曾额外显示 premise count、parallel stack 与 alternatives badge；本轮“中央只显示成本”是否保留无文字 stack silhouette 仍待确认。

### 15.2 Release contract：恢复时不得重新引入

来自 GitHub Releases v0.2.1、v0.2.2、v0.3.0 与对应测试：

- 边默认低透明度且 `pointer-events: none`；hover 只增强相关邻域，背景边保持淡化。
- focus/route 中 dimmed nodes 不截获点击、拖动或连接，active nodes 保持正确 z-order 与完整 opacity。
- Shift-click、轻微 pointer movement 与 partial marquee 不得清空已有选择；持久 marquee outline 不得回归。
- card/diamond hover 的 hit area 必须包含 lift 位移，不能在边缘抖动；hover 有 pointer cursor、`-2px` lift 与 shadow。
- 拉线期间禁用原生文本选择；结束/取消后必须恢复。拉线 gesture 与 node drag 必须互斥。
- Ctrl/Cmd-click 打开对象文档；普通 click 选择、连续 click 进入 focus，不恢复与 selection 冲突的 double-click 文档行为。
- parallel derivation 仍共享一个 junction，切换 active member 不得改变领域 ID/路线语义；删除仍走确认框。
- 1,000-concept overview LOD、GraphScene/Runtime 边界、Worker hybrid layout 与 runtime-only positions 均保留。

### 15.3 G6 实现事实与风险

- native `Rect`、ports、`CubicHorizontal` 与 `sourcePort/targetPort` 足以恢复 Canvas-native 卡片、左右锚点和水平 Bezier；不需要 React/HTML nodes。
- native `CreateEdge` 只识别 node-to-node，不提供 port identity，并与 `DragElement` 同时消费 `NodeEvent.DRAG_START`；直接启用会混淆 node drag 与 connection drag。
- 需要 custom port gesture gate：按 pointer 相对节点 bounds 判断是否命中合法 source port；命中时阻止 element drag、绘制 passive Bezier assist edge；只在合法 target port 完成，并把结果交给 App 现有三种领域连接命令。
- 连接完成后不能让 G6 直接持久化普通 edge；GraphScene 仍由 canonical hyperedge 重新投影。
- 卡片/label/ports 增加 Canvas primitive 数；必须分别测量 detail graph 和 1k overview LOD，不能用旧 circle benchmark 冒充结果。

### 15.4 设计树 Round 1（已接受）

用户于 2026-08-28 全部接受推荐项：

- 采用 semantic visual parity：`136 x 64` card、label、ID、typed ports、Bezier、hover/selection；replacement、parallel switching 与 delete 留在 inspector。
- drag-to-connect 为主要手势，保留 toolbar/search 两步连接作为大图、远距离与触控 fallback。
- 精确恢复四个 typed ports 和三种合法正向连接。
- 菱形中央只显示成本；允许最多两层无文字 stack silhouette 表示 parallel derivations。
- >300 concept overview 始终保持 card silhouette，只为 active context 显示完整内容与 ports；禁止退回 circle。
- 恢复 Shift partial marquee，并保留轻微移动、残留框、pointer hit、edge passivity、dimmed interaction、modifier-click、route/replacement/parallel/undo/redo 等全部回归 contract。

### 15.5 设计树 Round 2（已接受，Q11 有修订）

用户于 2026-08-28 接受除 Q11 外的全部推荐项，并将 Q11 改为 source-color assist edge：

- Card 固定 `136 x 64`、旧版 label/ID 单行排版与 ellipsis；diamond 固定 `54 x 54`，仅显示一位小数成本。
- 状态视觉按 old palette 叠层：route fill/border -> selected ring -> hover lift/shadow；dimmed 最终降 opacity 并禁用交互。
- Port visual 9px / hover 13px，使用约 18px transparent hit target。
- **Assist edge 使用 source port 的颜色，而不是旧版 neutral charcoal。** 用户给出的原则是只有同色 ports 才是合法 link，以颜色直接引导。
- 锁定正向 drag、parallel creation、deduplicated premise、undoable conclusion update、invalid/canvas/Escape/blur cancellation，以及 drag 后不触发 click/focus。
- Connection 与 node/group drag 都支持 36px viewport edge auto-pan。
- >300 neutral card 始终显示 label；active context 显示 ID/ports；dimmed 不显示 ports。
- Shift blank-drag 使用 partial-overlap union marquee，4 CSS px threshold，edges excluded，结束后无残留框。
- 拖动 selected node 会批量移动全部 selected/non-dimmed visible nodes，并批量提交 session-only positions。
- Hard performance gates：1k graph-ready median <= 4.1s、focus <= 300ms、heap <= 45MB、交互无新增 >100ms long task、initial gzip delta <=15kB；失败时先调 LOD/batching，不退回 circles/lines。

### 15.6 设计树 Round 3（部分确认）

- Q18 已接受推荐 C：Concept blue -> Concept red 进入合法 target 时显示 temporary ghost diamond，并将 assist preview 分成 `Concept blue -> ghost blue` 和 `ghost red -> Concept red` 两段；drop 后创建真实 derivation。不存在异色 persisted edge。
- Q20 已接受推荐 B：颜色是主要引导，port hover 约 350ms 显示四类 typed-port 短 tooltip；开始连接后立即隐藏。
- Q19 因描述使用内部状态名而未确认。实际待决策项已拆开：路线选择/替换选择/自动布局期间是否允许 port drag；toolbar 两步连接与 direct port drag 同时出现时如何仲裁。

### 15.7 设计树 Round 3 clarification（已接受）

- Route selection、replacement target selection 与 automatic layout running 时，ports 保持可见以表达语义，但禁用 drag/hover expansion。普通 authoring 与 focus neighborhood 中未 dimmed 的 nodes 可拖线。
- Toolbar 两步 connection draft 存在时，如果用户开始 direct port drag，则取消旧 draft，以当前 direct gesture 为准。
- Concept-to-concept compound preview 使用半透明 `54 x 54` ghost diamond，中央显示默认成本 `1.0`，并显示半透明 blue/red Bezier segments。
- 本轮不增加 onboarding 步骤；保留并修复现有“把概念蓝 port 拖到推导蓝 port 追加前提”步骤。Concept compound creation 由 tooltip 与独立 E2E 覆盖。

### 15.8 设计树 Round 4（已接受）

- >300 overview 保持 derivation LOD；direct drag 只支持 visible targets。编辑 hidden derivation 先进入 focus，或使用 inspector / toolbar-search fallback，不在 drag start 瞬间 materialize 全图。
- Large force settled layout 中 `136 x 64` cards 不得重叠，目标最小 gap 约 12px；扩大 link distances/canvas，不缩小 card。
- Forward edges 使用 ordinary horizontal cubic；backward/cyclic edges 使用 outward cubic loop，仍连接同一 typed ports 并保留颜色/箭头。
- Active marquee 使用 1px `#1f5c48` stroke 与约 8% green fill；pointer up/Escape/blur 后 shape 必须完全移除。
- Topology/weight edits 完成 Worker relayout 后保持 current zoom/viewport；仅 initial workspace load 与 explicit toolbar relayout 自动 fit whole graph。

### 15.9 新发现的历史回归：dimmed background 仍可交互（必须修复）

用户在当前未提交 G6 build 中实际复现：背景淡化的节点和超边仍然能被交互。根因已从当前源码确认：

- `GraphSceneRuntime` 正确计算 `dimmed`，snapshot 也正确附加 `dimmed` state，但 G6 node state 目前只设置 `opacity: 0.16`，没有 pointer/behavior eligibility。
- G6 event callbacks 当前不检查 runtime dimmed state；dimmed nodes 仍能触发 hover、click、Ctrl/Cmd document open、context route target、drag。
- `DragElement` 当前没有 `enable` predicate，所有 materialized nodes 都可进入 drag。
- Static edge style 当前没有显式 `pointerEvents: 'none'`；即使没有 edge click callback，edge hit testing 仍可能阻挡 canvas pan/click/marquee。
- 新增 port gesture 与 brush selector 如果只依赖 G6 visibility，也会错误地把 dimmed nodes 当作 source/target 或 marquee result。

修复 contract：

- 所有 persisted/static/assist edges 都是 passive graphics，显式 `pointerEvents: 'none'`；edge 永不进入 selected/hovered/focused input path。
- Dimmed nodes/derivation junctions 不响应 hover、click、modifier-click、context menu、drag、connection source/target、drop、marquee 或 auto-pan initiation。
- Dimmed nodes 不显示 active ports；已有 selected visual 可以保留为历史状态，但不能通过 pointer 改变或移动。
- G6 shape style 负责第一层 hit-test passivity；event callbacks、DragElement enable predicate、connection behavior 与 custom partial brush selector各自做第二层 runtime eligibility guard，避免只靠视觉 style。
- Focus/route active nodes 保持正确 z-order、opacity 与完整交互；background edge 在 active node hover 时仍保持 dimmed，不因邻域 hover 被错误提亮。
- 增加 E2E：dimmed concept/derivation 无法 click/focus/open/drag/connect/marquee；所有 static edges 不阻挡 pane click/pan；active neighbor 仍可执行同一组操作。

### 15.10 设计树 Round 5（已接受）

- 进入 focus/route 后自动从 Canvas selection 移除所有 dimmed nodes，只保留 active set 内选择；退出时不恢复旧 selection。
- Dimmed shape area 等同 blank canvas：click 可退出 focus/清 selection，normal drag pan，Shift-drag 可开始 marquee；dimmed object 本身永不被 marquee 选中或接收事件。
- State precedence 固定 `route result > focus neighborhood > overview hover`。Focus/route 中 hover 只给当前 active object 增加 lift/shadow，不扩大 active set，不提亮 background nodes/edges。

### 15.11 设计树 Round 6（已接受）

- Overview hover 一个 concept 或 derivation junction 时，强调相关 whole hyperedge：所有 premise segments、junction 与 conclusion segment 一起提亮；neighbor concept cards 不获得 selected ring。
- Stacked junction port edit 只修改 inspector 当前 active derivation member。端点改变导致 group key 改变时，该 member 在 relayout 后自然拆成独立 diamond；undo 恢复。
- Replacement card cue 保留旧 depth semantics：depth 1 为绿色左边线 `#3d725c`，更深层为红褐左边线 `#9a5647`；无 card button/text，legend swatch 同步，切换仍在 inspector。

### 15.12 Shared-understanding contract（设计树已清空，待用户最终确认实施）

Renderer 与数据边界：

- G6 Canvas 仍是唯一 production renderer；不恢复 XYFlow、DOM nodes 或 fallback。
- GraphIndex/GraphScene/GraphSceneRuntime/LayoutService boundaries、Worker cancellation、hybrid Dagre/force threshold 400、schema v0.3 与 runtime-only positions 全部保留。
- Canonical authoring mutation 仍只由 App commands/history 执行；G6 behaviors 只报告 typed intent，不直接持久化 graph edges。

Visual contract：

- Concept `136 x 64` rect card：旧 fill/border、2px radius、single-line label + monospace ID ellipsis、left replacement depth cue、red left input、blue right output。
- Derivation `54 x 54` diamond：中央只有 one-decimal cost；parallel members 用最多两层无文字 silhouette。
- Premise blue、conclusion red；forward edges 使用 horizontal cubic，backward/cyclic edges 使用 outward cubic loops；static arrows retained。
- Route/selection/hover/dimmed states 按已确认 precedence 叠层；hover lift/shadow 的 hit bounds 不抖动。

Interaction contract：

- Body drag node(s)，约 18px port hit target drag connections；二者互斥。Port visual 9px、hover 13px，并有 350ms semantic tooltip。
- Same-color direct gestures：Concept blue -> Derivation blue 添加 active member premise；Derivation red -> Concept red 更新 active member conclusion。
- Concept blue -> Concept red 使用 temporary `1.0` ghost derivation 与 blue/red two-segment preview，drop 后创建 parallel-capable canonical derivation。
- Source-colored assist previews、legal target halo、invalid/duplicate/no-op statuses、Escape/canvas/blur cancel、edge auto-pan 与 click suppression 全部实现。
- Toolbar/search 两步 connection 已被后续决策替代并完整删除；toolbar 原连接按钮改为 new-derivation form。Route/replacement/layout-running 时 ports visible but disabled；focus active nodes可连接。
- Shift partial-overlap union marquee、4px threshold、green transient rect、no persistent outline；Shift-click toggle 保留。
- Drag selected node moves all selected/non-dimmed visible nodes and batch-updates session-only positions。

Passivity 与 highlight contract：

- 所有 static/assist edges `pointerEvents: none`。
- Dimmed nodes/junctions 不接收 hover/click/document/context/drag/connect/drop/marquee；其区域按 blank canvas 处理。
- 进入 focus/route 时移除 dimmed selection；hover 不能突破 route/focus active set。
- Overview hover 强调整个 incident hyperedge，而不是把 whole cost 错拆到某一 premise link。

LOD/layout/viewport contract：

- <=300 concepts 显示完整 cards/diamonds/labels/IDs/ports；>300 保持 neutral card silhouettes，labels/IDs/ports 只在 active context；hidden derivations 不为 drag 临时全量 materialize。常驻 1k neutral labels 因 heap 60.3 MB、focus 572 ms 与 138–173 ms long tasks 被实测否决。
- Large deterministic force 使用 card-aware non-overlap spacing，目标 gap 约 12px；不缩小或退回 circle。
- Workspace open/reload automatic layout；structural/projection changes 约 120ms debounce；weight 约 400ms quiet/blur/Enter；label/document/selection/route/viewport/manual drag 不触发布局。
- Manual drag 只保留到下一次 full layout/workspace load；不持久化、不 pin。Cold load 没有 geometry 时显示 loading；edit relayout 保留上一 geometry。
- Topology/weight edits 异步 relayout 但保持 viewport；initial load 与 explicit auto-layout 才 fit whole graph。

Validation/release gates：

- Unit test typed port eligibility、compound preview geometry、partial marquee、runtime eligibility、edge routing、card-aware force determinism/non-overlap 与 snapshot LOD。
- G6 E2E 覆盖三种 direct connections、parallel split、cancel/no-op、node-vs-port drag、multi-drag、marquee、dimmed passivity、whole-edge hover、modifier document/focus/route/replacement/history、toolbar create/edit derivation forms、tour premise drag/passive form hint 与 workspace no-position round-trip。
- Desktop/mobile screenshots 和 Canvas pixel/nonblank checks；production build/typecheck/Rust checks/Tauri smoke。
- 1k hard gates：graph-ready median <=4.1s、focus <=300ms、heap <=45MB、no new >100ms interaction task、initial gzip delta <=15kB。超标先调整 LOD/batching，不退回 card/Bezier/ports。
- README、RELEASE_NOTES 与 PLAN 保留 before/after/rejected evidence；只有用户最终确认整项迁移完成后才删除 PLAN。

实施顺序：

1. 扩展 renderer-neutral snapshot/runtime eligibility 与 pure geometry/gesture helpers，并先加 unit tests。
2. 注册 Canvas-native custom concept/derivation nodes、typed ports 与 cubic edge；加入 passivity/state styles。
3. 接入 custom connection、partial brush、drag arbitration/auto-pan 和 batch position callbacks。
4. 抽取 shared canonical derivation command，加入 reusable multi/single concept selectors、toolbar create form 与 endpoint edit draft。
5. 接回 App mode gates、selection reconciliation、debounced/view-preserving relayout 与 cold-load geometry gate。
6. 校准 large force card collision，执行 E2E/screenshots/benchmarks，按 gates 调整 LOD。
7. 更新文档与 macOS demo artifacts；不创建 git commit，除非用户另行要求。

**原 frontier 曾清空并获实施确认，但用户在生产代码修改前暂停，重新打开 layout persistence/trigger 分支；继续等待该分支 shared understanding。**

### 15.13 Reopened branch：无持久坐标与 automatic layout（grill 进行中）

已确认事实：

- Canonical schema `derivon.authoring/v0.3.0` 没有 `view.positions`。
- 没有 `layoutCache` production module 或独立 layout JSON；startup 删除 obsolete `derivon.layout-cache/v0.1.0`。
- `layoutPositions` 和 `focusLayouts` 只存在于 React memory；当前 `persistNodePositions` 名称虽然含 persist，实际只写 session state，不 dispatch canonical history，不触发 workspace XY write。
- Workspace/browser autosave 只序列化 canonical manifest/files；manual drag 不写 workspace/localStorage positions。
- Workspace open/reload 必须运行 Worker layout；同一算法/seed 下 deterministic，但 layout implementation/version 改变后允许得到新 geometry。

始终自动布局的实际风险：

- 1k cold layout 当前约 3.5s，虽不阻塞主线程，但没有 persisted geometry 可立即展示。
- Full topology/weight identity 变化会 cancel stale Worker request 并重算；连续 number input 可能反复发起/cancel layout。
- Whole-graph result 会移动与编辑无关的 nodes；即使 viewport transform 保留，视觉上下文仍可能变化。
- Manual session drag 目前会在下一次 topology/weight relayout 时被覆盖；reload 也必然丢失。
- 若把 manual nodes 当作 pinned constraints 重放，虽仍不持久化，但可能与 non-overlap automatic layout 冲突并造成 edge/card overlap。

不再考虑把 XY 写入 workspace、localStorage、sidecar JSON 或其他 artifact，除非用户明确推翻当前期望。

Layout reopened branch 已于 2026-08-28 接受推荐方案：

- Workspace open/reload 必须自动布局；structural/replacement projection changes 在约 120ms quiet period 后布局；weight 在约 400ms quiet period 或 blur/Enter 后布局；label/document/selection/route/viewport/manual drag 不触发布局；explicit auto-layout 立即重算并 fit。
- Manual drag 保持到下一次 full automatic layout、explicit relayout 或 workspace open/reload；不作为 pinned constraints。Focus-local drag 在退出 focus 时失效。
- Cold load 无旧 geometry 时显示 layout loading，不把 nodes 堆在 `(0,0)`；edit relayout 期间保留上一份 valid geometry，新节点用 temporary runtime position，Worker result 到达后替换；stale request 仍由 request ID 拒绝。

### 15.14 Reopened branch：右侧非图形化 derivation authoring（grill 进行中）

用户新增要求：自动布局会让距离较远的 points 不适合 port drag，因此 normal inspector 必须提供非图形化创建推导，以及编辑推导 premises/conclusion 的功能。

已锁定要求：

- Premises 使用与 route calculation 相同的 Fuse search + checkbox multi-select + selected list/remove 交互。
- Conclusion 使用单选 Fuse search + selected result/remove 交互，不得使用原生 `<select>` list。
- 现有 derivation inspector 的“添加前提”和“推导结论”两个 `<select>` 必须移除。
- 新建推导仍生成 unique `h-*` ID、default weight、独立 document directory/Markdown/HTML files，并通过 canonical history/workspace save；只是不通过 canvas gesture。
- Form selection 本身是 draft，不应每次勾选都触发 canonical autosave/full layout；最终 submit 一次 commit、一次 relayout。
- Onboarding 在合适位置新增一个无需操作的提示步骤，正文只需“当然，你也可以在这里创建推导”，用户可直接下一步。
- 该功能不改变 no-position-persistence contract。

已核实源码事实：

- `ConceptMultiSelect` 已实现 route 所需交互，可泛化 tone/style 并复用。
- `ConceptSearch` 支持单选键盘导航，但目前绑定全局搜索语义；需要独立 reusable single selector，避免提交后触发 reveal/focus。
- 当前 inspector 根据 selected concept / selected derivation / workspace overview 三选一；route mode 使用独立 `RoutePanel`。
- 当前 `connectNodes` 已包含 canonical derivation/file creation，可抽取为 shared command，避免 form 和 canvas 复制 ID/document/history 逻辑。

Round 1 用户修订：

- 不在任何 inspector context 内新增入口。
- 顶部 toolbar 中，“新建概念”右侧现有的“连接所选节点”按钮被“新建推导”替换。点击后右侧进入 dedicated create form。
- Create form 初始 premises/head 都为空，不根据当前 selection 预填；用户通过搜索 selectors 从零构建。
- 这项修改会移除原 toolbar/search 两步 connection mode；direct typed-port drag 仍保留。是否完整删除 `connectionSourceId` fallback 需最终确认，因为它推翻了 Round 1 的“两步连接保留”决定。
- Q40 已接受：existing derivation endpoint edit 使用 explicit Save/Cancel draft，一次 commit/undo/layout；form 打开时 Canvas 只允许 pan/zoom。
- Q41 已接受：conclusion 使用 Fuse single-search + one red selected-result row/remove，不使用 `<select>`。
- Q42 tutorial placement 重新打开，不采用“追加前提之后”的原建议。

Schema 事实与歧义：

- Draft 可以同时没有 tails/head，不触发 canonical save/layout。
- Canonical `Hyperedge.head` 当前是 required string，且 validator/solver/projection 要求它引用 existing point；`tails` 可以为空。
- 若“头尾都为空”只指 form 初始状态，则无需 schema change，submit 在选择 conclusion 前 disabled。
- 若要求点击 toolbar 后立即创建 head 为空的 canonical derivation，则必须设计 incomplete object/schema v0.4、solver exclusion、projection/layout/round-trip/migration；这不是当前模型可直接表达的普通 UI 改动。

Round 2 用户全部接受推荐方案：

- Empty head/tails 只存在于 create draft；premises 可保持 empty，conclusion required。选择 conclusion 并 submit 后才生成 canonical hyperedge/files/history。
- 完整删除 `connectionSourceId`、toolbar/search 两步 connection 和相关 status/state；远距离 create/edit 全部由 right form 覆盖，Canvas 保留 typed-port direct drag。
- Tutorial passive hint 放在 graph-model 的“蓝线连接前提，红线指向结论”之后，target toolbar new-derivation button，description 严格为“当然，你也可以在这里创建推导”，无 requires。

Round 3 用户全部接受推荐方案：

- Form selectors 搜索 all canonical concepts；replacement/focus hidden items 仍可选，并标记“当前视图未显示”。
- 允许同一 concept 同时属于 tails/head，支持 self-dependent/cyclic hyperedge；不额外确认。
- 打开 create form 会关闭 route、取消 replacement，但保留 selection/focus/viewport；form mode 中 Canvas 只允许 pan/zoom。Layout running 不阻止 draft，submit 后 stale Worker 自动取消。
- Form mode 只提供 submit/save 与 Cancel；Cancel/Escape 直接丢弃 dirty draft，不弹二次 confirmation，不保存 incomplete object。
- Auto-generated `h-*` ID、document directory/Markdown/HTML；default editable weight 1.0。Create 后选中新 derivation（parallel 时成为 active stack member）；edit 后保持原 selection；退出 focus、保留 viewport、不 auto-fit；每次 submit 是单个 undoable canonical transaction。

**Non-graphical derivation authoring frontier 已清空并完成实施。Toolbar form、search selectors、single canonical transaction、self-cycle、Escape cancel 与 onboarding hint 已由 E2E 验证。**

## 16. 主要资料

- XYFlow issue #3044（维护者说明 DOM-based React Flow 不适合 thousands of nodes）：https://github.com/xyflow/xyflow/issues/3044
- G6 repository / current package：https://github.com/antvis/G6
- Renderer（Canvas default、SVG/WebGL）：https://g6.antv.antgroup.com/en/manual/further-reading/renderer
- 500+ element viewport optimization：https://g6.antv.antgroup.com/en/manual/behavior/optimize-viewport-transform
- Layout / Worker / WASM / GPU：https://g6.antv.antgroup.com/en/manual/layout/overview
- D3 Force（`link.distance` 支持按 edge 回调）：https://g6.antv.antgroup.com/en/manual/layout/d3-force-layout
- Custom Layout（`BaseLayout` iterative/non-iterative）：https://g6.antv.antgroup.com/en/manual/layout/custom-layout
- Common Layout Options（Worker/iterations/animation）：https://g6.antv.antgroup.com/en/manual/layout/base-layout
- AntV Dagre baseline：https://g6.antv.antgroup.com/en/manual/layout/antv-dagre-layout
- Data incremental APIs：https://g6.antv.antgroup.com/en/api/data
- Native node shapes and ports：https://g6.antv.antgroup.com/en/manual/element/node/base-node
- Tooltip：https://g6.antv.antgroup.com/en/manual/plugin/tooltip
- Minimap（并注明不兼容 React nodes）：https://g6.antv.antgroup.com/en/manual/plugin/minimap
- Auto-adapt label：https://g6.antv.antgroup.com/en/manual/behavior/auto-adapt-label
- G6 v5 open performance issues：https://github.com/antvis/G6/issues/7534 、https://github.com/antvis/G6/issues/7402 、https://github.com/antvis/G6/issues/7574
- Tauri commands / async guidance：https://v2.tauri.app/develop/calling-rust/

## 17. Replacement compare、教程重排与 G6 state repair（2026-08-29）

用户确认的新设计树记录于 `NEW_PLAN.md`，Q1-Q66 已清空。实施结果：

- Canonical replacement schema 仍是 `show: points | replacement`；新增 `对照` 只保存 target ID 于 session React state，不进入 JSON、history、autosave、route solver 或 weight model。Workspace open/reload 清空；valid relation 可跨 unrelated undo/redo 保留。
- Projection/GraphScene/Runtime/Snapshot 增加 renderer-neutral member/aggregate roles 与独立 replacement assists；assist 不属于 `SceneEdge`。G6 每条 relation 绘制一个 passive 灰绿虚线箭头：直接成员从卡片边界汇入 collector，唯一主干箭头终止于替换概念卡片边界。
- Concept card 右上角 permanent marker 区分替换成员与带数量的替换结果；hover/primary selection 只挂载一个 HTML overlay，提供 `原概念 / 替换概念 / 对照` 三态键盘控件。Pan/zoom/drag 会关闭 popover 并重算 anchor。
- Replacement 已完全退出布局输入。切换三态不改变 canonical graph-space positions、viewport 或 Worker request count；`DetachedLayoutCluster`、`applyDetachedClusters`、Worker/service cluster payload 及专用测试已删除。先前 aggregate-above、六列换行、nested rigid cluster 方案作为已测量后撤回的实验保留在计划历史中，避免重新引入。
- Graph-model tutorial 从 21 步改为 25 步。用户先拖拽创建 `单射 -> 可逆线性映射`，再追加 `满射`，亲手建立 `线性映射 -> 满射` parallel member、切换 `surjective-def`，最后只给 active `null-space-def` 追加 `子空间`。五个 idempotent stages 负责断点恢复，正常进程保留 user-generated ID。
- 关联视图 opacity 回归基线：React snapshot 已清空 dimmed，但 Canvas 在等待 4 s/fit 后仍残留 0.16/0.08 opacity。`setElementState` 后额外 `graph.draw()` 实测无效并撤回；保留方案把最终 opacity/z-index 写入 complete snapshot/base style，并用 `getElementRenderStyle()` E2E 锁定真实渲染。

验证：95 unit、25 browser E2E（release 串行全跑）、13 Rust、app/performance typecheck、production build、Cargo fmt/clippy 与 desktop/mobile production screenshots 通过。1k production 单跑 ready 2901 ms、route 130.7 ms、focus 249.5 ms、heap 42.1 MB、max long task 55 ms。最新 replacement fixture：ready 2893.3 ms、四次 materialization 58.2/61.5/65.4/69.8 ms、stable heap 35.1 MB、无 interaction long task，并逐次断言零新增 Worker request 与 viewport 不变。旧 cluster fixture 的 Worker settle 约 1.03 s、heap 37.3 MB 是撤回方案的历史测量，不再是当前架构。Bundle 为 initial 471.04 kB gzip、Worker 67.51 kB、async G6 308.34 kB gzip，增量均低于 15 kB。

首次显式 replacement benchmark 因 locator 错误在测量前超时；第二次因 fixture 缺少对象 files 被 workspace validation 拒绝。两者不作为性能结论，失败原因保留以避免重复。macOS `.app`/DMG 已重建；最终 renderer-only assist artifact 的 PID 差集 smoke 在 10 秒时 host 约 0.4% CPU/92.4 MB RSS，WebContent 约 0% CPU/91.1 MB RSS，stderr 为空。该结果只证明 actual WebKit startup/process stability；Playwright WebKit 缺失，因此 compare/focus/route 手势仍保留为人工 acceptance。

## 18. 教程结束时的 G6 拓扑同步竞态（2026-08-29）

实机完成图模型教程后，恢复原工作区会在短时间内整批替换 nodes/edges。旧 adapter 只以 React previous snapshot 计算删除集，但 G6 `removeNodeData()` 会级联删除 incident edges；后续再次删除同一 edge 时，G6 v5.1.1 把 `undefined` 传入 `pushChange()`，触发 `Cannot destructure property 'data' from null or undefined value`。同时，已排队的 pointer move 仍可能持有刚删除的 `invertible` target，随后由 `getElementPosition()` 抛出 `Unknown element type`。

修复将增量计划的拓扑事实来源改为 G6 live model：已级联删除的 edge 不再重复删除；同 ID edge 更换 endpoint 时先删除、在新 node 加入后重建；重建元素重新应用 state。Node pointer、drag、connection 与初始化采样在查询位置前统一检查 live node，连接源在拓扑替换中消失时主动取消手势。新增 pure sync-plan tests 覆盖 cascade delete 与 stable-ID endpoint replacement；新增最后一步教程 E2E 在恢复期间持续移动 pointer，连续 5 次及全量串行运行均无 page error 或工作区错误弹窗。Production preview 同流程无 console/page error。修复后 `.app`/DMG 已重建；20 秒 actual WebKit smoke stderr 为空，host 约 2.8% CPU/98.4 MB RSS，WebContent 约 3.2% CPU/90.3 MB RSS。当前 DMG SHA-256 为 `c73b7afa031f48f2c4db663888e638a418f12a834bddd4d084d5ebbf11472333`。

## 19. Tauri dev 原生右键菜单覆盖路线目标操作（2026-08-29）

G6 `NodeEvent.CONTEXT_MENU` 业务桥接仍会在 route mode 调用 `toggleTargetPoint()`，但Canvas DOM边界未取消浏览器默认`contextmenu`，因此Tauri development WebView同时弹出 Reload / Inspect Element。修复在`.g6-graph-canvas`的capture阶段仅调用`preventDefault()`，不`stopPropagation()`，从而保留G6右键选择目标和 Ctrl/Cmd-right-click 打开文档语义，同时阻止WebView原生菜单。新增真实右键E2E锁定`D`目标的加入/移除，并断言cancelable DOM event已被取消；定向连续5次与全量25项串行E2E通过。

## 20. Manifest 时间戳移除（Issue #23，2026-08-29）

`document.updatedAt`是文件写入副作用，不是共享图语义；每次commit自动更新会制造timestamp-only Git diff，并使撤回后的manifest仍出现无意义变化。v0.3 `AuthoringDocument.document`现只接受`title`和`description`，history reducer不再生成时间戳，当前schema将额外时间字段报告为非语义元数据。v0.1/v0.2导入显式重建metadata并丢弃旧`updatedAt`，与positions迁移一样不带入新manifest。Examples、Rust fixture、browser/performance fixtures、README、workspace Agent skill和standalone validator同步更新。Unit覆盖当前schema拒绝和两代迁移剥离；workspace round-trip、25 E2E、13 Rust与validator通过。

本次schema清理后的单跑性能复验：production graph ready 4347.2 ms、route 128.4 ms、focus 251.9 ms、heap 39.6 MB、max long task 59 ms；replacement ready 3896.6 ms、四次materialization 55.9–77.5 ms、heap 35.1 MB、无interaction long task。Cold ready较既有单跑波动更高，因此不替换前文保留的多跑基线；route/focus/materialization仍在既有交互范围内。
