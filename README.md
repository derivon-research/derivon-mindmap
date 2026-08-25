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
        ├── index.html
        └── document.md
```

每个点和超边独占一个文档目录。不同对象不能引用同一目录。`document.md` 是主源文件，`index.html` 是始终可直接访问的发布入口；每次编辑都会由 Markdown 同步生成完整 HTML 文档。

Markdown 正文可以直接嵌入 HTML 块。样式、表单、脚本和交互组件会作为 Tiptap `rawHtml` 节点原样保留，并在隔离 iframe 中运行。协议仍接受旧工作区的 `format: html`；这类文档首次打开时会自动迁移为包含原 HTML 的 Markdown，不会删除脚本或样式。

工具栏中的文件夹按钮用于连接工作区目录：

- 目录已有 `.derivon/workspace.json` 时打开该工作区；
- 目录还不是工作区时写入当前浏览器工作区；
- 连接后，manifest 和对象目录会自动回写；
- File System Access API 当前需要 Chromium 系浏览器；其他浏览器仍可使用浏览器本地工作区。

从网页新建概念或推导时，应用默认创建 Markdown 文档及其 HTML 入口，例如 `docs/concept-c-1/document.md` 和 `docs/concept-c-1/index.html`。目录名发生冲突时会自动增加序号。

工具栏允许导入旧版 `derivon.authoring/v0.1.0` JSON。原 `definition`、`introduction` 和 `reasoning` 会迁移到各自目录的 `document.md`，同时生成 `index.html`。

仓库中的完整示例工作区位于 `src/examples/replace-with/`。

## 文档编辑

选择概念或推导后点击“编辑文档”，也可以双击画布对象。文档模式会让出画布，编辑器约占工作区宽度的 80%，右侧保留对象 ID、图关系、权重、文档目录和访问入口。

编辑器基于 Tiptap 的开源核心、StarterKit、Markdown 和 Mathematics 扩展。标题、粗体、斜体、删除线、链接、代码、引用、列表、表格与分隔线都在同一正文区域内直接排版；输入 `# ` 等 Markdown 语法会立即形成对应结构，`Command/Ctrl+B` 等 StarterKit 快捷键可直接使用。

公式由 KaTeX 渲染。在正文中键入标准的行内 `$E = mc^2$` 或块级 `$$...$$` 语法，闭合美元符号后会立即转为公式。工具栏也可以直接插入两种公式；点击已渲染的公式会在页面内打开带 `$`/`$$` 边界的 LaTeX 编辑条，不使用浏览器提示框。生成的 `index.html` 会同步包含 KaTeX 渲染结果。

工具栏可插入带滑块和实时可视化的 HTML 交互示例，示例内明确标注 HTML、CSS 和 JavaScript 均可自由改写。每个 HTML 节点可在源码和交互预览之间切换；预览 iframe 不具有同源权限，不能访问 Derivon 应用页面和本地工作区 API。

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
          "format": "markdown"
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
          "format": "markdown"
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
- `data.format` 只接受 `markdown` 或兼容旧工作区的 `html`；新文档统一使用 `markdown`。
- 每个文档目录只能由一个点或一条超边拥有。
- 每个目录必须存在 `index.html`；Markdown 文档还必须存在 `document.md`。
- React Flow 投影对象、选择状态和局部布局不持久化。

Rust 核心仍然只消费点、超边和权重，不读取对象文档或 `view.replacements`。
