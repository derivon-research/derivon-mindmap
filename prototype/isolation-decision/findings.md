# 外部隔离：机制选择与量出来的代价（#124 的机制结论）

**这是一次性原型的产物，不是实现。** 结论、证据与可复跑的实验都在
`prototype/isolation-decision/`；仓库里没有任何产品代码被改动。

- 实验脚本：`prototype/isolation-decision/run-experiments.mjs`（`node …`，无依赖）
- 机器可读证据：`prototype/isolation-decision/evidence.json`（75 条观测 + 10 组计时 + 2 条配置失效对照）
- 可视化：`prototype/isolation-decision/isolation-decision.html`（双击打开，离线自包含）
- 环境：macOS 26.6.2 / arm64、`/usr/bin/sandbox-exec` 存在（Apple 已弃用但仍随系统分发）、
  本机 node v26.3.1；**随包 Node 是 v22.23.2**（`scripts/prepare-companion.mjs`），机制不依赖 Node 层能力。

---

## 1. 机制选择：把「会话进程」放进沙箱，而不是把「工具执行」路由进沙箱

本票的判据是「子进程及其后代是否被同一约束覆盖」。决定选项空间的事实是应用**自己**就
`spawn(process.execPath, [script])` 跑技能脚本（`commandSurface.ts` 的 `run`），而且这条路径
**不进 `tool_call` 守卫**（守卫只认 `write`/`edit`/`bash`/`powershell`）。所以：

- **路由形态**（`settings.shellPath` → wrapper）只覆盖 `bash` 工具及其后代。实验第 2 节直接量到：
  同一台机器、同一时刻，只有 `bash` 被包住时技能脚本照写工作区（`WROTE`）。
  它还是 POSIX-only：`getPowerShellConfig()` 不接路径参数，SDK 的 `_buildRuntime` 只把
  `shellPath`/`shellCommandPrefix` 交给 `createBashToolDefinition`——**Windows 上这条缝不存在**。
- **进程形态**（会话自己的进程由平台沙箱启动）一次覆盖全部：companion 自身代码的写入、
  命令面脚本（子进程）、shell 工具及其全部后代。

因此推荐：**学习会话 = 一个自己的 companion 进程，在系统沙箱里启动**；创作会话照今天跑
（需要写入工作区是它的职责）。代价见第 4 节，需要改的地方见第 6 节。

### 候选机制 × 判据

| 候选 | 保证强度 | 需要管理员？ | 覆盖子进程/后代 | 覆盖 `spawn(execPath,[script])` 与进程内扩展 | 机器变更/可逆性 | 体积与会话启动 |
| --- | --- | --- | --- | --- | --- | --- |
| **0. 今天：工具授予 + `tool_call` 守卫** | 无（护栏） | 否 | 否 | 否（技能脚本压根不进守卫） | 无 | 0 |
| **1. Node 层**（`node --permission`、`vm`、`isolated-vm`、WASI） | 无（官方文档自称不是安全机制） | 否 | 否 | 否 | 无 | 0 |
| **2. 只路由 `bash` 工具**（`settings.shellPath` → seatbelt/bwrap） | 部分：只有 shell 那一支 | 否 | 是（该支） | **否**（实测技能脚本照写） | 一个 wrapper + 一份 profile | 每次工具调用 +6~16 ms |
| **3. 路由每一个 spawn 点**（bash + 命令面 + 扩展自己的 spawn） | 部分：spawn 点是开放集合 | 否 | 是 | 部分（进程内 `fs.writeFileSync` 仍在外面） | 改多处调用点 | 同 2 |
| **4. 会话进程进系统沙箱**（推荐） | **强**：等价于「该进程树写不进工作区」 | **否**（macOS 零授权；Windows 走免管理员档） | **是** | **是**（脚本是子进程；扩展代码就在被沙箱的进程里） | 一份 profile 文件，删掉即回退 | 0 体积；启动 +~6 ms；每模式多一个进程 ≈ +120 MB RSS |
| **5. 整进程进容器/微虚拟机**（Docker/OpenShell/Gondolin/microsandbox） | 最强（还能收读取与文件系统视图） | macOS 否、Windows 需 WHP/提权 | 是 | 是 | 引入运行时依赖 | +100 MB~GB；每会话 VM 启动 0.5~2 s；**凭据随进程进沙箱**（Pi 文档点名的代价） |
| **6. Windows 免管理员档**：受限令牌 `WRITE_RESTRICTED` | 强（写侧） | **否** | 是 | 是 | 无机器变更 | 需 Rust 原生代码 |
| **7. Windows 强化档**：Codex 式本地账户 + 防火墙 + DACL | 最强（还能收读取） | **是**（一次性 UAC） | 是 | 是 | 本地账户/防火墙/登录项，卸载路径要专门做 | 重；企业策略下会失败 |

---

## 2. macOS：能跑起来的最小证明（AC 第 1、2 条）

profile 的形状（`learning-workspace-deny.sb.tmpl`，L1 姿态）：

```scheme
(version 1)
(allow default)
(deny file-write* (subpath "<工作区的 canonical 路径>"))
```

`settings.shellPath` 指向的 wrapper 只需自解释，因为 companion 是 `env_clear()` + 五行白名单
启动的——**wrapper 不能从环境里获得工作区路径**，只能靠约定（放在 `<root>/bin` 里，profile
与之同名并排）。

**被刻意构造、能绕过守卫的命令**：守卫的写入形式是「词」（`rm/rmdir/mkdir/touch/truncate/tee`、
`cp/mv/ln/install`、`dd of=`、`sed -i`、重定向）。下面这条没有任何一个：

```sh
node -e "require('node:fs').writeFileSync('<工作区>/secret.txt','pwned')"
```

这条不是“我觉得守卫会放行”——`prototype/isolation-decision/check-guard.mjs` 直接调 `guardDecision`：
3 条构造命令（`node -e` 写文件、`node -e` 改写清单、`node <技能脚本>`）全部 `pass`，
3 条对照（`printf > …`、`rm …`、`write` 工具）全部 `refused`，与本文档一致。

对照与结果（`evidence.json` 的 `attempts`）：

| 观测 | 无隔离 | L1（只禁工作区） | L2（白名单外全禁） |
| --- | --- | --- | --- |
| `node -e` 写工作区文件 | WROTE | **NO-WRITE** | **NO-WRITE** |
| 同一条命令改写 `workspace.json` | WROTE | **NO-WRITE** | **NO-WRITE** |
| 技能脚本（`spawn(node,[script])`，不进守卫）写工作区 | WROTE | **NO-WRITE** | **NO-WRITE** |
| shell 重定向 / `cp` 进工作区 / `mv` 进工作区 / `rm` / `chmod` / `mv` 出工作区 | WROTE | **NO-WRITE** | **NO-WRITE** |
| 孙进程（`bash → sh → sh`）写工作区 | WROTE | **NO-WRITE** | **NO-WRITE** |
| 硬链接把工作区文件链出去再改写 | WROTE | **NO-WRITE** | **NO-WRITE** |
| 符号链接 / 符号链接父目录 / `..` 拼写 / firmlink 别名 `/System/Volumes/Data` | WROTE | **NO-WRITE** | **NO-WRITE** |
| 嵌套 `sandbox-exec` 带一份「全允许」profile（子进程能否自己摘掉沙箱） | WROTE | **NO-WRITE** | **NO-WRITE** |
| `xattr` 写工作区文件（不是文件内容） | WROTE | **NO-WRITE** | **NO-WRITE** |

内核自己给出的理由（不是应用里的字符串）：

```text
/bin/bash: <工作区>/secret.txt: Operation not permitted
node:fs:2406  →  return binding.writeFileUtf8(   （EPERM）
```

**必须继续能用的东西**（同一批实验）：读工作区 ✔、写 TMPDIR ✔、写 `<root>`（`selected-models.json`）✔、
写应用数据目录（学习者记录）✔、发网络请求（`fetch('https://example.com')`）✔。

### 一个会静默失效的配置错误（必须写进实现约束）

macOS 上 `/tmp`、`/var`、`/etc` 都是符号链接，任何经符号链接打开的路径也是。用**应用收到的
拼写**生成 profile 时，规则匹配不到任何东西，隔离**静默变成零**：

| 实验 | 结果 |
| --- | --- |
| profile 用应用收到的拼写（`/var/folders/…`），写入用内核的拼写（`/private/var/folders/…`） | **WROTE**（泄漏） |
| profile 用 canonical 拼写生成 | NO-WRITE |

推论（这是原型的结论之一，不是我的偏好）：**profile 必须由 `realpath(工作区)` 生成；
并且应用要在会话启动时用一次「探针写入」验证隔离真的生效**，而不是相信那个字符串。

### L1 与 L2：本票的动机和它的验收标准不是同一个要求

实验第 4 节是两者唯一分岔的地方：

| 观测 | 无隔离 | L1 只禁工作区 | L2 白名单外全禁 |
| --- | --- | --- | --- |
| 删除 `$HOME` 下的文件 | WROTE | **WROTE** | NO-WRITE |
| 覆写 `$HOME` 下的文件（`~/.zshrc`、`~/.ssh/authorized_keys`） | WROTE | **WROTE** | NO-WRITE |
| 在工作区旁边写一个产物文件 | WROTE | WROTE | **NO-WRITE** |

#124 开头那句「一个声明 `read` 能力的恶意技能脚本可以 `rm -rf ~`」只有 L2 回答得了；
AC 第 1 条（工作区）L1 就够。L2 的代价不是性能，是**能力**：会话从此只能写 TMPDIR、`<root>`、
应用数据目录。**这一条请由你拍板**（见第 7 节）。

---

## 3. Windows：最便宜的一档成立，并且不需要用户授权

（一手来源见 `prototype/isolation-decision/windows-sources.md`。）

**成立。** 免管理员档就是 Codex 的 `unelevated` 形状：`CreateRestrictedToken` 带
`DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED`，配合 restricting SID 与
`CreateProcessAsUserW`（对**自己令牌的受限版本**调用不需要 `SeAssignPrimaryToken` 特权；
`CreateProcessWithLogonW` 则明确「不需要任何特权」），外面套一个 Job 对象管住进程树、私有桌面。

- `WRITE_RESTRICTED`：**只对写**做第二次访问检查（读不看 restricting SID），所以
  「DACL 里没有该 restricting SID 的路径写失败」正是我们要的效果。
- 关键坑：**不要把 `Everyone` 或登录 SID 放进 `SidsToRestrict`**。Codex 放了，于是它必须警告
  「有些目录 Everyone 可写，沙箱保护不了」。
- **Job 对象本身不是文件边界**（它只管生命周期/内存/UI），文件边界由令牌/DACL 做。
- **AppContainer**（建 profile 不需要管理员）默认禁读一切：OpenAI 自己的文章说他们因此放弃了
  AppContainer；而且没有 `internetClient` 能力时网络也是断的——对需要 `tavily-cli` 的学习侧不合适。
- 想同时收**读取**，免管理员档做不到（Codex 源码原话：*"Restricted read-only access requires the
  elevated Windows sandbox backend"*）；那要 Codex 的强化档（一次性 UAC：两个本地账户 + DPAPI 存口令 +
  宿主路径 ACL + 防火墙 + 隐藏登录项），代价是真实的企业策略/升级失败风险。

**要用户授权吗，授权的是什么？** —— 这是向导票（另一张票）需要的唯一输入：

- 机制侧**两平台都不需要管理员**：macOS 用 `sandbox-exec`（不需要 root/entitlement/kext/MDM）；
  Windows 用受限令牌（不需要 UAC）。
- 唯一需要用户动作的是：macOS 的 **TCC**（不是本机制的一部分，且 FDA/辅助功能只能用户手动加），
  以及 Windows **可选**的强化档（UAC 一次）。
- Node 侧没有任何安全上下文旋钮（`child_process` 的 Windows 选项只有 `detached`/`windowsHide`/
  `windowsVerbatimArguments` 之类），所以 Windows 这一档必须由 Rust 写原生代码：`windows-sys` 有
  `CreateRestrictedToken`/`CreateProcessAsUserW`/`CreateAppContainerProfile`，但没有维护中的 crate
  直接复用 Codex 的实现。

---

## 4. 代价（AC 第 3 条，全部实测）

| 项目 | 实测 | 说明 |
| --- | --- | --- |
| 每次工具调用（**只有形态 2/3 才有这笔**） | `bash -c true` 中位 1.7 ms → `sandbox-exec …` 7.9 ms → 经 wrapper 16.4 ms | 相对模型延迟可忽略；只影响路由形态 |
| profile 编译 | 1 条规则 10.6 ms、10 条 10.9 ms、100 条 18.2 ms、**500 条 149 ms** | 每个进程启动编译一次；**规则数不能随文件数增长** |
| 会话启动 | 沙箱本身对进程启动的增量 ≈ 0；RSS 不变 | `sandbox-exec` 只多一次 `exec` |
| 每模式一个进程（形态 4 的前提） | companion RSS **167 MB**，裸 node 48 MB | 拆分（ADR-0010 改动）多约 **+120 MB**，不是启动延迟 |
| 打包体积 | **+0** | profile + wrapper < 1 KB，`sandbox-exec`/受限令牌都是系统能力 |
| 对照：微虚拟机/容器 | 每会话 0.5~2 s 启动、+100 MB~GB 依赖 | 这是「强化档」的价格 |

---

## 5. 三条边界（AC 第 4 条）

1. **覆盖什么。** 被沙箱的那个会话**进程树内的一切文件写入**：companion 自己的代码、命令面技能
   脚本（子进程）、shell 工具及其全部后代；对工作区的写、重命名、删除、chmod、xattr 都**在系统层失败**；
   本机的路径别名（符号链接、硬链接、firmlink、`..` 拼写）与嵌套 `sandbox-exec` 都不构成逃逸。
2. **不覆盖什么（逐条，不含糊）。**
   - **进程内扩展**：它跑在被沙箱的进程里，所以它的**文件写入**被覆盖；它的**读取、网络、以及它手里
     的模型凭据不受限**（ADR-0010 已经写明「这是操作者自己的代码，带着操作者的凭据」）。要收读取，
     只有形态 5（容器/VM）或 Windows 的强化档/AppContainer。
   - **凭据**：留在宿主、留在 companion 进程内。进程级沙箱不搬运凭据；形态 5 才会把凭据带进沙箱。
   - **宿主的其它路径**：L1 完全不覆盖（`rm -rf ~` 仍然可以）；L2 覆盖写入，但**不覆盖读取**——
     整个文件系统仍可读，包括 `~/.ssh`。
   - **网络**：不覆盖，且必须允许（模型调用、`tavily-cli`）。
   - **macOS TCC 与签名**：seatbelt 子进程默认继承宿主 app 的 TCC 身份，所以给 app 授权
     （Full Disk Access / 辅助功能）等于给沙箱里的会话授权。这一条要写进 ADR。
   - **创作侧**：不受影响（不沙箱，工作区可写）。若将来要给创作侧也加隔离，只能是「除工作区外只读」，
     不能复用 L1 的 profile。
   - **应用自身**（Rust 宿主、webview、命令面之外的写入）不在沙箱内：它们不是 agent，写入是功能。
3. **与既有 ADR 的一致性。**
   - **ADR-0010 必须改**：它写的是「一个 Node companion 进程服务整个应用」。要按模式给出不同姿态，
     就得**每模式一个进程**（或至少学习侧独立）。凭据段不变。
   - **ADR-0011 需要补一句**：写入边界从「绕过命令面的写入是未校验，读者才是强制点」升级为
     「学习侧另有一层系统层保证，管的是工作区（L1）或几乎所有写入（L2）」，并保留「未校验」的说法。
   - **ADR-0014（新）**：把「沙箱 / 外部隔离 / 平台授权 / 护栏」四个词分开；写明机制侧不需要管理员；
     平台授权只与 TCC 和可选强化档有关。

---

## 6. 实现时落在哪个接缝（避免把机制焊死在浅模块里）

- **唯一改动点**：`src-tauri/src/conversation.rs` 的 `start()`——它在 `env_clear()` + 五行白名单之后
  构造 `Command`。把「启动方式」抽成一个端口（例如 `session_sandbox`），由它决定
  `Command::new(node)` 还是 `Command::new("/usr/bin/sandbox-exec").args(["-f", profile, node, script, …])`，
  平台差异（macOS seatbelt / Windows 受限令牌 / 无隔离）都落在端口后面。
- **profile 的生成必须 canonical**，并配一次启动探针验证（第 2 节那个静默失效）。
- **不要在 companion 里加新的 spawn 包装**：那正是形态 3 的浅层做法——它把边界分散到每个 spawn 点，
  每加一处就是一处缺口。
- 技能脚本与 shell 工具**不需要知道沙箱存在**，也就不会被某个工具的实现细节重新打开。

---

## 7. 决定与仍待确认的事

1. **姿态：L2（白名单外全禁写）— 已定**（Veno，2026-09-17）。白名单三项：TMPDIR、用户级根目录 `<root>`、
   应用数据目录（学习者记录）。理由：L1 回答不了本票开头那句 `rm -rf ~`，而 L2 的实测性能代价为零，
   代价只在「技能不能在工作区旁边留产物文件」。实现时两份 profile 都留在原型里作对照。
2. **ADR-0010 的进程形态：随 ADR-0014 一起过**。进程级沙箱要求按模式一个 companion 进程
   （多约 120 MB RSS），并在 ADR-0010 里把「一个 Node companion 进程服务整个应用」改掉；
   若最终不接受，就退回形态 2/3，并把技能脚本与进程内扩展写进「不覆盖」清单。

机制选择本身（形态 4 + macOS seatbelt + Windows 受限令牌）不建议留口子：本票 AC 第 1 条要求的那条
「刻意构造、能绕过守卫的命令」，今天最便宜的一条就是技能脚本，而只有进程级沙箱覆盖得了它。
