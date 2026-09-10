# LLM 配置（桌面版 Agent 面板）

面向操作者的说明：桌面应用里的学习/创作 Agent 面板使用哪个 LLM、在哪儿配置。
架构依据见 [ADR-0010](adr/0010-pi-sdk-companion-process.md) 与
[docs/agents/pi-runtime.md](agents/pi-runtime.md)。

## 结论速览

桌面版有自己的两个配置文件，放在**应用配置目录**下，语法与 Pi 一致：

| 文件 | 作用 | 缺失时的行为 |
| --- | --- | --- |
| `models.json` | 提供商与模型目录（面板里能选到什么） | 面板列表为空，并写明找不到这个文件 |
| `auth.json` | 凭证（哪些模型真正可用） | 面板列表为空，并写明这里没有任何凭证 |

macOS 上应用配置目录是 `~/Library/Application Support/<bundle identifier>/`。
目录在应用第一次启动 companion 时自动创建；两个文件需要你自己放进去。

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

## 已知限制（截至本文写作）

- 凭证是明文 JSON 文件，无 OS 钥匙串集成（ADR-0010 的安全后续项）。
- Companion 固定系统提示、禁用全部内置工具。
- 模型选择按模式（学习 / 创作）各记一个，存在 webview 的 localStorage 里，重启后保留；
  没选过时取列表第一个。companion 侧那份是内存态，由面板在启动时补发一次 `setModel` 对齐。
- Web 构建（`--mode web`）没有 provider，Agent 面板不可用，与本配置无关。
