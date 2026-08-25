# Mindmap Demo

Derivon 加权有向 B-超图的前端录入实验。React Flow 只负责画布交互；领域文档、`replace with` 规则和可见性投影分别位于 `src/domain.ts`、`src/replacements.ts` 与 `src/projection.ts`。

示例只包含五个概念点 A、B、C、D、X。源图中五个点始终同时存在，替换关系是 `{A,B} → X`；C、D 位于关系之外，因此 X 在替换视图中仍然只是完整图的一部分。

## 运行

```bash
npm install
npm run dev
```

构建与测试：

```bash
npm run build
npm test
npm run test:e2e
```

## 图编辑

- 工具栏 `+` 新建概念；右侧检查器编辑概念定义和推导载荷。
- 从概念拖到概念会创建单前提推导。
- 从概念拖到已有推导会追加前提；从推导拖到概念会修改结论。
- 推导是带稳定 ID 的 indexed family。结构相同的平行推导不会自动合并。
- 空前提合法；`weight` 是应用层提供的非负安全整数。
- 第一次点击节点选中它；再次点击同一节点进入一跳邻域的临时布局。
- 总览位置写入 `view.positions`；局部布局只存在于当前浏览器会话。

## Replace With

建立替换关系：

1. 用框选或按住 `Shift` 选择一个或多个概念点，例如 A、B。
2. 点击工具栏的 `Replace with` 图标。
3. 点击已经存在的概念点 X。

该操作不会创建父概念、模块节点、容器、端口、超边或权重。它只在 `view.replacements` 中增加一条视图关系：

```text
A + B → X
```

关系建立后，可通过节点底部标签或检查器中的分段控制切换显示侧。

本示例显示点集时：

- 显示 A、B、C、D；
- 隐藏 X；
- 使用 `C → A → B → D` 的详细路径；
- 保留共同的 `C → D` 备选推导。

显示替换点时：

- 隐藏 A、B；
- 显示 C、D 和原有的同一个 X；
- 使用 `C → X → D` 的替换路径；
- 仍保留共同的 `C → D` 备选推导。

如果用户没有为 X 创建推导，X 也可以合法地保持悬空。切换不会改写任何超边；前端不会把原来连接 A、B 的边自动重定向到 X。

解除替换关系也不会删除任何概念或推导。

## 投影语义

设源图为 `G = (P, H)`，替换关系为：

```text
R = ({A, B}, X)
```

点集视图使用：

```text
P_points = P \ {X}
```

替换点视图使用：

```text
P_replacement = P \ {A, B}
```

其中上面的 `\` 表示集合差。当前投影的超边是可见点诱导出的子图：

```text
H_view = { h ∈ H | T(h) ∪ {head(h)} ⊆ P_view }
```

因此 `replace with` 不承诺两侧具有相同可达性或最低成本。两侧是用户维护的不同粒度表达，不是 Rust 证明等价的商图。

替换关系可以逐层组合。例如 `{A,B} → C` 与 `{C,D} → X` 可以同时存在。每一层仍然只是可见性选择，不产生额外图对象。

## JSON Schema

```json
{
  "schema": "derivon.authoring/v3",
  "document": {
    "title": "A + B → X",
    "description": "视图替换示例",
    "updatedAt": "2026-08-24T20:00:00.000Z"
  },
  "graph": {
    "concepts": [
      { "id": "A", "label": "A", "definition": "点 A。" },
      { "id": "B", "label": "B", "definition": "点 B。" },
      { "id": "C", "label": "C", "definition": "点 C。" },
      { "id": "D", "label": "D", "definition": "点 D。" },
      { "id": "X", "label": "X", "definition": "现有替换点。" }
    ],
    "derivations": [
      {
        "id": "h-1",
        "premises": ["A", "B"],
        "conclusion": "C",
        "introduction": "",
        "reasoning": "",
        "weight": 1
      }
    ]
  },
  "view": {
    "positions": {
      "A": { "x": 0, "y": 0 },
      "B": { "x": 0, "y": 100 },
      "h-1": { "x": 220, "y": 50 },
      "C": { "x": 400, "y": 50 },
      "D": { "x": 400, "y": 160 },
      "X": { "x": 650, "y": 80 }
    },
    "replacements": [
      {
        "points": ["A", "B"],
        "replaceWith": "X",
        "show": "points"
      }
    ]
  }
}
```

`show` 只接受：

- `points`：显示点集一侧；
- `replacement`：显示替换点一侧。

v1 的 `view.modules` 和 v2 的顶层 `modules` 会在导入时迁移成 v3 的 `view.replacements`。

## 分层边界

`graph` 是提交给 Derivon 核心的语义数据，包含概念点和原始超边。

`view` 是前端作者视图：

- `positions` 保存源图节点位置；
- `replacements` 保存显示哪一侧；
- React Flow 节点、普通投影边、选择状态和局部布局都不持久化。

前端只做保证投影确定性的廉价检查：

- 点集非空；
- 所有 ID 存在；
- 替换点不在自己的点集中；
- 一个点不直接属于两个替换点集；
- 替换关系不形成循环。

Rust 核心不读取 `view.replacements`，也不为替换生成超边或权重。应用需要求解当前视图时，应先在前端或应用协议层生成当前可见点的诱导子图，再把普通的 `graph` 数据交给 Rust。Rust 继续只消费应用层给定的点、超边和权重。
