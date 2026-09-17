# Windows 隔离档：一手来源清单

配合 `findings.md` 第 3 节。每条都是给实现时引用的，逐字引用 + URL；标 `[未核]` 的是推断。

## 受限令牌（免管理员档）

- `WRITE_RESTRICTED`：*"The new token contains restricting SIDs that are considered only when
  evaluating write access."*
  — <https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken>
- 两次检查：*"The system performs two access checks: one using the token's enabled SIDs, and another
  using the list of restricting SIDs. Access is granted only if both access checks allow the requested
  access rights."* → DACL 不授予 restricting SID 的路径**写**失败，即使 DACL 给了用户自己的 SID。
  — <https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens>
- 免特权启动：*"If a process calls CreateProcessAsUser using a restricted version of its own token,
  the calling process does not need to have the SE_ASSIGNPRIMARYTOKEN_NAME privilege."*
  — 同上；另见 <https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasusera>
  （`CreateProcessWithLogonW` 明确 *"requires no special privileges"*）
- `SeIncreaseQuotaPrivilege`：文档只说 *"Typically … may require"*，对「自身令牌的受限版本」没有明确
  豁免语句。`[未核]`：Codex 与 Chromium 都在免提权场景下用 `CreateProcessAsUserW`，实践上不需要。
- Codex 源码（免管理员档的形状：`DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED`，
  restricting SID 里**含登录 SID 与 Everyone**，`CreateProcessAsUserW` + Job 对象 + 私有桌面）：
  <https://raw.githubusercontent.com/openai/codex/main/codex-rs/windows-sandbox-rs/src/token.rs>
  、<https://raw.githubusercontent.com/openai/codex/main/codex-rs/windows-sandbox-rs/src/process.rs>
- 它的已知边界（源码原话）：*"WRITE_RESTRICTED tokens consult restricting SIDs only for writes, so
  this backend cannot make capability-SID deny-read ACLs authoritative"*、
  *"Restricted read-only access requires the elevated Windows sandbox backend"*
  — <https://raw.githubusercontent.com/openai/codex/main/codex-rs/windows-sandbox-rs/src/lib.rs>
- OpenAI 自己的描述：`unelevated` *"is weaker than `elevated`"*，且 *"Codex may warn that some folders
  are writable by `Everyone`… Windows permissions on those folders are too broad for the sandbox to
  fully protect them."* — <https://developers.openai.com/codex/windows/windows-sandbox>

**给本项目的直接结论**：restricting SID 只用**新建的、任何既有 DACL 里都不存在的** SID，
绝不放 `Everyone` / 登录 SID，否则会出现「某些目录保护不了」。

## AppContainer（免管理员，但默认禁读禁网）

- 建 profile 无特权要求：*"per-user, per-app profile"*，失败码 `E_ACCESSDENIED` *"if the caller
  doesn't have permission"* — <https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile>
- 默认拒绝：*"AppContainer SIDs (Package and Capability SIDs) are separate from the traditional user
  and group SIDs with both portions of the token being required to grant access to a protected resource
  via the object's discretionary access control list (DACL)."* — <https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer>
- 网络：*"without the network capability, an AppContainer cannot access the network"* — 同上；
  Chromium 侧确认：*"network checks are enforced if the token is a Low Box token and the INTERNET_CLIENT
  Capability is not present"* — <https://chromium.googlesource.com/chromium/src/+/HEAD/docs/design/sandbox.md>
- 给一个用户自己拥有的目录加 ACE（只读共享）不需要提权：*"The caller must have WRITE_DAC access to
  the object or be the owner of the object."* — <https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-setnamedsecurityinfoa>
- OpenAI 评估后放弃 AppContainer 的理由：*"AppContainer's default-deny posture for filesystem reads
  made it impractical"*（`[未核]`：仅从搜索摘要看到，原页 403）— <https://openai.com/index/building-codex-windows-sandbox/>

## Job 对象（不是文件边界）

- 官方分类只有 limits / notifications / accounting / lifetime，枚举的结构里没有任何文件访问项。
  — <https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects>
- 用途是**进程树归属**：子进程默认加入 job（除非设 breakaway）。同上。

## 完整性级别（免管理员的「更便宜只读」）

- *"a principal with a low integrity level cannot write to an object with a medium integrity level,
  even if that object's DACL allows write access"*、*"Objects that lack an integrity label are treated
  as medium by the operating system."* — <https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control>
- Microsoft 自己的做法是 `OpenProcessToken` → `DuplicateTokenEx` → `SetTokenInformation(…TokenIntegrityLevel…)`
  → `CreateProcessAsUser`，没有提权步骤 — <https://learn.microsoft.com/en-us/previous-versions/dotnet/articles/bb625960(v=msdn.10)>
- 漏洞：低完整性可写的位置仍然可写（`AppDataLow`、低标签目录等）— Chromium 列过这份清单。

## 强化档（需要管理员）与其它运行时

- Codex 强化档：专用低权账户、文件权限边界、防火墙规则、本地策略 — <https://developers.openai.com/codex/windows/windows-sandbox>
  （失败模式含 *"the Windows UAC or administrator prompt was declined"*、错误码 1385）
- MXC `wxc-host-prep.exe`：*"privileged-by-manifest … The binary has `requireAdministrator` baked into
  its embedded application manifest in release builds"*；`prepare-system-drive` 是 *"a one-time,
  host-wide setup step"*，`prepare-null-device` 要 *"once per boot"* — <https://github.com/microsoft/mxc/blob/main/docs/host-prep.md>
- microsandbox（libkrun）：*"Windows support is currently in preview … enable Windows Hypervisor
  Platform (WHP)"*，需提权 PowerShell 并重启 — <https://docs.microsandbox.dev/troubleshooting/windows.md>
- Docker Desktop：单用户安装 *"does not require administrator privileges"*，但 *"Enabling WSL 2 for the
  first time also requires administrator privileges"*；Windows 容器要全用户（管理员）安装 —
  <https://docs.docker.com/desktop/setup/install/windows-install/>
- Defender Application Guard 已弃用：*"Starting with Windows 11, version 24H2, Microsoft Defender
  Application Guard … is no longer available."* — <https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/microsoft-defender-application-guard/reqs-md-app-guard>

## 集成现实

- Node 的 `child_process` 没有任何安全上下文旋钮（Windows 相关只有 `cwd`/`env`/`argv0`/`stdio`/
  `detached`/`serialization`/`shell`/`windowsVerbatimArguments`/`windowsHide`/`signal`/`timeout`/
  `killSignal`；页面全文搜索 "job"/"token"/"AppContainer"/"restricted" 无匹配）—
  <https://nodejs.org/api/child_process.html>
- Rust：`windows-sys` 提供 `Win32_Security::CreateRestrictedToken`、
  `Win32_System_Threading::{CreateProcessAsUserW, CreateProcessWithLogonW}`、
  `Win32_Security_Isolation::CreateAppContainerProfile`。`process-wrap` 只有 `job-object`，没有令牌/AppContainer；
  **没有维护中的 crate 复刻 Codex 的 Windows 沙箱**（`codex-windows-sandbox` 未发布到 crates.io）。
