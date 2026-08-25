# Mindmap Demo

Derivon 加权有向 B-超图的前端录入实验。React Flow 负责画布交互；领域协议、工作区读写、对象文档编辑、`replace with` 规则和可见性投影分别位于 `src/domain.ts`、`src/workspace.ts`、`src/DocumentEditor.tsx`、`src/replacements.ts` 与 `src/projection.ts`。

## 交流与反馈

欢迎加入 Derivon Research Q 群，交流使用体验并反馈知识整理模型中不符合直觉的部分。点击二维码可以查看原图。

<a href="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg">
  <img src="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg" alt="Derivon Research Q 群二维码" width="320" />
</a>

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

## 初始页面与操作引导

首次打开应用时使用空白工作区，不再自动载入仓库中的示例图。页面会自动启动操作引导；退出或完成后，可通过右上角问号按钮重新开始。引导从新建项目文件夹开始，带用户实际创建 A、B、X 概念和推导，并覆盖对象文档、Markdown 快捷键、KaTeX、表格、HTML、平行推导、多前提、Replace with、局部视图、搜索、拖动、删除、撤回/重做、缩放、JSON 校验与 Agent Skill。

引导步骤位于 `src/onboarding.tsx`。步骤只引用统一的功能标识，各控件通过 `data-tour-feature` 注册目标，并在真实操作成功后发送对应完成事件。蒙版和浮窗每次从目标元素的 DOM 边界计算位置，不保存控件坐标；修改控件时应同步使用 `TOUR_FEATURES` 和 `notifyTourAction`，让功能、目标和步骤推进保持同一绑定。

仓库中的完整 Replace with 示例仍可通过 `?example=replace-with` 显式打开；如果浏览器已有本地工作区，本地内容始终优先，不会被示例覆盖。

## 工作区

Derivon 使用普通文件夹作为工作区：

```text
my-workspace/
├── .agents/skills/derivon-workspace/SKILL.md
├── .claude/skills/derivon-workspace/SKILL.md
├── .github/skills/derivon-workspace/SKILL.md
├── .derivon/
│   ├── agent/
│   │   ├── bundle.json
│   │   ├── references/
│   │   │   ├── README.md
│   │   │   ├── model.md
│   │   │   ├── derivon-paper.md
│   │   │   └── learning-route-hypergraph.md
│   │   └── validate-workspace.mjs
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
- 自动保存会在写入前检查磁盘版本，并定时检测 Agent、编辑器或其他程序的外部修改；
- 发现外部修改后会暂停写盘，由用户选择采用文件夹版本，或忽视该版本并保留 WebUI 修改；
- File System Access API 需要 Chromium 系浏览器和 HTTPS 安全上下文；线上请使用 `https://mindmap.derivon.net/`，其他浏览器仍可使用浏览器本地工作区。

浏览器基于隐私限制只提供授权目录的名称，不提供系统绝对路径。未选中点或推导时，右侧 `Graph` 总览会显示当前打开的项目文件夹；尚未连接目录时显示“未打开项目文件夹”。

连接目录时还会自动附加 `derivon-workspace` Agent Skill。相同的 Skill 会写入
`.agents/skills/`、`.claude/skills/` 与 `.github/skills/`，供 Codex、Cursor、
Claude Code、GitHub Copilot 等支持 `SKILL.md` 的 Coding Agent 自动发现。应用会在
连接、另存和后续自动保存时同步最新参考集；`.derivon/agent/bundle.json` 记录上次
生成内容的 SHA-256。只有仍与上次生成版本一致的文件会自动升级，用户修改过的文件
会进入 `protectedFiles` 并保持原样，没有托管记录的用户自建 Skill 也不会被覆盖。
Skill 指导 Agent 联动编辑 manifest 与对象文档、编写 KaTeX 公式
和 HTML、正确处理超边的 AND/OR 语义，并审阅推导是否使用了前提中未提供的概念。

`.derivon/agent/references/` 会随 Skill 一起附加当前临时模型文档：`model.md` 明确
核心数学对象与 authoring manifest 的映射，`derivon-paper.md` 是当前 paper 工作草案
快照，`learning-route-hypergraph.md` 是
[《学习效率的矛盾分析与学习路线的数学建模》](https://v3n0.top/post/2026/learning-route-hypergraph/)
正文快照。Agent 在首次调整图结构或对 Point、Hyperedge、Closure、Derivation、
AND/OR、空尾、环、成本与折叠等定义不确定时，必须主动读取这些材料，不能退回普通
有向图直觉。`references/README.md` 记录了临时来源优先级，以及正式文档发布后需要
同步迁移 Skill、模型指南、材料快照、README、schema 描述和测试的检查表。

工作区同时附带零依赖校验工具：

```bash
node .derivon/agent/validate-workspace.mjs .
node .derivon/agent/validate-workspace.mjs . --inventory
node .derivon/agent/validate-workspace.mjs . --review h-1
```

校验工具检查 ID、文档所有权、关系引用、权重、位置及必需文件；`--review` 会列出
审阅一条推导时必须一起阅读的前提、推导和结论文档。

右上角“连接工作区文件夹”用于打开已有工作区或在非工作区目录中创建。文件夹加号
“在新文件夹创建空项目”会新建空白 Graph、写入所选目录并切换到该项目；软盘
“另存到新文件夹”会把当前浏览器/已连接项目完整写入所选新目录，并把后续自动保存
切换到该目录。为避免数据覆盖，所选目录如果已经包含 `.derivon/workspace.json` 会
被拒绝，必须另选或新建文件夹；目录中的其他文件和用户 Skill 不会被删除或覆盖。

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
- 空前提合法；`weight` 是非负有限数值，最多保留两位小数。
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
