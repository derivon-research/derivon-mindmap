# 草稿：#124 的结论评论（待 Veno 拍板后粘贴）

> 下面这一整块是要贴进 <https://github.com/derivon-research/derivon-mindmap/issues/124> 的评论正文。
> 它**改写的范围**严格是：票里的「待定」四项 + AC 第四条要的三条边界，不扩范围。

---

## 机制结论（带证据）

原型与证据在 `prototype/isolation-decision/`（一次性，不进产品代码；`README.md` 说了怎么复跑）。
macOS 26.6.2 / arm64 实测：75 条观测，0 条与设计不一致。

### 1. 隔离形态：把**会话进程**放进沙箱，不是把**工具执行**路由进沙箱

判据是「子进程及其后代是否被同一约束覆盖」。应用自己就 `spawn(process.execPath, [script])` 跑技能脚本
（`commandSurface.ts` 的 `run`），而这条路径**不进 `tool_call` 守卫**——`check-guard.mjs` 直接调
`guardDecision`：`node -e "…writeFileSync(工作区…)"`、`node -e "…workspace.json…"`、`node <技能脚本>`
三条全 `pass`，而 `printf > …`、`rm …`、`write` 工具三条全 `refused`。

于是：

- **路由形态**（`settings.shellPath` → wrapper）只覆盖 `bash` 工具那一支。实测：只有 `bash` 被包住时，
  技能脚本照写工作区。而且这条缝是 POSIX-only——`getPowerShellConfig()` 不接路径参数，SDK 的
  `AgentSession._buildRuntime` 只把 `shellPath` / `shellCommandPrefix` 交给 `createAllToolDefinitions` 的
  `bash` 那一项。
- **进程形态**一次覆盖全部：companion 自身代码、命令面脚本（子进程）、shell 工具及其全部后代。

**决定：进程形态。** 需要改 ADR-0010 的进程形状（见第 4 点）。

### 2. AC 第 1 条与第 2 条

被刻意构造、能绕过守卫的那条命令在沙箱下写不进工作区；同一批实验里，写工作区文件、改写工作区清单、
shell 重定向、`cp`/`mv` 进工作区、`rm`、`chmod`、`xattr`、`mv` 出工作区、孙进程（`bash → sh → sh`）
全部 `Operation not permitted`。逃逸尝试也全部失败：硬链接、符号链接、符号链接父目录、`..` 拼写、
macOS firmlink 别名 `/System/Volumes/Data`、子进程再套一层「全允许」的 `sandbox-exec`。
必须继续能用的照旧能用：读工作区、TMPDIR 缓存、`<root>`、应用数据目录、网络请求。创作侧不沙箱，不受影响。

**一个必须写进实现的坑**：profile 用非 canonical 路径生成时**静默失效**（实测：规则匹配不到，写入成功）。
macOS 的 `/tmp`、`/var`、`/etc` 都是符号链接，任何经符号链接打开的路径也是。所以 profile 必须由
`realpath(工作区)` 生成，并且会话启动时用一次探针写入验证隔离真的生效。

### 3. AC 第 3 条：代价（实测）

| 项目 | 实测 |
| --- | --- |
| 每次工具调用（**只有路由形态才有**） | `bash -c true` 1.7 ms → `sandbox-exec` 7.9 ms → 经 wrapper 16.4 ms |
| profile 编译（每进程一次） | 1 条规则 10.6 ms / 10 条 10.9 ms / 100 条 18.2 ms / **500 条 149 ms** → 规则数不能随文件数增长 |
| 会话启动 | 沙箱增量 ≈ 0（只多一次 `exec`）；RSS 不变 |
| 每模式一个进程（进程形态的前提） | companion 常驻 **167 MB**，裸 node 48 MB → 拆分多约 **+120 MB** |
| 打包体积 | **+0**（profile + wrapper < 1 KB，`sandbox-exec` 是系统能力） |
| 对照：容器/微虚拟机 | 每会话 0.5~2 s 启动、+100 MB~GB 依赖（见「不采用的那一档」） |

### 4. AC 第 4 条：三条边界

1. **覆盖**：被沙箱的会话进程树内的一切文件写入，含对工作区的写/重命名/删除/chmod/xattr；本机路径别名与嵌套
   `sandbox-exec` 不构成逃逸。
2. **不覆盖**：（a）**进程内扩展的文件写入被覆盖**（它跑在被沙箱的进程里），但它的**读取、网络与手里的模型
   凭据不受限**——ADR-0010 已写明「操作者自己的代码，带着操作者的凭据」；（b）**凭据留在宿主、留在进程内**，
   进程级沙箱不搬运凭据；（c）**宿主的其它路径**：只禁工作区时不覆盖（`rm -rf ~` 仍可），白名单姿态覆盖写入但
   **不覆盖读取**（整个文件系统仍可读）；（d）**网络**不覆盖且必须允许；（e）**macOS TCC 与签名**：seatbelt 子进程
   默认继承宿主 app 的 TCC 身份，给 app 授权等于给沙箱里的会话授权；（f）**创作侧与宿主应用自身**不在沙箱内。
3. **与既有 ADR 一致**：ADR-0010 的「一个 companion 进程服务整个应用」要改成按模式一个进程；
   ADR-0011 要补一句「学习侧另有一层系统层保证，管的是工作区（或白名单外的几乎所有写入）」；
   新立 ADR-0014 把「沙箱 / 外部隔离 / 平台授权 / 护栏」四个词分开。

### 5. 待定四项的答复

- **隔离形态**：工具执行路由（选项 1）否；进程级沙箱（选项 2 的进程版本）是。理由见上。
- **per-session 还是 per-workspace**：**per-session（按模式一个进程）**。per-workspace 常驻会让两种模式共用
  一个进程，而它们的隔离姿态必须不同（创作侧要写工作区）。代价是约 +120 MB RSS。
- **凭据**：**留在宿主、留在 companion 进程内**（进程级沙箱不改变凭据位置；文档里的「凭据随进程进容器」
  是容器/VM 那一档的代价，本票不采用）。
- **与 #121 扩展的关系**：扩展跑在被沙箱的进程里，所以它的**文件写入**在隔离之内；它的读取、网络与凭据在隔离
  之外。这一条进 ADR-0014 的边界，不含糊。

### 6. 平台与授权（这是向导票的唯一输入）

- **macOS**：`/usr/bin/sandbox-exec`（seatbelt）**零授权**——不需要 root / entitlement / kext / MDM；
  仍随系统分发（Apple 已弃用、SBPL 不面向第三方，产品风险要写进 ADR-0014）。
- **Windows**：免管理员档 = `CreateRestrictedToken(DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED)`
  + restricting SID + `CreateProcessAsUserW` + Job 对象 + 私有桌面（Codex 的 `unelevated` 形状）。
  **不需要 UAC**。两个坑：restricting SID 里**不能放 `Everyone` 或登录 SID**（Codex 放了，于是它必须警告
  「Everyone 可写的目录保护不了」）；这一档**不覆盖读**限制（Codex 源码原话：*"Restricted read-only access
  requires the elevated Windows sandbox backend"*）。AppContainer 免管理员但默认禁读（OpenAI 自己因此放弃它）
  且无 `internetClient` 时断网，不适合学习侧。Node 层没有任何安全上下文旋钮，Windows 这一档必须由 Rust 写原生
  代码（`windows-sys` 有 `CreateRestrictedToken`/`CreateProcessAsUserW`/`CreateAppContainerProfile`）。
  来源清单：`prototype/isolation-decision/windows-sources.md`。
- **要用户授权的，只有** macOS 的 TCC（且与本机制无关，FDA/辅助功能只能手动加）和 Windows **可选**的强化档
  （Codex 式本地账户 + 防火墙 + DACL，一次性 UAC）。所以「首次运行向导」不该被这段机制逼出任何提权步骤。

### 7. 不采用的那一档

容器/微虚拟机（Docker / OpenShell / Gondolin / microsandbox）是**可选强化档**：每会话 VM 启动 0.5~2 s、
+100 MB~GB，macOS 需要虚拟化、Windows 需要 WHP 或提权；它唯一额外买到的是**读取收口**与文件系统视图，
以及把凭据一起关进去（Pi 的 `containerization.md` 点名的代价）。本票的 AC 不需要它。

---

## 已经定下来的一件

**姿态 = L2（白名单外全禁写）**，白名单是 TMPDIR / 用户级根目录 `<root>` / 应用数据目录（Veno，2026-09-17）。
所以写进 ADR-0014 的是「学习侧的写入只发生在 TMPDIR、用户级根目录与应用数据目录」；两份 profile 的实现对照
（L1 / L2）留在证据分支上。

## 仍留一个

**ADR-0010 的进程形态**：进程级沙箱要求按模式一个 companion 进程（约 +120 MB RSS），并改掉 ADR-0010 里
「一个 Node companion 进程服务整个应用」那句；若最终不接受，就退回路由形态，并把技能脚本与进程内扩展
写进「不覆盖」清单。

---

**证据分支**：`proto/issue-124-isolation-evidence`（丢弃分支，不在 `main`）下的 `prototype/isolation-decision/`，
包含实验脚本、`evidence.json`、两份 profile、证据面板与 `findings.md`。
