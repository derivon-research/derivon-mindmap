# Mindmap Demo

Derivon 加权有向 B-超图的前端录入实验。React Flow 负责画布交互；领域协议、工作区读写、对象文档编辑、`replace with` 规则和可见性投影分别位于 `src/domain.ts`、`src/workspace.ts`、`src/DocumentEditor.tsx`、`src/replacements.ts` 与 `src/projection.ts`。

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

## 工作区

Derivon 使用普通文件夹作为工作区：

```text
my-workspace/
├── .derivon/
│   └── workspace.json
└── docs/
    ├── concept-a/
    │   ├── index.html
    │   └── document.md
    └── derivation-h-1/
        └── index.html
```

每个点和超边独占一个文档目录。不同对象不能引用同一目录。目录始终只有一个访问入口 `index.html`，因此浏览器、AI、发布工具和外部应用不需要判断源格式。

对象有两种编辑格式：

- `html`：直接编辑 `index.html`，可以包含样式、表单、脚本和交互组件。
- `markdown`：编辑 `document.md`；每次保存都会同步生成该目录的 `index.html`。

Markdown 转 HTML 会生成完整的 HTML 文档。HTML 转 Markdown 会移除脚本、样式和无法表示的交互内容，因此界面会在转换前确认。

工具栏中的文件夹按钮用于连接工作区目录：

- 目录已有 `.derivon/workspace.json` 时打开该工作区；
- 目录还不是工作区时写入当前浏览器工作区；
- 连接后，manifest 和对象目录会自动回写；
- File System Access API 当前需要 Chromium 系浏览器；其他浏览器仍可使用浏览器本地工作区。

从网页新建概念或推导时，应用默认创建 HTML 文档目录，例如 `docs/concept-c-1/index.html`、`docs/derivation-h-2/index.html`。目录名发生冲突时会自动增加序号。

工具栏允许导入旧版 `derivon.authoring/v0.1.0` JSON。原 `definition`、`introduction` 和 `reasoning` 会迁移到各自目录的 `document.md`，同时生成 `index.html`。

仓库中的完整示例工作区位于 `src/examples/replace-with/`。

## 文档编辑

选择概念或推导后点击“编辑文档”，也可以双击画布对象。文档模式会让出画布，编辑器约占工作区宽度的 80%，右侧保留对象 ID、图关系、权重、编辑格式、文档目录和访问入口。

编辑器提供标题、粗体、斜体、删除线、链接、代码、引用、列表、表格与分隔线工具，并支持编辑、分屏和预览三种视图：

- Markdown 使用 GitHub Flavored Markdown 预览。
- HTML 使用独立 iframe 预览，允许脚本、表单和交互。
- HTML iframe 不具有同源权限，不能访问 Derivon 应用页面和本地工作区 API。

移动端使用约 78/22 的编辑区和对象上下文布局。

## 图编辑

- 工具栏 `+` 新建概念；右侧检查器编辑名称、权重与图关系。
- 从概念拖到概念会创建单前提推导。
- 从概念拖到已有推导会追加前提；从推导拖到概念会修改结论。
- 头点和尾集相同的平行推导在数据中保持独立，在画布上堆叠为路径组。
- 路径组默认展示 `weight` 最低的推导，可逐条查看和编辑。
- 空前提合法；`weight` 是非负安全整数。
- 第一次点击节点选中它；再次点击同一节点进入一跳邻域布局。
- 总览位置写入 `view.positions`；局部布局只存在于当前浏览器会话。

## Replace With

建立替换关系：

1. 用框选或按住 `Shift` 选择一个或多个概念点。
2. 点击工具栏的 `Replace with` 图标。
3. 点击已经存在的概念点作为替换点。

该操作只修改 `view.replacements`，不会创建父概念、容器、端口、超边或权重。解除关系也不会删除概念、推导或对象文档。

当前投影使用可见点诱导出的子图：

```text
H_view = { h ∈ H | T(h) ∪ {head(h)} ⊆ P_view }
```

因此 `replace with` 不承诺两侧具有相同可达性或最低成本。

## Manifest Schema

```json
{
  "schema": "derivon.authoring/v0.2.0",
  "document": {
    "title": "A 到 B",
    "description": "工作区示例",
    "updatedAt": "2026-08-25T00:00:00.000Z"
  },
  "graph": {
    "points": [
      {
        "id": "A",
        "data": {
          "label": "A",
          "document": "docs/concept-a",
          "format": "markdown"
        }
      },
      {
        "id": "B",
        "data": {
          "label": "B",
          "document": "docs/concept-b",
          "format": "html"
        }
      }
    ],
    "hyperedges": [
      {
        "id": "h-1",
        "weight": 1,
        "tails": ["A"],
        "head": "B",
        "data": {
          "document": "docs/derivation-h-1",
          "format": "html"
        }
      }
    ]
  },
  "view": {
    "positions": {},
    "replacements": []
  }
}
```

协议约束：

- 点只允许 `id` 和 `data`；超边只允许 `id`、`weight`、`tails`、`head` 和 `data`。
- `data.document` 是工作区内的文档目录相对路径，不是入口文件路径。
- `data.format` 只接受 `markdown` 或 `html`。
- 每个文档目录只能由一个点或一条超边拥有。
- 每个目录必须存在 `index.html`；Markdown 模式还必须存在 `document.md`。
- React Flow 投影对象、选择状态和局部布局不持久化。

Rust 核心仍然只消费点、超边和权重，不读取对象文档或 `view.replacements`。
