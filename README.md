# Derivon Mindmap

Derivon Mindmap 是一个本地优先的知识图谱编辑器，用加权有向 B-超图表达概念、联合前提、推导、替代方案和学习成本。它将可视化图编辑、对象级 Markdown 文档、路线求解和静态发布组织在同一个普通文件夹工作区中。

> 版本范围：本 README 的用户说明对应当前已发布的 v0.4.2。`main` 正在进行 v1.0.0 重写；v1 是运行在 web 与桌面宿主上的一个应用，学习侧在两个宿主都可用，创作侧只在桌面可用。重写期术语与目标模块边界以 [`CONTEXT.md`](CONTEXT.md) 为准。

- 在线版：<https://mindmap.derivon.net/>
- 桌面版：[GitHub Releases](https://github.com/derivon-research/derivon-mindmap/releases/latest)
- CLI：<https://github.com/derivon-research/derivon>
- Agent Skills：<https://github.com/derivon-research/skills>

## 推荐搭配

**推荐同时安装 `derivon` CLI 和 Derivon Agent Skills。** Mindmap 负责可视化建图和文档编辑；CLI 负责严格验证、闭包、路线、诊断和子图查询；Skills 让支持 Agent Skills 的编码助手能够正确理解 B-超图语义，并安全地维护整个工作区。

### 安装 Derivon CLI

使用 Homebrew：

```bash
brew install derivon-research/tap/derivon
derivon --version
```

也可以通过 Cargo 或官方安装脚本安装：

```bash
cargo install derivon-cli
# 或
curl -fsSL https://docs.derivon.net/cli/install.sh | sh
```

CLI 是无状态 JSON 处理器，不会自行修改文件。它使用 `derivon.graph/v1` 核心协议；Mindmap 工作区使用 `derivon.workspace/v1`。在工作区中调用 CLI 时，建议让 `derivon-mindmap` Skill 负责两种协议之间的结构化转换、校验和原子写入。

### 安装 Agent Skills

需要 Node.js/npm。推荐将全部 Derivon Skills 安装到用户级目录，并注册给所有受支持的 Agent：

```bash
npx skills add derivon-research/skills --all -g
```

查看可用 Skills，或只安装核心工作流：

```bash
npx skills add derivon-research/skills --list

npx skills add derivon-research/skills \
  --skill derivon-cli derivon-mindmap \
  --agent '*' --global --yes
```

更新全局 Skills：

```bash
npx skills update -g
```

Skills 仓库当前提供：

| Skill | 用途 |
| --- | --- |
| `derivon-cli` | CLI、核心数学模型、验证、修改和路线查询 |
| `derivon-mindmap` | Mindmap 工作区、对象文档、发布和路线教材导出 |
| `derivon-book-import` | 将授权教程或教材按章节导入知识图 |
| `derivon-teaching` | 基于现有知识图进行只读理解评估 |
| `derivon-exploration` | 通过证据支持的对话探索陌生主题 |
| `derivon-creation` | 与领域专家协作设计和审查知识图 |

Mindmap 应用不会在工作区中安装、升级或删除 Agent 文件。Skills 的生命周期完全由 `npx skills` 管理。

## 快速开始

### 桌面应用

从 [GitHub Releases](https://github.com/derivon-research/derivon-mindmap/releases/latest) 下载对应平台的安装包。桌面版提供完整的本地文件系统访问和原生路线求解。

| 系统 | 安装包 | 支持范围 |
| --- | --- | --- |
| macOS | universal DMG | Apple Silicon 与 Intel Mac |
| Windows | x64 NSIS | 64 位 Windows |
| Fedora | RPM | Fedora 43 及以上 |
| Ubuntu | DEB | Ubuntu 22.04 LTS 及以上 |
| Debian | DEB | Debian 12 及以上 |
| RHEL/Rocky Linux | Flatpak bundle | RHEL 9 / Rocky Linux 9 兼容环境 |
| Arch Linux | 源码 recipe | 当前滚动版本；尚未发布到 AUR |

Fedora 43 及以上安装 RPM：

```bash
sudo dnf install ./Derivon-<version>-1.x86_64.rpm
```

Ubuntu 22.04+ 或 Debian 12+ 安装 DEB：

```bash
sudo apt install ./Derivon_<version>_amd64.deb
```

RHEL 9 或 Rocky Linux 9 使用 Flatpak bundle。首次使用需先安装 Flatpak，然后安装 Release 中的 bundle：

```bash
flatpak install --user ./Derivon_<version>_x86_64.flatpak
flatpak run net.derivon.mindmap
```

Tauri 2 依赖 WebKitGTK 4.1，而 RHEL 9 官方仓库只提供 WebKitGTK 4.0 系列。因此 RPM 不支持 RHEL 9；Flatpak runtime 是 RHEL 9 的受支持交付方式。该路径在 Rocky Linux 9 用户空间中进行自动安装和启动测试，但不代表 Red Hat 官方认证。

Arch Linux 当前提供 Release 源码包和 `PKGBUILD` recipe，不发布到 AUR：

```bash
tar -xzf derivon-mindmap-<version>-arch-recipe.tar.gz
makepkg -si
```

每个 Release 都包含 `SHA256SUMS`，并由 GitHub Actions 生成 build provenance。下载后可以验证：

```bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify ./Derivon_<version>_amd64.deb \
  --repo derivon-research/derivon-mindmap
```

打开应用后可以：

1. 新建一个空工作区，或连接包含 `.derivon/workspace.json` 的现有文件夹。
2. 创建概念和推导，并通过画布端口维护前提与结论。
3. 为每个概念或推导编辑独立的 Markdown 文档。
4. 选择已掌握概念与目标概念，求解可执行学习路线。

当前安装包未进行 Apple Developer ID 或 Windows Authenticode 代码签名，首次启动时操作系统可能显示未验证开发者提示。

### 在线版

当前已发布的 v0.4.2 使用 Chromium 系浏览器访问 <https://mindmap.derivon.net/>，可以体验图编辑、文档编辑和内置教程，但不支持路线求解。v1.0.0 将 web 明确为只提供学习侧的宿主；创作侧与本地工作区写入只在桌面宿主提供。

v0.4.2 的浏览器工作区读写依赖 File System Access API，需要 Chromium 系浏览器和 HTTPS 安全上下文。浏览器权限由用户显式授予；项目内容不会自动上传到 Derivon 服务。这是旧版能力说明，不是 v1 的宿主边界。

### 从源码运行

依赖 Node.js、Rust stable，以及 [Tauri 2 平台依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/derivon-research/derivon-mindmap.git
cd derivon-mindmap
npm ci
npm run tauri:dev
```

只运行浏览器开发版：

```bash
npm run dev
```

## 核心模型

数学模型中的 point、hyperedge、tail、head、closure、mathematical derivation 与成本由 [`derivon-research/paper`](https://github.com/derivon-research/paper#readme) 定义；CLI 接受的 `derivon.graph/v1` 图协议以 [`derivon-research/derivon` 的 graph format](https://github.com/derivon-research/derivon/blob/main/docs/src/graph-format.md) 为准。本仓库不另写一套定义。

Mindmap 自己拥有学习侧与创作侧共有的产品语意。产品推导是概念之间的一条关系，拥有问题引入、推导过程和对象文档；求解时它投影为一个 hyperedge，但不等于 core 数学模型中的 mathematical derivation。概念、产品推导、对象文档和 tag 的规范词义见 [`CONTEXT.md`](CONTEXT.md#本仓库拥有的产品词汇)，盘上结构见下文“工作区格式”。

替换视图是当前 v0.4.2 的旧能力；v1 不再提供它的新增、编辑或显示路径，而以 point 上的 tag 支持组织和筛选。不了解这些边界时，优先使用 `derivon-cli` 和 `derivon-mindmap` Skills，不要按普通有向图直觉批量改写 manifest。

## 主要功能

### 图编辑

- 创建、编辑和删除概念与推导。
- 模糊搜索前提和结论；支持空前提、平行推导与环。
- 通过端口拖拽创建推导或修改现有推导的端点。
- 支持多选、框选、局部视图和替换对照。
- Dagre/Force 自动布局在 Worker 中运行，千级概念图仍保留 label、ID、端口和推导语义。
- 布局坐标、viewport、选择和焦点属于运行时状态，不写入工作区协议。

### 路线求解

桌面应用可以从一个或多个已掌握概念出发，为一个或多个目标求解路线。结果包含：

- 被选概念和推导；
- 可执行推导顺序；
- 集合成本、上下界和最优性状态；
- 不可达目标的阻塞概念与阻塞环诊断。

路线结果不会隐式修改知识图。浏览器不支持路线求解功能。

### 对象文档

每个概念和推导拥有独立文档。Markdown 编辑器支持：

- 六级标题、表格、引用、普通列表和 GFM 任务清单；
- 行内代码、代码块、KaTeX 行内/块级公式；
- 标准 Markdown 图片，以及粘贴图片到当前对象的 `assets/` 目录；
- 原始 HTML/CSS/JavaScript 组件的隔离预览；
- 概念和推导的跨文档引用。

对象引用使用标准相对 Markdown 链接。点击“引用对象”或输入 `[[` 可以按概念 label/ID，以及推导 ID、前提和结论搜索整个工作区。`[[` 只是编辑器触发器，最终仍保存为可移植链接：

```markdown
[共模反馈环路](../concept-common-mode-feedback-loop/document.md)
```

Ctrl/Cmd 点击对象引用会在 Mindmap 编辑器内打开目标文档。工作区只保存 Markdown，不依赖生成的 HTML 页面。

## 工作区格式

Derivon 工作区是一个可由 Git、编辑器、Shell 和 Agent 共同维护的普通文件夹：

```text
my-workspace/
├── .derivon/
│   └── workspace.json
└── docs/
    ├── concept-a/
    │   ├── document.md
    │   └── assets/
    └── derivation-h-1/
        └── document.md
```

约束：

- `.derivon/workspace.json` 是图结构和共享视图的事实来源。
- 清单顶层有一个 **工作区 id**：用户命名、事后不可改（改它等于换工作区身份），是工作区身份的写法，
  也是学习者记录在应用数据目录下的目录名。它必须是一段文件系统安全的路径名：小写 ASCII 字母
  （`a`–`z`）、数字与连字符，首尾必须是字母或数字，最长 64 字符，不含 `/`、`\`、空白与 `..`，
  也不是 Windows 保留的设备名（`con`、`prn`、`aux`、`nul`、`com1`–`com9`、`lpt1`–`lpt9`）。同 id 即同身份——
  任何两份清单拥有同一个 id，就是同一个工作区与同一份学习者记录，复制工作区共享记录；
  `document.title` 只是可变的显示名。大小写不需要折叠：大写字母不在字母表里，所以只在大小写上
  不同的两个 id 不会同时存在，读到就照实报错。没有 `id` 的清单是一份坏工作区，不会自动补、
  不做输入方言，也不从文件夹路径推一个出来。
- 每个概念和推导独占一个文档目录；不同对象不能共享目录。
- 每个对象只持久化 `document.md`，其中可以内嵌 HTML/CSS/JavaScript；浏览时才在隔离预览中渲染。
  工作区清单不引用 HTML 页面，创建、编辑和自动保存也不会生成它。
- 打开工作区只读取图与必要的伴随元数据，不载入任何对象正文。浏览对象或实际发起全文搜索时，
  才经共享会话按需读取 Markdown；读取结果经过版本检查并缓存。
- 对象 ID 由应用生成，形如 `c-k7f3q2` / `h-2m9dxb`：`c-` 或 `h-` 前缀加六位小写字符，字母表去掉
  `0 1 i l o u`。它永不重用，图内唯一即可；协议本身接受任意 ASCII ID，手写的图可以用 `svd` 这样的名字。
- 自动保存会检测磁盘修订变化；发生外部修改冲突时暂停写入并要求用户选择版本。
- 图片引用保留作者写下的相对路径；运行时 Blob URL 和绝对磁盘路径不会写入 Markdown。

以下是最小的 `derivon.workspace/v1` 清单。`tags` 与 `points[].data.tags` 都是可选的；标签不带颜色，标记到颜色的映射属于渲染模块内部：

```json
{
  "schema": "derivon.workspace/v1",
  "id": "example-workspace",
  "document": {
    "title": "示例知识图",
    "description": "从 A 推导 B"
  },
  "tags": [
    { "id": "basics", "label": "基础" }
  ],
  "graph": {
    "points": [
      {
        "id": "A",
        "data": {
          "label": "概念 A",
          "description": "一句话说明它在这张图里担什么角色。",
          "document": "docs/concept-a",
          "tags": ["basics"]
        }
      },
      {
        "id": "B",
        "data": {
          "label": "概念 B",
          "document": "docs/concept-b"
        }
      }
    ],
    "hyperedges": [
      {
        "id": "derive-a-to-b",
        "weight": 1,
        "tails": ["A"],
        "head": "B",
        "data": {
          "label": "从 A 得到 B",
          "document": "docs/derivation-a-to-b"
        }
      }
    ]
  }
}
```

`description` 在概念和推导上都可选，是给选择器、搜索结果和列表用的一句话，不是文档的摘要。
推导的 `label` 也可选；不写就按端点显示成「A + B → C」。

v1 是唯一的工作区协议，没有旧版本需要迁移：schema 串不是 `derivon.workspace/v1`、缺少顶层 `id`、
`id` 不是一段可用的路径名、清单里还留着 `view` 或 `format`，或者顶层出现了协议未定义的键，
都会被当作一份坏工作区照实报错。

### 开局配置

工作区可以带一份可选的伴随文档 `.derivon/orientation.json`，协议为 `derivon.orientation/v1`。它声明
默认路线种子（默认目标与默认已知）、有顺序的开场问题、单选或多选选项，以及选项到「设置/追加目标」
「设置/追加已知」这四个受限动作的映射。动作可以点名概念，也可以按标签指定、在载入时展开。

```json
{
  "schema": "derivon.orientation/v1",
  "seed": { "targets": ["B"], "known": [] },
  "questions": [
    {
      "id": "why",
      "prompt": "先说你想走到哪里。",
      "select": "one",
      "options": [
        { "id": "to-b", "label": "走到 B", "actions": [{ "op": "set-targets", "points": ["B"] }], "next": "finish" }
      ]
    }
  ]
}
```

规则：`next` 缺省表示顺文档顺序落到下一题，`finish` 是结束开局的保留 id；多选题的跳转挂在题上，
选项不能各自跳转。清单不为这份文档增加字段，清单版本也不随它移动；没有配置的工作区仍然有效，
学习侧走通用入口。

### 学习者记录

学习者的掌握与已确认路线不在工作区里。它们以工作区 `id` 为键存在应用数据目录下的
`learner-records/<工作区 id>/` 里，协议分别为 `derivon.learning/v1`（`state.json`）与
`derivon.routes/v1`（`routes.json`）。目录布局只有一份说明，与字段、约束、`basis` 的覆盖范围
与失效行为同在 [`docs/learner-records.md`](docs/learner-records.md)。
它们不进工作区清单、不进 `WorkspaceSource`、不参与工作区同步，也不进工作区的 `revision`；
复制工作区共享同一份记录。应用自身的界面与脚本命令面是两条写入路径，但必须产出同一份
规范的工件。路线上的完成标记只在显示时来自 `state.json`，路线记录本身不携带任何完成标记。

仓库内的 v0.4.2 兼容工作区 fixture 位于 [`src/examples/replace-with`](src/examples/replace-with)，其中包含 v1 不再提供产品行为的旧 replacement 数据；原生路线验收 fixture 位于 [`src-tauri/tests/fixtures/complete-workspace`](src-tauri/tests/fixtures/complete-workspace)。

## 与 Agent 协作

安装 Skills 后，可以让编码 Agent 在不依赖 Mindmap UI 的情况下完成结构化任务，例如：

- 验证工作区和对象文档完整性；
- 查询概念、推导、闭包、路线和不可达原因；
- 原子新增或修改图对象；
- 渲染一个或全部 Markdown 发布页；
- 将求解路线导出为可预览的静态教材；
- 导入授权教材、评估理解或协作建图。

Agent 修改工作区时仍应遵循同一原则：先读取完整受影响子图和对象文档，验证候选结果，渲染受影响发布页，再原子替换持久化文件。删除图对象不代表可以删除其文档目录。

## 开发

常用命令：

```bash
npm run dev                 # 浏览器开发服务器（web 宿主）
npm run dev:desktop         # 浏览器开发服务器，但构建的是桌面宿主
npm run tauri:dev           # Tauri 桌面开发应用
npm run tauri:debug         # 启用开发工具和原生 tracing
npm run build               # TypeScript + Vite 生产构建（web 宿主）
npm run build:desktop       # 同上，桌面宿主；`tauri:build` 用的就是它
npm test                    # 前端与构建门禁单元测试
npm run test:e2e            # Playwright 端到端测试
npm run tauri:build         # 桌面 release bundle
```

### 一个应用、两种宿主构建

`--mode desktop` 决定 `#host` 解析到 `src/hosts/desktop/host.ts` 还是 `src/hosts/web/host.ts`，宿主模块再决定这次构建里存在哪些模式。**创作侧只被桌面宿主模块引用**，所以 web 构建的模块图里根本没有 `src/modes/authoring/`，不是靠运行时判断藏起来的。`src/app/moduleBoundaries.test.ts` 守着这条边界，同时守着首屏不含图渲染、公式排版与富文本编辑。

重写期间 v0.4.2 旧应用仍留在 `legacy.html`，不进默认构建；端到端测试与性能基准暂时仍驱动它。新应用是 `index.html`，`npm run check:initial-js-budget` 量的就是它。

Rust 检查：

```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

性能基准：

```bash
npm run bench:graph
npm run bench:replacement
npm run bench:runtime
npm run bench:runtime:desktop # Linux, built debug Tauri binary, tauri-driver
npm run bench:g6-isolated
```

技术栈：

- React 19、TypeScript 和 Vite；
- AntV G6 Canvas 与布局 Worker；
- Tiptap、Marked 和 KaTeX；
- Tauri 2；
- `derivon-core` Rust 路线求解器。

运行时性能基准默认对 1000 个概念的生成图采样 5 次，可通过 `PERF_SIZE` 和 `PERF_RUNS` 调整。测试钩子及 2.5s/200ms 阈值的稳定契约见 [`docs/testing/runtime-performance.md`](docs/testing/runtime-performance.md)。

生产构建不会包含 debug 菜单或 tracing 开销。`npm run tauri:debug` 产生的 Chrome Trace Event 文件会写入 `src-tauri/target/perf/`，可使用 [Perfetto](https://ui.perfetto.dev/) 分析。

## 许可证

Derivon Mindmap 使用 [MIT License](LICENSE)。

## 交流与反馈

欢迎通过 [GitHub Issues](https://github.com/derivon-research/derivon-mindmap/issues) 报告问题或提出改进建议。

Derivon Research Q 群二维码：

<a href="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg">
  <img src="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg" alt="Derivon Research Q 群二维码" width="280" />
</a>
