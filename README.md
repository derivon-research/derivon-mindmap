# Derivon Mindmap

Derivon 加权有向 B-超图的前端录入实验。AntV G6 Canvas 负责高性能画布交互，并通过 Worker 布局和批量同步支持千级概念图；领域协议、工作区读写、renderer-neutral scene、对象文档编辑、替换规则和可见性投影分别位于 `src/domain.ts`、`src/workspace.ts`、`src/graphScene.ts`、`src/DocumentEditor.tsx`、`src/replacements.ts` 与 `src/projection.ts`。

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

构建、测试与 1,000-concept production G6 smoke：

```bash
npm run build
npm test
npm run test:e2e
npm run bench:graph
npm run bench:replacement
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## 初始页面与操作引导

首次打开应用时使用空白工作区，并自动启动 8 步“第一次创建项目”教程。右上角问号打开教程目录；文档工具、25 步“理解 Derivon 的基本图模型”、大型项目导航、本地版下载和 Agent Skills 分成独立短教程，可分别完成或重播。图模型教程先让用户从概念拖到概念创建推导，再追加前提、亲手建立平行推导、切换当前方案并验证端点编辑只影响当前方案，最后进入替换对照。生手流程不再介绍原始 JSON 编辑。

引导实现位于 `src/onboarding.tsx`，定位、滚动、聚光区、键盘和焦点行为由 React Joyride 负责。业务控件通过 `data-tour-feature` 注册稳定目标，真实操作通过类型化的模块内事件通知当前步骤；应用不再维护自定义蒙版几何、浮窗定位、DOM Observer 或全局 `window` 事件。

教程采用受控进度。输入、排版、布局、搜索和图操作只会启用“下一步”，不会在用户刚看到结果时强行跳走。自动推进仅用于创建成功以及旧目标会随界面切换消失的少数步骤。进度按 `derivon.onboarding/v2` 分教程保存；未完成教程从断点恢复，已完成教程重播时从头开始。

大型项目导航教程会临时加载内置的 `math-reforged` 图。进入前保存当前 manifest、对象文档、目录句柄和修订号，退出或完成时恢复；临时示例不会写入当前文件夹或浏览器工作区。路线推导只在本地应用中提供，浏览器教程直接链接到 [最新本地版](https://github.com/derivon-research/derivon-mindmap/releases/latest)，不演示路线求解过程。新增步骤时应优先复用 `TOUR_FEATURES` 和 `notifyTourAction`，只有确实跨越业务界面的步骤才在 `App.tsx` 使用 `TourPreparation`。

替换关系支持三种显示方式：`原概念`和`替换概念`是写入工作区历史的共享投影，`对照`只在当前会话同时显示两侧，不写入 JSON、history 或 autosave。概念卡右上角用不同标记区分替换成员与替换结果；hover 或选中后可通过附加三态控件切换。对照视图中的灰绿虚线箭头由直接成员汇聚后指向替换概念；它只是被动视图辅助，不是推导边，也不参与布局、路线或权重计算。切换对照不会移动节点、启动布局 Worker 或改变 viewport。

仓库中的完整替换示例仍可通过 `?example=replace-with` 显式打开；如果浏览器已有本地工作区，本地内容始终优先，不会被示例覆盖。

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

每个点和超边独占一个文档目录。不同对象不能引用同一目录。`document.md` 是 Markdown
源文件，`index.html` 是始终可直接访问的发布入口。Markdown 正文可以嵌入样式、表单、
脚本和交互组件；编辑器在隔离 iframe 中预览 raw HTML，并同步生成完整 HTML 文档。
协议仍兼容旧工作区的 `format: html`。

工具栏中的文件夹按钮用于连接工作区目录：已有 `.derivon/workspace.json` 时打开项目，
否则把当前浏览器项目写入该目录。自动保存会检查磁盘版本并检测外部修改；发生冲突时暂停
写盘，由用户选择采用文件夹版本或保留 WebUI 修改。File System Access API 需要 Chromium
系浏览器和 HTTPS 安全上下文；线上使用 `https://mindmap.derivon.net/`。

### Agent Skills

Agent Skills 已从 Mindmap 前端独立发布。应用不会在打开、创建、另存或自动保存项目时
安装、更新、检测、删除 `.agents/`、`.claude/`、`.github/skills/` 或
`.derivon/agent/bundle.json`。个人使用推荐全局安装：

```bash
npx skills add derivon-research/skills --all -g
```

查看六个可用 skills 或执行项目级选择安装：

```bash
npx skills add derivon-research/skills --list
npx skills add derivon-research/skills \
  --skill derivon-cli derivon-mindmap derivon-exploration \
  --agent '*' -y
```

独立仓库位于 <https://github.com/derivon-research/skills>，包含 CLI/数学模型、Mindmap
Unix 管道与文档工具、逐章教材导入、理解拷打、个人知识探索和专家建图六类能力。
旧内测工作区若仍保留由应用生成的 Agent 文件，请在确认没有需要保留的个人修改后手动删除；
新版应用会原样保留它们，不执行自动迁移或清理。

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

编辑器基于 Tiptap 的开源核心、StarterKit、Markdown、Image、List 和 Mathematics 扩展。六级标题、粗体、斜体、删除线、链接、行内代码与代码块、引用、普通列表、任务清单、图片、表格与分隔线都在同一正文区域内直接排版；输入 `# `、`- [ ] ` 等 Markdown 语法会立即形成对应结构，`Command/Ctrl+B` 等 StarterKit 快捷键可直接使用。

对象引用仍使用标准 Markdown 链接。点击工具栏的“引用对象”，或在普通文本中输入 `[[`，可以按概念 label/ID 或推导 ID、前提和结论搜索整个 Mindmap；选择后会写入从当前 `document.md` 到目标 `index.html` 的相对链接，例如 `[共模反馈环路](../concept-common-mode-feedback-loop/index.html)`，不会保存 WikiLink 或自定义 URL。选中文字后插入会保留原文字；Ctrl/Cmd 点击已插入的对象引用会在应用内打开目标文档。普通 URL 使用独立的页面内设置条，不依赖浏览器提示框。

图片使用标准的 `![替代文字](路径)` Markdown。HTTP(S) 地址直接显示；工作区相对路径按当前 `document.md` 所在目录解析，例如 `../../assets/book-pages/book-page-0241.jpg`。编辑器按需读取工作区图片并使用临时 URL 显示，保存时仍保留原始相对路径；路径越出工作区或图片无法读取时会显示可编辑的失败占位。通过 Ctrl/Cmd+V 粘贴的图片会写入当前对象目录的 `assets/` 子目录，并插入 `![文件名](assets/生成的文件名)`；未连接工作区时不会退化为 base64，而是显示持久化失败状态。

公式由 KaTeX 渲染。在正文中键入标准的行内 `$E = mc^2$` 或块级 `$$...$$` 语法，闭合美元符号后会立即转为公式。工具栏也可以直接插入两种公式；点击已渲染的公式会在页面内打开带 `$`/`$$` 边界的 LaTeX 编辑条，不使用浏览器提示框。生成的 `index.html` 会同步包含 KaTeX 渲染结果。

工具栏可插入带滑块和实时可视化的 HTML 交互示例，示例内明确标注 HTML、CSS 和 JavaScript 均可自由改写。每个 HTML 节点可在源码和交互预览之间切换；预览 iframe 不具有同源权限，不能访问 Derivon 应用页面、本地工作区 API、Cookie 或同源存储。发布后的 `index.html` 不受编辑器 iframe 的 sandbox 限制，也没有 GitHub Pages 特有的“禁止外部脚本”规则；外部资源能否工作仍取决于 HTTPS、资源服务端的 CORS/CSP 配置和网络可用性，因此附带的 Agent Skill 默认建议组件自包含，并要求外部依赖提供可读降级。

移动端使用约 78/22 的编辑区和对象上下文布局。

## 图编辑

- 工具栏 `+` 新建概念；相邻的推导按钮打开右侧搜索表单。前提使用模糊搜索多选，结论使用模糊搜索单选，选择过程保留在 draft，提交时才生成 ID、对象文档和一条 history 记录。空前提与自依赖环合法；结论提交前必填。
- 概念卡是 `136 x 64` Canvas 矩形：左侧红色入口接收结论，右侧蓝色出口发出前提。推导菱形左侧为蓝色 premise input，右侧为红色 conclusion output，中央只显示一位小数成本。
- 从 concept 蓝色 port 拖到 derivation 蓝色 port 会追加前提；从 derivation 红色 port 拖到 concept 红色 port 会修改结论。Concept 蓝色 port 拖到另一个 concept 的红色 port 时，预览临时 `1.0` 菱形和蓝/红两段曲线，提交后创建新推导。
- 推导检查器的“编辑前提与结论”使用同一套搜索式 draft form，一次保存、一次 undo、一次自动布局，不使用全量 `<select>` 列表。
- 头点和尾集相同的平行推导在数据中保持独立，在画布上用最多两层无文字菱形轮廓堆叠；检查器切换 active member，端点编辑只修改当前 member。
- `Shift` 点击切换多选，`Shift` 从空白画布拖动使用 partial-overlap marquee；拖动任一 selected card 会一起移动当前全部 selected、非淡化节点。
- 静态边不接收 pointer。Focus/route 中的淡化节点、菱形和 ports 不可点击、拖动、连接或框选；其区域按空白画布处理，hover 不会重新提亮背景关系。低缩放 Canvas 命中遗漏会按当前可交互节点的实际边界回退检测。
- 自动布局在独立 Worker 中运行。工具栏布局菜单只控制全局视图，提供 `自动 / Dagre / Force`：自动模式在少于 400 个投影节点时使用从左到右的 Dagre，达到阈值后使用 cycle-safe deterministic bipartite force 和 card-aware separation；另两个模式忽略规模并强制使用所选全局算法。关联视图始终使用紧凑 Dagre。结构/投影修改约 120ms debounce，权重修改约 400ms debounce；新请求取消旧请求。首次打开时，Canvas 等待有效布局坐标再提交节点；大图初始视口保留最低可辨识缩放，工具栏“适应视图”仍可查看完整全图。
- 布局模式和坐标只存在于当前运行时内存。打开工作区、拓扑/投影/权重修改、切换算法或显式重新布局会重新计算；手工拖动保留到下一次 full layout 或 workspace reload，不写入 workspace、browser localStorage、sidecar layout cache 或任何 JSON。
- 所有图规模都保留完整 Canvas 语义：全局视图持续显示 card labels、IDs、ports、derivation junctions 和普通 edges，不因概念数超过 300 而退化为无文字轮廓。关联视图继续显示完整背景图并用 opacity 淡化非关联 card 与 edge，同时背景元素仍不可交互。大图通过 Canvas 批量同步和 Worker 布局控制开销。

## 替换

建立替换关系：

1. 选择一个概念，或按住 `Shift` 继续点击以选择多个概念。
2. 点击工具栏的“替换”图标。
3. 点击已经存在的概念点，或通过顶部搜索选择替换点。

该操作只修改 `view.replacements`，不会创建父概念、容器、端口、超边或权重。解除关系也不会删除概念、推导或对象文档。

当前投影使用可见点诱导出的子图：

```text
H_view = { h ∈ H | T(h) ∪ {head(h)} ⊆ P_view }
```

因此替换不承诺两侧具有相同可达性或最低成本。

## Manifest Schema

```json
{
  "schema": "derivon.authoring/v0.3.0",
  "document": {
    "title": "A 到 B",
    "description": "工作区示例"
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
    "replacements": []
  }
}
```

协议约束：

- 点只允许 `id` 和 `data`；超边只允许 `id`、`weight`、`tails`、`head` 和 `data`。
- `data.document` 是工作区内的文档目录相对路径，不是入口文件路径。
- `document` 只保存共享语义元数据 `title` 和 `description`；不保存 `updatedAt` 等时间戳，写入时间由文件系统元数据和 Git 维护。
- `data.format` 只接受 `markdown` 或兼容旧工作区的 `html`；新文档统一使用 `markdown`。
- 每个文档目录只能由一个点或一条超边拥有。
- 每个目录必须存在 `index.html`；Markdown 文档还必须存在 `document.md`。
- renderer 投影对象、坐标、viewport、选择状态和局部布局不写入 manifest，也不写入独立 layout cache；它们只存在于当前运行时内存。
- `v0.2.0` manifest 仍可读取；其中的 `view.positions` 会在严格校验后直接丢弃，后续保存统一写为 `v0.3.0`。

Rust 核心仍然只消费点、超边和权重，不读取对象文档或 `view.replacements`。
