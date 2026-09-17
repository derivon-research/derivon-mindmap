# 一次性原型：外部隔离（issue #124）

**这是原型的产物，不是实现。** 全部文件可丢弃；仓库里没有任何产品代码被改动。
结论在 `findings.md`，票里 AC 第四条要的三条边界在 `findings.md` 第 5 节。

## 三个命令

```sh
node prototype/isolation-decision/run-experiments.mjs   # 在这台机器上重跑 75 条观测 + 计时，写 evidence.json
node prototype/isolation-decision/build-demo.mjs        # 把 evidence.json 折进单文件 HTML
node prototype/isolation-decision/check-guard.mjs       # 直接问守卫：那条命令真的被放行吗
open prototype/isolation-decision/isolation-decision.html   # 双击也行
```

没有依赖，不需要构建。`run-experiments.mjs` 会自己造 `.scratch/`（工作区、两份 profile、`settings.shellPath`
指向的 wrapper、一个冒充技能脚本的 `skill.mjs`），跑完留着供人翻看，删掉即可。

## 文件

| 文件 | 是什么 |
| --- | --- |
| `findings.md` | **结论**：机制选择、量出来的代价、三条边界、实现接缝、需要拍板的两件事 |
| `windows-sources.md` | Windows 各档的一手来源（逐字引用 + URL），给实现时引用 |
| `run-experiments.mjs` | 实验：绕过守卫的命令、逃逸尝试、不能弄坏的东西、代价、companion 实测 |
| `check-guard.mjs` | 不算“读代码”而算证据：直接调 `guardDecision`，证明 3 条构造命令被放行、3 条对照被拒 |
| `evidence.json` | 机器可读证据：75 条观测（每条含退出码、内核原话、耗时）、10 组计时、2 条配置失效对照 |
| `learning-workspace-deny.sb.tmpl` | 姿态 L1：只禁工作区 |
| `learning-write-allowlist.sb.tmpl` | 姿态 L2：白名单（TMPDIR / `<root>` / 应用数据目录）外全禁写 |
| `demo.template.html` + `build-demo.mjs` | 证据面板的模板与打包（把 `evidence.json` 内联成单文件） |
| `isolation-decision.html` | 打开就能点：6 条走查、25 条命令 × 3 种姿态的观测矩阵、代价表、候选对照 |
| `issue-124-comment.md` | 待拍板后粘进 #124 的结论评论草稿（只改「待定」四项与三条边界） |

## 实验在测什么（每次运行都会重算，不写死）

- **1 条刻意构造、能绕过 `tool_call` 守卫的命令**：`node -e "…writeFileSync(工作区…)"`，写入形式词一个都没有。
  先跑对照组证明它真的写得进去，再跑沙箱。
- **技能脚本那条路**：`spawn(process.execPath, [script])`，完全不进守卫——本票最便宜的绕过。
- **逃逸尝试**：硬链接、符号链接、符号链接父目录、`..` 拼写、firmlink 别名 `/System/Volumes/Data`、
  嵌套 `sandbox-exec`、`xattr`。
- **不能弄坏的东西**：读工作区、TMPDIR 缓存、`<root>`、应用数据目录、网络。
- **配置失效对照**：用非 canonical 路径生成的 profile 会**静默**不生效。
- **代价**：每次工具调用的启动开销、profile 规则数的编译费、companion 的常驻内存（沙箱内外）。

判断逻辑写在 `attempt()` 里：每条观测都对着一个**设计预期**，不一致就打印 `CONTRADICTS` 并在
`evidence.json` 的 `contradictions` 里留痕。2026-09-17 这次运行：0 条不一致。

## 已知的取舍（别把它当产品件的质量）

- 只在 macOS 上跑过；Windows 那一档是文档证据，没有可执行的实验（`windows-sources.md`）。
- 计时数字受机器负载影响，别引用绝对值，引用「沙箱相对无沙箱的增量」。
- 面板默认读到的是**上次运行**记录下来的观测；要更新得重跑 `run-experiments.mjs` 再 `build-demo.mjs`。
- 探测文件只写在 `$TMPDIR`、`$HOME/.derivon-prototype-probe.txt`（跑完删除）和本目录的 `.scratch/`。
