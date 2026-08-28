# Derivon Mindmap

Derivon 加权有向 B-超图的前端录入实验。React Flow 负责画布交互；领域协议、工作区读写、对象文档编辑、替换规则和可见性投影分别位于 `src/domain.ts`、`src/workspace.ts`、`src/DocumentEditor.tsx`、`src/replacements.ts` 与 `src/projection.ts`。

## 交流与反馈

欢迎加入 Derivon Research Q 群，交流使用体验并反馈知识整理模型中不符合直觉的部分。点击二维码可以查看原图。

<a href="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg">
  <img src="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg" alt="Derivon Research Q 群二维码" width="320" />
</a>

## 本地应用运行

需要 Node.js、Rust stable 和 macOS Xcode Command Line Tools。安装依赖后启动 Tauri 2 应用：

```bash
npm install
npm run tauri:dev
```

源码开发构建会提供系统菜单 `Develop > Open Developer Tools`，也可按
`Command+Shift+I`（macOS）或 `Ctrl+Shift+I`（Windows/Linux）随时打开 WebView
开发者工具。

### 性能分析与 Agent 协作

需要分析性能时使用完整 debug 模式：

```bash
npm run tauri:debug
```

该命令会自动打开开发者工具，并启用 Tauri 官方 `tracing` span。复现问题后正常退出
Derivon，完整的 Chrome Trace Event JSON 会写入
`src-tauri/target/perf/derivon-native-<timestamp>-<pid>.json`，可直接拖入
[Perfetto](https://ui.perfetto.dev/) 或交给 Agent。trace 包含 Tauri 自带的 IPC 请求、参数
反序列化、command 执行、响应和 WebView eval 阶段，并额外标注 `route.build_graph` 与
`route.core_solve` 两个业务阶段。

与 Agent 协作时应提供复现步骤和 trace 文件路径；优化前后使用相同工作区与操作各录制
多次，以区分真实变化和运行噪声。需要实时检查 IPC 参数、响应和 waterfall 时，可选用
Tauri 官方文档推荐的
[CrabNebula DevTools](https://v2.tauri.app/develop/debug/crabnebula-devtools)；仓库不默认
集成它，避免与 trace writer 争用全局 tracing subscriber。

WebView 侧使用 Chromium 的 Performance/React Profiler 或 macOS Web Inspector 的
Timelines 分析渲染、脚本、布局和内存；浏览器开发模式还可由 Chrome DevTools MCP 驱动。
Rust 开发二进制仍带调试信息，可继续连接 Instruments、Samply 或其他采样 profiler。
调试菜单只编译进 debug 构建，trace 依赖只由 `tauri:debug` 的 `debug-tools` feature
启用；`npm run tauri:build` 生成的 release 应用不包含这些入口和 tracing 开销。

打开应用后，用工具栏的文件夹按钮选择一个已有 Derivon 工作区。仓库内置的稳定验收
工作区位于 `src-tauri/tests/fixtures/complete-workspace`，使用 A、B、C、D、X、Y 等符号
覆盖完整工作区功能。工具栏的路线按钮进入路线模式：选择目标概念、勾选一个或多个已
掌握概念并开始求解。结果会高亮路线中的概念和超边，按可执行顺序列出步骤，并显示
成本、上下界和最优性状态；不可达结果会列出阻塞概念与阻塞环。

桌面 release 构建：

```bash
npm run tauri:build
```

### 桌面构建与发布 CI

`.github/workflows/desktop-build.yml` 在 `main` 更新以及 PR 请求合并到 `main` 时运行。两个
平台都会执行前端与 Rust 测试，并完整构建桌面 bundle，但不会创建 GitHub Release。配置
`main` 分支保护时，可将 `Build macOS universal DMG` 和 `Build Windows x64 NSIS` 设为
required status checks。

`.github/workflows/release-desktop.yml` 在推送 `v*` tag 时构建并发布 GitHub Release。tag
必须指向 `main` 中的提交，且使用 SemVer 格式。CI 以 tag 为发布版本，并通过临时 Tauri
配置将该版本注入桌面安装包，因此发布前无需专门提交 manifest 版本号变更。带预发布后缀
的 tag（例如 `v0.2.1-beta`）会创建 prerelease，稳定版本 tag（例如 `v0.2.1`）会创建正式
release。发布包含：

- macOS universal DMG，同时包含 Apple Silicon 与 Intel 架构；
- Windows x64 NSIS 安装程序。

准备发布时，直接在最新的 `main` 提交上创建并推送对应 tag：

```bash
git switch main
git pull --ff-only
git tag -a v0.2.1 -m "derivon-mindmap v0.2.1"
git push origin v0.2.1
```

CI 使用实际 tag 创建同名 Release 并生成从上一版本开始的变更说明，不在 workflow 中固定
发布版本或正文。当前构建没有 Apple Developer ID 或 Windows 代码签名，首次启动时操作
系统可能显示未验证开发者警告。

Tauri Rust bridge 位于 `src-tauri/`，直接依赖
`derivon-research/derivon` 的 `v0.2.0` tag。`.derivon/workspace.json` 始终是持久化事实来源；
Rust adapter 在每次查询时重建 Core Graph，把最多一位小数的权重严格乘以 10 后交给
Core。路线查询原生接受起点集合和目标集合，并只向前端返回持久化字符串 ID。

当前 MVP 的桌面端只支持打开和原地自动保存已有工作区；“新建工作区”和“另存为”仍只在
浏览器版本可用。桌面端暂未加入文件监听，使用与浏览器相同的定时 revision 检查。第一版
只返回一条当前最佳路线，不提供 K-shortest、来源过滤或云同步。

## 浏览器运行

```bash
npm install
npm run dev
```

构建与测试：

```bash
npm run build
npm test
npm run test:e2e
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## 初始页面与操作引导

首次打开应用时使用空白工作区，并自动启动 8 步“第一次创建项目”教程。右上角问号打开教程目录；文档工具、“理解 Derivon 的基本图模型”、大型项目导航、本地版下载和 Agent Skills 分成独立短教程，可分别完成或重播。替换作为基本图模型的一部分讲解。生手流程不再介绍原始 JSON 编辑。

引导实现位于 `src/onboarding.tsx`，定位、滚动、聚光区、键盘和焦点行为由 React Joyride 负责。业务控件通过 `data-tour-feature` 注册稳定目标，真实操作通过类型化的模块内事件通知当前步骤；应用不再维护自定义蒙版几何、浮窗定位、DOM Observer 或全局 `window` 事件。

教程采用受控进度。输入、排版、布局、搜索和图操作只会启用“下一步”，不会在用户刚看到结果时强行跳走。自动推进仅用于创建成功以及旧目标会随界面切换消失的少数步骤。进度按 `derivon.onboarding/v2` 分教程保存；未完成教程从断点恢复，已完成教程重播时从头开始。

大型项目导航教程会临时加载内置的 `math-reforged` 图。进入前保存当前 manifest、对象文档、目录句柄和修订号，退出或完成时恢复；临时示例不会写入当前文件夹或浏览器工作区。路线推导只在本地应用中提供，浏览器教程直接链接到 [最新本地版](https://github.com/derivon-research/derivon-mindmap/releases/latest)，不演示路线求解过程。新增步骤时应优先复用 `TOUR_FEATURES` 和 `notifyTourAction`，只有确实跨越业务界面的步骤才在 `App.tsx` 使用 `TourPreparation`。

仓库中的完整替换示例仍可通过 `?example=replace-with` 显式打开；如果浏览器已有本地工作区，本地内容始终优先，不会被示例覆盖。

## 工作区

Derivon 使用普通文件夹作为工作区：

```text
my-workspace/
├── .agents/skills/
│   ├── derivon-workspace/SKILL.md
│   ├── derivon-learning-graph/
│   │   ├── SKILL.md
│   │   └── references/{source-import,weight-calibration}.md
│   ├── derivon-document-authoring/
│   │   ├── SKILL.md
│   │   └── references/large-scale-authoring.md
│   └── derivon-math-authoring/SKILL.md
├── .claude/skills/…
├── .github/skills/…
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

Markdown 正文可以直接嵌入 HTML 块。样式、表单、脚本和交互组件会作为 Tiptap `rawHtml` 节点原样保留，并在隔离 iframe 中运行；iframe 会随普通内容、响应式重排和交互产生的高度变化自动伸缩，不在组件外层形成独立的纵向滚动区。协议仍接受旧工作区的 `format: html`；这类文档首次打开时会自动迁移为包含原 HTML 的 Markdown，不会删除脚本或样式。

工具栏中的文件夹按钮用于连接工作区目录：

- 目录已有 `.derivon/workspace.json` 时打开该工作区；
- 目录还不是工作区时写入当前浏览器工作区；
- 连接后，manifest 和对象目录会自动回写；
- 自动保存会在写入前检查磁盘版本，并定时检测 Agent、编辑器或其他程序的外部修改；
- 发现外部修改后会暂停写盘，由用户选择采用文件夹版本，或忽视该版本并保留 WebUI 修改；
- File System Access API 需要 Chromium 系浏览器和 HTTPS 安全上下文；线上请使用 `https://mindmap.derivon.net/`，其他浏览器仍可使用浏览器本地工作区。

浏览器基于隐私限制只提供授权目录的名称，不提供系统绝对路径。未选中点或推导时，右侧 `Graph` 总览会显示当前打开的项目文件夹；尚未连接目录时显示“未打开项目文件夹”。

连接目录时会附加四层 Agent Skills。相同内容写入 `.agents/skills/`、`.claude/skills/`
与 `.github/skills/`，供 Codex、Cursor、Claude Code、GitHub Copilot 等支持 `SKILL.md`
的 Agent 发现：

- `derivon-workspace` 只负责 manifest、对象所有权、HTML 发布、核心超边语义和校验；
- `derivon-learning-graph` 负责从书本、课程和笔记建立或合并学习图，优先检查概念身份、
  点和超边的粒度、平行路线、来源与学习成本；
- `derivon-document-authoring` 只在用户明确要求实现文档时启用，负责正文、HTML、发布
  审计和大规模 SubAgent 编排；
- `derivon-math-authoring` 只补充数学特有的精确定义、推导叙述、例子与数学视觉标准，
  不再承担教材导入或通用文档工程。

快速导入默认产生可审计的准确占位文档，而不是把每个节点扩写成教材章节。概念占位记录
规范陈述、范围、别名、来源和身份疑问；超边占位记录联合前提如何支持结论、来源以及权重
理由。学习权重统一解释为“所有 tails 已掌握后，理解并验证当前步骤的边际认知成本”。
应用层以 `0–5` 作为连续 float 标尺的语义锚点，而不是整数枚举：初次估计可使用 `0.5`
步长，有相邻边比较依据时可细化到 schema 支持的 `0.1`，再通过路线行为和人工比较校准。

通用导入规则不会把任意关系伪装成超边。特别是在哲学、历史和文学中，历史影响、时间
顺序、引文、对立和主题相似本身不表示 tails 推出 head；这些证据保留在来源记录中，
确有导航需求时应推动单独的关系或视图设计。学习依赖或论证依赖只有在联合前提和步骤都
能准确说明时才进入 Derivon 超边。

工作区 Skill 提供确定性的 Markdown 渲染；学习图 Skill 提供权重、tails、平行路线、
重复标签和孤立点报告，并要求 Agent 对概念原子性进行语义审查。通用文档 Skill 提供静态
及 Playwright 窄屏审计。脚本只做确定性
渲染和审计，不批量编写正文。显式的大规模文档任务在平台支持时必须主动使用 SubAgent；
没有委派能力时，Agent 必须在开始长时间串行写作前告知用户。

应用会在连接、另存和后续自动保存时同步最新参考集；`.derivon/agent/bundle.json` 记录
托管内容的 SHA-256。仍与旧 bundle 哈希一致的文件会自动升级；Skill 重构后退役且未经
修改的托管文件会安全删除。用户修改过的旧文件进入 `protectedFiles` 并保持原样，没有
托管记录的用户自建 Skill 也不会被覆盖。

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

选择概念或推导后点击“编辑文档”，也可以按住 Ctrl/Cmd 点击画布对象。文档模式会让出画布，编辑器约占工作区宽度的 80%，右侧保留对象 ID、图关系、权重、文档目录和访问入口。

编辑器基于 Tiptap 的开源核心、StarterKit、Markdown 和 Mathematics 扩展。标题、粗体、斜体、删除线、链接、代码、引用、列表、表格与分隔线都在同一正文区域内直接排版；输入 `# ` 等 Markdown 语法会立即形成对应结构，`Command/Ctrl+B` 等 StarterKit 快捷键可直接使用。

公式由 KaTeX 渲染。在正文中键入标准的行内 `$E = mc^2$` 或块级 `$$...$$` 语法，闭合美元符号后会立即转为公式。工具栏也可以直接插入两种公式；点击已渲染的公式会在页面内打开带 `$`/`$$` 边界的 LaTeX 编辑条，不使用浏览器提示框。生成的 `index.html` 会同步包含 KaTeX 渲染结果。

工具栏可插入带滑块和实时可视化的 HTML 交互示例，示例内明确标注 HTML、CSS 和 JavaScript 均可自由改写。每个 HTML 节点可在源码和交互预览之间切换；预览 iframe 不具有同源权限，不能访问 Derivon 应用页面、本地工作区 API、Cookie 或同源存储。发布后的 `index.html` 不受编辑器 iframe 的 sandbox 限制，也没有 GitHub Pages 特有的“禁止外部脚本”规则；外部资源能否工作仍取决于 HTTPS、资源服务端的 CORS/CSP 配置和网络可用性，因此附带的 Agent Skill 默认建议组件自包含，并要求外部依赖提供可读降级。

移动端使用约 78/22 的编辑区和对象上下文布局。

## 图编辑

- 工具栏 `+` 新建概念；右侧检查器编辑名称、权重与图关系。
- 从概念拖到概念会创建单前提推导。
- 从概念拖到已有推导会追加前提；从推导拖到概念会修改结论。
- 头点和尾集相同的平行推导在数据中保持独立，在画布上堆叠为路径组。
- 路径组默认展示 `weight` 最低的推导，可逐条查看和编辑。
- 空前提合法；`weight` 是非负有限数值，最多保留一位小数。
- 第一次点击节点选中它；再次点击同一节点进入一跳邻域布局。
- 总览位置写入 `view.positions`；局部布局只存在于当前浏览器会话。

## 替换

建立替换关系：

1. 用框选或按住 `Shift` 选择一个或多个概念点。
2. 点击工具栏的“替换”图标。
3. 点击已经存在的概念点作为替换点。

该操作只修改 `view.replacements`，不会创建父概念、容器、端口、超边或权重。解除关系也不会删除概念、推导或对象文档。

当前投影使用可见点诱导出的子图：

```text
H_view = { h ∈ H | T(h) ∪ {head(h)} ⊆ P_view }
```

因此替换不承诺两侧具有相同可达性或最低成本。

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
