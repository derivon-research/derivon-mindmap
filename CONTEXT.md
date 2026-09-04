# Derivon Mindmap context

本文档是 v1.0.0 重写期间的领域词汇与模块边界。它描述一个应用在不同宿主上提供哪些模式，以及状态、工作区内容和适配器之间的责任分界。

## 核心表述

**一个应用、两种模式：学习侧与创作侧。** web 和桌面是运行这个应用的宿主，不是两个应用，也不是两个“壳”。

## 词汇表

### 应用与运行形态

**应用（application）**

Derivon Mindmap 这个单一产品及其共享的状态转换和界面结构。宿主提供能力，模式组织用户工作；两者都不产生第二个应用。

**模式（mode）**

应用级的能力集合，目前只有学习侧和创作侧两种。定向和路线学习是学习侧的流程阶段；大图浏览是两侧都可使用的视图。它们都不是与学习侧、创作侧并列的应用模式。

**学习侧（learning mode）**

学习者定目标、确认已知、预览路线、沿路线学习和浏览图的模式。学习侧可运行在 web 与桌面宿主，只有读取工作区内容的能力；它产生的目标、已知和进度属于应用状态。

**创作侧（authoring mode）**

图作者创建和修改工作区内容的模式。v1 只在桌面宿主提供创作侧；web 构建中不包含创作侧，也不以隐藏按钮或运行时权限判断来模拟这一限制。

**大图浏览（graph browsing）**

在整张知识图上查看对象和关系的视图，不归某一侧独占。学习侧可以在这里打开概念、设定目标或标记已知；创作侧可以用它定位、检查并进入对象编辑。两侧复用渲染层，但各自的操作与状态转换仍由对应模式拥有。

**宿主（host）**

为同一个应用提供运行环境和外部能力的 web 或桌面容器。web 宿主只提供内置工作区的只读来源；桌面宿主提供本地文件系统工作区，并可提供 Pi SDK 对话能力。宿主决定可用能力，模式决定应用如何使用这些能力。

**“壳”（shell，废弃）**

不要用“web 壳”“桌面壳”或类似说法指宿主。这个词暗示存在两个分别包裹业务的应用，而实际模型是一个应用运行在两个宿主上。CSS 中表示页面外框的 `app-shell`、benchmark DOM id，以及指命令行环境的 Unix Shell 不属于这个领域词，允许保留。

### 内容、状态与端口

**工作区内容（workspace content）**

由图作者提供、可被不同学习者共同读取的材料：authoring manifest、对象文档、资产，以及工作区级可选伴随文档（包括定向配置）。对工作区内容的读取和提交只能经过 `WorkspaceSource`。工作区内容不包含某位学习者的本次目标、已知、路线进度、当前视图或对话生命周期。

**应用状态（application state）**

应用为当前使用过程维护的状态，包括当前模式与视图、目标、已知、求解结果、路线进度、面板状态和当前对话。目标、已知和进度不会写回工作区；新建或释放对话也不会清除它们。创作侧尚未提交的编辑可以暂存在应用状态，只有显式提交后才成为工作区内容。

**`WorkspaceSource` 端口**

应用访问工作区内容的唯一接口。端口暴露读取图、对象文档、资产和可选伴随元数据，以及一类提交变更操作；它不暴露目标、已知或学习进度的存储位置。调用方依赖端口，不依赖浏览器 API、Tauri 命令或文件系统路径。

**`WorkspaceSource` 宿主实现**

把端口映射到具体宿主能力的适配器。v1 包含 web 内置工作区只读实现和桌面本地文件系统读写实现，并为未来远端实现保留接口位置而不实现服务。只有桌面创作侧调用写操作；web 实现从结构上不具备本地文件读写能力。

**渲染层（rendering layer）**

图形渲染模块。它接收完整的渲染视图模型并输出选点、平移、缩放等用户事件；它不读取 `WorkspaceSource`，不认识应用状态类型，也不自行改变目标、已知或进度。G6 及布局细节藏在这个边界之后，并位于懒加载边界内。

### 定向与对话

**定向（orientation）**

学习者刚打开一个工作区时，从“还不知道从哪里开始”走到确认“要学什么、已经会什么”，并得到初始路线的入口过程。它发生在正式沿路线学习之前。“定向”是架构与领域讨论用词，不要求界面直接把这个词展示给学习者。

**定向配置（orientation configuration）**

图作者为上述入口过程随工作区提供的可选、声明式设置。它可以给出默认目标与默认已知（两者合称默认路线种子），按顺序提出开场问题，为每道题提供单选或多选选项，并把选项限制性地映射为“设置/追加目标”或“设置/追加已知”。例如，选择“我要看懂一篇用到 SVD 的论文”可以追加对应的目标概念；配置只声明这个结果，不执行代码，也不直接操作应用状态。

定向配置属于工作区内容，以独立伴随文档存在，不向 `derivon.authoring/v0.3.0` manifest 增加字段。没有配置时，应用使用通用入口询问目标与已知。

**定向流程（orientation flow）**

实际带学习者完成定向的应用状态机。它读取定向配置，把回答转换成经过校验的状态转换，并更新本次目标、已知和进度。确定性问答和自然语言对话都只能走这同一套转换。定向流程本身不依赖 AI；没有 `ConversationProvider` 时，web 和桌面仍能用确定性问答完成定向。

**`ConversationProvider`**

确定性问答、桌面 Pi SDK 和未来远端对话实现共同满足的适配接口。provider 负责把各自的交互方式接到定向流程所接受的意图与事件，并可报告流式回复、完成、错误和中止；它不拥有应用状态，不能直接修改 React 状态或工作区，也不能绕过定向状态机。更换或缺少 provider 不改变定向流程的正确性。

### 本仓库拥有的产品词汇

这些词属于 Derivon Mindmap 的产品语意，由学习侧与创作侧共同使用。它们不是 `derivon-core` 数学模型的别名；应用在需要求解时才把其中的结构投影为 core 输入。

**概念（concept）**

产品中一个可命名、可阅读的理解对象。学习侧把概念用作目标、已知和教材内容；创作侧创建、修改概念及其文档。authoring manifest 用 point 记录概念的稳定 ID 与创作元数据，但概念不是 point 数学定义的替代品。

**推导（derivation，产品语意）**

概念之间的一条有方向的关系：零个或多个前提概念共同通向一个结果概念。每条推导拥有自己的问题引入与推导过程，说明已有概念为什么不够、又通过什么论证、构造或转换得到结果概念。学习侧按路线呈现并阅读推导；创作侧创建、修改推导及其对象文档。

求解时，一条产品推导被投影为一个带 `tails`、`head` 和 `weight` 的 hyperedge。`derivon-core` 只处理这个数学结构，不拥有问题引入、推导过程或产品中的“推导”语意。产品推导也不等于 paper 定义的 mathematical derivation。

**对象文档（object document）**

归属于一个概念或一条产品推导的独立文档及其资产。概念文档承载概念内容；推导文档承载问题引入与推导过程。文档路径由 authoring manifest 引用，不同对象不共享同一个文档目录。

**标签（tag）**

图作者附着到 point 的工作区内容，例如 `linear algebra`。tag 可供学习侧与创作侧组织、筛选和呈现概念，但不改变 core 的可达性、推导或成本语义。某位学习者临时选择的筛选条件属于应用状态，图作者提供的 tag 本身属于工作区内容。

**替换视图（replacement view，v1 废弃）**

v0.4.2 曾用 authoring manifest 的 `view.replacements` 把一组对象显示为另一组对象。实践表明它没有有效降低模型复杂度，反而增加了编辑、渲染和文档行为的分支，因此 v1 不再把替换视图作为产品能力，不建立新增、编辑或显示路径。

为保持 `derivon.authoring/v0.3.0` 工作区兼容，既有字段只在工作区边界作为旧数据处理，不进入 v1 的产品状态或模块设计。需要组织和筛选概念时使用 tag；tag 只做分类，不声称对象之间等价，也不改变图语义。

authoring manifest 的盘上结构见 [README 的“工作区格式”](README.md#工作区格式)。

## 外部规范

本仓库不重新定义以下共有词；评审和实现遇到歧义时直接以对应来源为准：

- 数学模型中的 point、hyperedge、tail、head、closure、mathematical derivation、set cost、tree cost、depth cost 与 bracket：[derivon-research/paper](https://github.com/derivon-research/paper#readme)。
- 图协议 `derivon.graph/v1`：[derivon-research/derivon 的 graph format](https://github.com/derivon-research/derivon/blob/main/docs/src/graph-format.md)。
- problem pressure 与 problem-led derivation 等创作方法：[derivon-research/skills 的 context](https://github.com/derivon-research/skills/blob/main/CONTEXT.md)。

同一个英文词 `derivation` 同时出现在数学模型、产品语意和创作方法中；讨论时必须加上“数学模型”“产品”或“problem-led”限定。产品推导是一条拥有问题引入与推导过程的概念关系；mathematical derivation 遵循 paper 的定义，不能把两者互换。

## 模块地图

**一句话地图：`src/app/` 按宿主能力组合模式，`src/modes/` 拥有工作流与应用状态，`src/workspace/` 解释工作区内容，`src/ports/` 定义外部端口，`src/hosts/` 实现这些端口，而 `src/rendering/` 只在视图模型与事件的边界内绘图。**

这是 v1 目标目录边界；重写票据应把新代码放入对应模块，不继续扩展根级的旧版平铺模块。

| 目标目录 | 计划公共入口 | 责任 | 典型改动入口 |
| --- | --- | --- | --- |
| `src/app/` | `src/app/App.tsx` | composition root、宿主能力选择、应用级模式切换与顶栏 | 增加宿主能力或应用级模式入口 |
| `src/modes/learning/` | `src/modes/learning/index.ts` | 定向状态机、路线预览、路线学习，以及大图浏览中的学习者操作与应用状态 | 改目标/已知/进度行为或学习侧界面 |
| `src/modes/authoring/` | `src/modes/authoring/index.ts` | 桌面创作工作流、编辑界面，以及大图浏览中的作者操作 | 增加创作功能或 tag 编辑；同时检查工作区提交契约 |
| `src/workspace/` | `src/workspace/index.ts` | authoring manifest、对象文档、tag、伴随文档及旧字段的解析、校验与领域操作，不做宿主 I/O | 改工作区内容模型或定向配置 |
| `src/ports/` | `src/ports/WorkspaceSource.ts`, `src/ports/ConversationProvider.ts` | `WorkspaceSource`、`ConversationProvider` 及求解等小接口 | 改跨边界能力；随后检查每个实现和契约测试 |
| `src/hosts/web/` | `src/hosts/web/index.ts` | web composition 与只读端口实现 | 改 web 能力、内置工作区加载或确定性 provider |
| `src/hosts/desktop/` | `src/hosts/desktop/index.ts` | desktop composition、本地工作区和 Pi SDK bridge | 改本地文件、桌面 IPC 或桌面对话实现 |
| `src/rendering/` | `src/rendering/index.ts` | 渲染视图模型、事件契约和懒加载的 G6 实现 | 改图的可视表达或图交互事件 |

这些入口是后续重写票据要创建并保持稳定的模块门面；内部文件可随实现细化。一次功能改动先从拥有状态转换或内容语义的入口开始，再检查它使用的端口；只有外部能力发生变化时才改宿主入口，只有视图模型或图事件发生变化时才改渲染入口。provider 功能不得把定向状态转换搬入 `src/hosts/`，工作区 I/O 也不得进入 `src/modes/` 或 `src/rendering/`。
