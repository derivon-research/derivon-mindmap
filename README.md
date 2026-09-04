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

CLI 是无状态 JSON 处理器，不会自行修改文件。它使用 `derivon.graph/v1` 核心协议；Mindmap 工作区使用 `derivon.authoring/v0.3.0`。在工作区中调用 CLI 时，建议让 `derivon-mindmap` Skill 负责两种协议之间的结构化转换、校验和原子写入。

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

数学模型中的 point、hyperedge、tail、head、closure、derivation 与成本由 [`derivon-research/paper`](https://github.com/derivon-research/paper#readme) 定义；CLI 接受的 `derivon.graph/v1` 图协议以 [`derivon-research/derivon` 的 graph format](https://github.com/derivon-research/derivon/blob/main/docs/src/graph-format.md) 为准。本仓库不另写一套定义。

Mindmap 在图协议之上拥有 `derivon.authoring/v0.3.0` 创作层。概念、创作层推导、对象文档和替换视图的规范词义见 [`CONTEXT.md`](CONTEXT.md#本仓库拥有的创作层词汇)，盘上结构见下文“工作区格式”。不了解这些边界时，优先使用 `derivon-cli` 和 `derivon-mindmap` Skills，不要按普通有向图直觉批量改写 manifest。

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
[共模反馈环路](../concept-common-mode-feedback-loop/index.html)
```

Ctrl/Cmd 点击对象引用会在 Mindmap 内打开目标文档。生成的 `index.html` 中，同一链接可以作为普通静态站点链接使用。

## 工作区格式

Derivon 工作区是一个可由 Git、编辑器、Shell 和 Agent 共同维护的普通文件夹：

```text
my-workspace/
├── .derivon/
│   └── workspace.json
└── docs/
    ├── concept-a/
    │   ├── document.md
    │   ├── index.html
    │   └── assets/
    └── derivation-h-1/
        ├── document.md
        └── index.html
```

约束：

- `.derivon/workspace.json` 是图结构和共享视图的事实来源。
- 每个概念和推导独占一个文档目录；不同对象不能共享目录。
- `document.md` 是 Markdown 源文件，`index.html` 是可直接访问的发布入口。
- 新对象默认使用 Markdown；旧工作区的 `format: html` 仍可读取。
- 自动保存会检测磁盘修订变化；发生外部修改冲突时暂停写入并要求用户选择版本。
- 图片引用保留作者写下的相对路径；运行时 Blob URL 和绝对磁盘路径不会写入 Markdown。

最小 manifest 示例：

```json
{
  "schema": "derivon.authoring/v0.3.0",
  "document": {
    "title": "示例知识图",
    "description": "从 A 推导 B"
  },
  "graph": {
    "points": [
      {
        "id": "A",
        "data": {
          "label": "概念 A",
          "document": "docs/concept-a",
          "format": "markdown"
        }
      },
      {
        "id": "B",
        "data": {
          "label": "概念 B",
          "document": "docs/concept-b",
          "format": "markdown"
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
          "document": "docs/derivation-a-to-b",
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

仓库内的完整工作区示例位于 [`src/examples/replace-with`](src/examples/replace-with)，原生路线验收 fixture 位于 [`src-tauri/tests/fixtures/complete-workspace`](src-tauri/tests/fixtures/complete-workspace)。

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
npm run dev                 # 浏览器开发服务器
npm run tauri:dev           # Tauri 桌面开发应用
npm run tauri:debug         # 启用开发工具和原生 tracing
npm run build               # TypeScript + Vite 生产构建
npm test                    # Vitest 单元测试
npm run test:e2e            # Playwright 端到端测试
npm run tauri:build         # 桌面 release bundle
```

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
npm run bench:g6-isolated
```

技术栈：

- React 19、TypeScript 和 Vite；
- AntV G6 Canvas 与布局 Worker；
- Tiptap、Marked 和 KaTeX；
- Tauri 2；
- `derivon-core` Rust 路线求解器。

生产构建不会包含 debug 菜单或 tracing 开销。`npm run tauri:debug` 产生的 Chrome Trace Event 文件会写入 `src-tauri/target/perf/`，可使用 [Perfetto](https://ui.perfetto.dev/) 分析。

## 许可证

Derivon Mindmap 使用 [MIT License](LICENSE)。

## 交流与反馈

欢迎通过 [GitHub Issues](https://github.com/derivon-research/derivon-mindmap/issues) 报告问题或提出改进建议。

Derivon Research Q 群二维码：

<a href="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg">
  <img src="https://v3n0.top/post/2026/learning-route-hypergraph/DerivonResearch-QGroup.jpg" alt="Derivon Research Q 群二维码" width="280" />
</a>
