# Mindmap Demo

面向知识作者的加权有向 B-超图录入实验。前端使用 React Flow；Demo 不依赖现有 Rust crate，JSON 可在未来作为 Rust 协议层的输入边界。

## 运行

```bash
npm install
npm run dev
```

默认地址为 Vite 输出的本地地址。生产构建与测试：

```bash
npm run build
npm test
npm run test:e2e
```

## 录入方式

- 工具栏 `+` 新建概念；选中概念或推导后在右侧检查器编辑载荷。
- 从一个概念拖到另一个概念，创建单前提推导。
- 从概念拖到已有菱形推导节点，向前提集合追加概念。
- 从菱形推导节点拖到概念，修改单一结论。
- 菱形中的主数字是成本，右下数字是前提数量；空前提推导合法。
- 第一次点击概念或推导只会选中节点并打开检查器；再次点击同一个节点，才会为其一跳超边邻域创建紧凑的临时布局并适配视口。
- 在局部视图中第一次点击其他节点只会改变选中项并保留当前视图；再次点击该节点才切换到它自己的局部视图。点击空白处返回未选中的总览。
- 局部邻域使用紧凑布局和完整透明度；进入视图的节点固定在其总览坐标，只把所需邻域节点移动到它周围。邻域外节点与边保留在总览坐标中并以低透明度显示，不会完全消失。
- 局部布局和总览布局都可继续拖动。局部拖动只修改该临时视图，关闭局部视图后总览坐标保持不变。
- 工具栏的布局按钮重排总览并退出局部视图；MiniMap、缩放用于浏览大型图。
- 拖动中的高频位置由 React Flow 管理，只有松开指针时才写回 `view.positions`，避免每帧重建领域文档。
- 文件按钮用于导入、导出 JSON；浏览器同时自动保存到 localStorage。

## 文档格式

```json
{
  "schema": "derivon.authoring/v1",
  "document": {
    "title": "示例",
    "description": "作者侧文档",
    "updatedAt": "2026-08-24T00:00:00.000Z"
  },
  "graph": {
    "concepts": [
      { "id": "a", "label": "A", "definition": "不依赖具体推导的客观定义" },
      { "id": "b", "label": "B", "definition": "另一个概念" },
      { "id": "c", "label": "C", "definition": "结论概念" }
    ],
    "derivations": [
      {
        "id": "h-1",
        "premises": ["a", "b"],
        "conclusion": "c",
        "introduction": "问题引入",
        "reasoning": "推导过程",
        "weight": 1
      }
    ]
  },
  "view": {
    "positions": {
      "a": { "x": 0, "y": 0 },
      "b": { "x": 0, "y": 100 },
      "c": { "x": 400, "y": 50 },
      "h-1": { "x": 220, "y": 50 }
    }
  }
}
```

设计约束：

- `graph` 是语义真相，`view.positions` 只保存作者的总览布局。
- 按概念创建的紧凑局部布局属于临时 UI 视图，不改变 `graph`，也不会覆盖总览布局。
- React Flow 普通边是从 `premises -> derivation -> conclusion` 即时展开的视图，不持久化。
- 概念 ID 与推导 ID 在文档内全局唯一，适合直接映射为 React Flow 节点 ID。
- 推导是带稳定身份的 indexed family；即使前提、结论和权重相同，也不会自动合并。
- `premises` 按集合校验，不允许重复；空数组表示无条件入口。
- `weight` 使用非负安全整数，避免浮点排序和累加的不确定性。单位由应用层决定。

## React Flow 实现依据

- 节点交互状态采用官方 [`useNodesState`](https://reactflow.dev/api-reference/hooks/use-nodes-state) 模式。
- 总览和局部排布沿用官方 [Dagre layout example](https://reactflow.dev/examples/layout/dagre) 的静态布局方式：只在用户请求或进入局部视图时计算一次，之后节点仍可自由拖动。
- 拖动结束后的持久化时机参考官方 [Node Collisions example](https://reactflow.dev/examples/layout/node-collisions) 对 `onNodeDragStop` 的使用。
