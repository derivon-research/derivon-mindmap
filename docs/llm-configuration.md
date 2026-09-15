# LLM 配置（桌面版 Agent 面板）

面向操作者的说明：桌面应用里的学习/创作 Agent 面板使用哪个 LLM、在哪儿配置。
架构依据见 [ADR-0010](adr/0010-pi-sdk-companion-process.md) 与
[docs/agents/pi-runtime.md](agents/pi-runtime.md)。

## 结论速览

桌面版有一条**用户级配置根 `~/.derivon/`**——三个平台同名同形（Windows 是
`%USERPROFILE%\.derivon\`），Linux 不跟 `$XDG_CONFIG_HOME`。语法与 Pi 一致：

```text
~/.derivon/
├── models.json            # 提供商与模型目录（你写）
├── auth.json              # 凭证（你写）
├── selected-models.json   # 每个模式选中的模型（应用自己写）
├── trust.json             # 哪些项目受信任（你写，只有用到才需要）
├── skills/                # 技能：命令面脚本与 SKILL.md（#104、#122）
├── extensions/            # 你自己的 Pi 扩展（#121）
└── bin/                   # 会话里那个 node（应用自己写）
```

| 文件 | 作用 | 缺少内容时的行为 |
| --- | --- | --- |
| `models.json` | 提供商与模型目录（面板里能选到什么） | 面板列表为空，并写明找不到这个文件 |
| `auth.json` | 凭证（哪些模型真正可用） | 面板列表为空，并写明这里没有任何凭证 |

根目录在应用第一次启动 companion 时自动创建；两个文件的内容需要你自己写（应用只会建出一个空的
`auth.json`）。它就在你的家目录下，一眼看到、可直接备份。`skills/`、`extensions/` 与 `trust.json`
都在这里，分别有自己的说明：技能见 `derivon-research/skills`，扩展与信任见下面「自己扩会话」一节。

旧版本读的是各平台的 Tauri 应用配置目录（macOS 是
`~/Library/Application Support/net.derivon.mindmap/`）。**那个位置现在不读也不写了，也没有自动迁移**：
配置留在旧处，面板只会告诉你它在 `~/.derivon/models.json` 找不到文件——按那句提示自己搬过去即可。

根目录里不会多出别的东西：Pi 那份会落盘的模型目录缓存保持在本应用的内存里，永远不写
`models-store.json`（本应用不做网络目录刷新）。

**这个应用不读 `~/.pi/`，也不要求装 Pi CLI。** 它只是沿用 Pi 的文件格式，所以你可以
把 Pi 文档里的 provider 段落、或者现成的 `~/.pi/agent/models.json` 直接拷过来。

## 只有这两个文件算数

面板能选到什么，是这两个文件的函数。本机环境变量里的
`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `OPENAI_API_KEY` 等、
Google ADC 文件、AWS profile —— 一律不采纳。

这不是"传了自己的路径"就自动成立的：Pi SDK 的凭证解析有一条环境回落，位于
`CredentialStore` 的下游，注入自己的存储拦不住它。所以 companion 按凭证**归属**过滤：
`ModelRuntime.getProviderAuthStatus` 说这个 provider 的凭证来自
`stored`（本应用 auth.json）/ `models_json_key` / `models_json_command` 才offer，
说是 `environment` / `fallback` 就拒绝。另外 Rust 启动 companion 时会清空继承的环境，
只留 `PATH` / `HOME` / `TMPDIR` / `LANG` / `LC_ALL` —— 那是纵深防御，不是主要机制。

## 怎么配

### 1. `models.json`

格式见 Pi 文档 `docs/models.md`。自定义提供商需要 `baseUrl` + `api`；
内置提供商（anthropic、openai 等）可以只写覆盖项。

```json
{
  "providers": {
    "anthropic": {},
    "my-provider": {
      "baseUrl": "https://example.invalid/v1",
      "api": "openai-completions",
      "models": [{ "id": "my-model", "name": "My Model" }]
    }
  }
}
```

### 2. `auth.json`

每个 provider 一条，按 provider id 作键：

```json
{
  "anthropic": { "type": "api_key", "key": "<你的 key>" },
  "my-provider": { "type": "api_key", "key": "<你的 key>" }
}
```

`key` 支持 `!shell-command` 与 `$ENV` 插值（Pi 的规则），所以密钥不必以明文落在这个
文件里。但 **`$ENV` 在本应用里不起作用**：companion 是以清空的环境启动的（只保留
`PATH` / `HOME` / `TMPDIR` / `LANG` / `LC_ALL`），插值取不到任何变量。想避免明文，
用 `!shell-command` 读钥匙串。

也可以不写 `auth.json`，直接在 `models.json` 的 provider 段里写 `apiKey` ——
这同样算作"本应用自己的配置"（归属 `models_json_key`）。

### 内置目录会一并出现

`models.json` 是**覆盖层**而不是替换：声明 `deepseek` 之后，Pi 内置的 deepseek 目录仍在，
你自己写的 `models` 条目追加在后面。所以只声明一个 `deepseek-flash`，面板里看到的是四个
（三个内置 + 你的一个），和 Pi CLI 的行为一致。列表第一个是内置的那个，想默认用自己的，
在面板里选一次即可（选择会存下来）。

### 3. 确认生效

打开面板的模型选单。列表为空时，选单下方会写明原因：文件找不到、`models.json`
解析失败、`auth.json` 里没有凭证、或者"某个 provider 的凭证来自本机环境，已忽略"。
companion 起不来时，那里显示的是它退出前打印的内容，而不是同一句"没有可用模型"。

## 自己扩会话：Pi 扩展

应用不授予 `write` / `edit` 这类内建工具（`read` 与平台 shell 按模式授予），但你可以把自己的 Pi 扩展
装进去，让它登记工具——包括 `read` / `write` / `edit` / `bash` 这类 Pi 内建的名字。两个根：

```text
~/.derivon/extensions/                  # 你自己装的，每个工作区都生效
<workspace>/.derivon/extensions/        # 项目自己的，项目受信任后才会载入
```

根下面可以直接放 `.ts` / `.js` 文件，也可以放一个含 `index.ts` / `index.js` 的目录，或者一个在
`package.json` 的 `pi.extensions` 里声明入口的包——与 Pi 自己的发现规则一致。装进去的扩展在
下一次建会话时生效（换工作区、或按「新对话」后再发一条即可）。

**这是你自己的代码，跑在 companion 进程里**，而那个进程持有已解析的模型凭据。它能做的事不由应用
限制：环境变量被清空（只留 `PATH` / `HOME` / `TMPDIR` / `LANG` / `LC_ALL`），但凭据本身拦不住。和
编辑器插件一样，它在本机信任边界之内（ADR-0010）。

**项目级扩展要项目受信任才载入。** 应用不弹窗问你：信任是一个你自己写的文件，与 Pi 的 `trust.json`
同形——绝对路径作键，`true` 表示信任。

```json
{
  "/Users/you/Projects/graph": true
}
```

写项目自己的路径，或它的某一级父目录（就近的那条说了算，所以信任一个目录就信任了它里面的）。
文件不存在、读不出来、格式不对时，**没有任何项目受信任**：出错只会更严，不会更宽。

扩展加载失败、扩展根读不出来、项目级扩展因为项目未受信任而跳过，都会报两次：面板的模型选单里
（与「没有可用模型」那句同一条通道），以及 companion 的 stderr（`[extensions]` 前缀）。

## 已知限制（截至本文写作）

- 凭证是明文 JSON 文件，无 OS 钥匙串集成（ADR-0010 的安全后续项）。
- Companion 不授予 `write` / `edit`：`read` 与平台 shell 由模式授予，其余内建工具只能来自你装的
  扩展。系统提示固定。
- 扩展**加载时**的工作目录是 `~/.derivon/` 而不是工作区：Pi 的发现器固定会读 `<cwd>/.pi/extensions`，
  把加载目录放在工作区里等于是让未受信任的项目把代码塞进来。这是**加载那一下**的目录，会话本身仍然
  根在工作区：提示里的 `Current working directory`、`ctx.cwd`、`derivon` 跑的 CLI、技能里的相对
  路径全都在你的项目目录里。只有扩展自己 `pi.exec` 且不显式给 `cwd` 时才落在 `~/.derivon/`；
  注册的工具拿到的 `ctx.cwd` 就是会话自己的工作区（用 `ctx.cwd` 或显式 `cwd` 都不受影响）。
- 模型选择按模式（学习 / 创作）各记一个，由 companion 持有并写在
  `~/.derivon/selected-models.json`，重启后保留；没选过时取列表第一个。
  记住的模型若已不在目录里，会回落到第一个可用的。
- Web 构建（`--mode web`）没有 provider，Agent 面板不可用，与本配置无关。
