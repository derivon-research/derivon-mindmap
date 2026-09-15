# Pi runtime extension guide

This guide records how the desktop Pi companion is extended after the first streaming
slice. The architecture is fixed by
[ADR-0010](../adr/0010-pi-sdk-companion-process.md).

## Layers

1. **Webview**
   - Renders the shared agent panel.
   - Sends user input and model choices through `ConversationProvider`.
   - Never imports Pi SDK, never touches credentials, and never starts a process.

2. **Tauri Rust**
   - Owns the companion process and its IPC bridge.
   - Starts the companion lazily and stops it on application exit.
   - Forwards JSON events and commands between the webview and companion.

3. **Node companion**
   - Owns `AgentSession`, `ModelRuntime`, settings, and model discovery.
   - Reads the application's own `models.json` and `auth.json` from the user-level Derivon
     root Rust passes as `--config-dir`. It never reads `~/.pi/`.
   - Runs one process with one session per mode.

## The user-level root is one directory

```text
~/.derivon/                 # %USERPROFILE%\.derivon\ on Windows
├── models.json             # provider and model definitions
├── auth.json               # credentials
├── selected-models.json    # the model each mode is on (the companion's)
├── skills/                 # skills and their command-surface scripts (#104, #122)
├── extensions/             # user Pi extensions (#121)
└── bin/                    # the `node` a session's shell finds (#129)
```

`derivon_root` in `src-tauri/src/conversation.rs` is the only place that spells the
user-level root (`workspace.rs` spells the different, workspace-local `.derivon`); the
companion receives the directory and does not know where it came from. ADR-0010 records
why it is one root on every platform rather than each platform's own convention.

- **Learner records are not here.** They are application data, keyed by workspace, and
  stay in the app-data directory ([learner records](../learner-records.md), ADR-0009).
- **The old location is not read.** Before this root existed the two files were read from
  `app_config_dir()`; nothing reads that directory now, and there is no migration — a
  configuration left there produces the ordinary “no `models.json`” diagnosis, which names
  the root that is read.
- **Both `skills/` and `extensions/` are read**: the companion discovers one command surface per
  workspace under `<root>/skills` and `<workspace>/.derivon/skills` ([the command surface, as the
  companion wires it](#the-command-surface-as-the-companion-wires-it)), and loads the operator's own
  Pi extensions from `<root>/extensions` and — for a trusted project — from
  `<workspace>/.derivon/extensions` ([the extensions a session may
  hold](#the-extensions-a-session-may-hold)). Neither root is `~/.pi/`, which this application never
  consults, and neither is where Pi's own skills or extensions live.

## Provider/model configuration

`src/companion/modelConfiguration.ts` owns this. Its interface is one function of one
argument — `openModelConfiguration(configDir)` — and everything else about where models
come from sits behind it. Extend it there, not at the call sites.

- Discovery and credentials both come from `<root>/models.json` and `<root>/auth.json`,
  in Pi's file syntax. Rust resolves the root from the user's home directory and passes it
  as `--config-dir` (see above).
- A provider is offered only when `ModelRuntime.getProviderAuthStatus` attributes its
  credential to one of those files (`stored`, `models_json_key`, `models_json_command`).
  `environment` and `fallback` are refused: they mean the operator's machine configured
  it, not this application. See ADR-0010.
- The catalog store Pi can persist is held in memory, so no `models-store.json` is written.
  This application never refreshes a catalog over the network (`allowModelNetwork` is left
  off), and the root is meant to hold the operator's files and nothing else. Pi's own
  in-memory store is not exported from the SDK entry point; the contract is restated in
  `modelConfiguration.ts`.
- Do not reintroduce a path to `~/.pi/`, and do not hardcode a provider or model.
- Each mode remembers its own selected model; switching modes does not change the other
  mode’s selection.

## The protocol is defined once

`src/companion/protocol.ts` is the contract between the webview and the companion, in
terms of the port's own types. Both ends import it; Rust does not know it.

- Tauri exposes exactly one command, `conversation_request`, which carries a payload
  through untouched. Rust reads only the envelope it adds itself (`id`) and the
  `type: "event"` / `mode` fields it routes on.
- Do not add a second Tauri command per request kind, and do not restate a payload field
  in Rust. A field renamed in `protocol.ts` must not be able to desynchronise a copy
  kept somewhere else — that is the whole reason this file exists.

## One turn at a time, except to stop one

`send`, `setModel` and `new` are serialized per mode: a mode's session is asked one thing
at a time, and a `send` holds its place until its turn ends. `abort` is deliberately not
on that queue. Queued behind the send it was meant to stop, it could only ever arrive once
that turn had already ended on its own, which is what “停止生成” did before. It reaches
`session.abort()` directly instead. The interrupted turn still reports itself through its
own response — a `settled` event, then the send's reply — and aborting neither replaces
nor suppresses those.

## The companion owns the model selection

Which model a mode is on is the companion's, remembered in
`<root>/selected-models.json` and reported back on `listModels`. The panel renders
it and never stores it: the session lives on the companion's side, so a second copy in
the webview could only ever disagree. A remembered model that the catalog no longer
offers falls back to the first available one rather than being reported as selected.

## The bundled Node runtime is found, not guessed

`node_path()` looks beside the executable for the `externalBin` sidecar and fails by name
when it is absent. It never falls back to a `node` on `PATH`: the application must not
require one, and borrowing the developer's would let a bundle ship without its sidecar
and still work on the build machine.

Tauri's own sidecar resolution lives in `tauri-plugin-shell`. It is deliberately not used
here: this application has no Tauri plugins and a capability set of `core:default` plus
one window permission, and adding shell execution to a webview that needs none would be a
larger security surface than the twelve lines it replaces.

## Working directory

The companion roots each session at the workspace the application has open: the webview
calls `ConversationProvider.setWorkspace(workspaceId)`, and on the desktop host that
identifier is the workspace directory (`src/hosts/desktop/desktopWorkspaces.ts` is the
only place a desktop `WorkspaceHandle.id` is made).

- Pi fixes `cwd` when a session is created and offers no way to move it, so changing
  workspaces ends the sessions rooted at the old one.
- Disabling the built-in tools does **not** make `cwd` irrelevant: Pi appends
  `Current working directory: <cwd>` to the system prompt either way, and `cwd` also keys
  project settings, project resource discovery and session metadata. The companion
  supplies its own `ResourceLoader` and in-memory `SessionManager`, and reads no
  document through Pi; what it reads out of the workspace is the manifest's
  `graph`, for the `derivon` tool, and the roots a session is built from — the workspace's
  skills, and its extensions when the project is trusted — and the one thing it is rooted at is
  the session's own workspace, not a path a call can name.
- Pi does not check that `cwd` exists; a missing directory fails much later and
  obscurely. The companion checks before creating a session and refuses by name.

## Diagnosis

An empty catalog is a configuration state, not an error, so it travels as
`{ models: [], diagnosis }` rather than a rejected promise. Anything that discards
evidence on the way to the panel is a regression:

- The companion surfaces `ModelRuntime.getError()` and names the files it read.
- Rust pipes the companion's stderr, keeps the recent lines, and quotes them when the
  process exits unexpectedly. Do not route that stream to `/dev/null` again.
- The panel renders the diagnosis next to “没有可用模型”; it must not collapse a rejected
  `listModels()` into a bare empty list.

## Prompt and tool extension

- Compose the system prompt in the companion, per mode, from the session's grant table — never by
  branching inside the webview, and never as a second list of what a mode may do.
- **Built-in tools start disabled**, and a mode *grants* the ones it needs: a tool is either a
  script command wrapped with Pi’s custom tool API, one of the mode’s own custom tools below, or
  a built-in the mode asks for — both modes grant `read` and the platform’s shell, so a user can
  run something like `tavily-cli` while learning and the model can read the documents it works on.
  The apparatus is `settings.defaultTools` (an empty array
  disables the built-ins while keeping extension and custom tools) plus the session’s `tools`
  allowlist, not `noTools: 'all'`, which also filters custom tools out. Pi's built-ins are all
disabled to begin with; a mode's grant table names the ones it wants, and the operator's own
extensions add their tools to the same allowlist
([the extensions a session may hold](#the-extensions-a-session-may-hold)) — so a grant is what a
mode asks for, not the limit of what a session can hold.
- **What a mode must not do is refused as an operation class, not by removing the tool.** The
  companion registers an inline extension whose `tool_call` hook blocks the call — in the
  learning session, one that would write inside the workspace — and leaves every other call
  alone. A guard is a fence, not a sandbox: no shell-string inspection is complete, and the
  property that always holds is that an unmediated write is *unvalidated* and the reader enforces
  the artifact. Isolation outside this process is what would make it a guarantee; it is not built
  ([#123](https://github.com/derivon-research/derivon-mindmap/issues/123)).
- The capability words and the rule that a session holds the intersection of command → capability
  and mode → capability have one owner — ADR-0011 and `CONTEXT.md` — so do not restate them here
  and do not keep a second list in the companion. *Which tools a mode holds* is a different axis
  from *what a command may change*, and the glossary owns both words.
- The learning session holds no write **capability**: “learning mode cannot edit” is structural for
  workspace content and for learner records alike — no command registered in that session changes
  either, and the guard refuses the workspace writes a granted `bash` could otherwise perform. A
  learning session reads learner records through `read-learner-record` and writes none, because a
  record is written either by the application’s own learning actions or by the command surface
  with no client running ([learner records](../learner-records.md)).
- The learning session registers exactly two custom tools of its own, both of them application
  state: setting or appending a goal, and requesting a route recompute (entering preview). The one
  other custom tool it holds, `derivon`, belongs to both modes and changes nothing. There
  is no step-advance tool: a route’s current step is derived from mastery, so there is no
  cursor to move.
- Authoring is the only mode that registers script commands writing workspace content;
  compose them into the authoring harness only.

Both modes build their session with the built-in tools disabled and an explicit grant. The tool
sets above are what the v1.0.0 tickets build (#50 for the learning side, #104 for authoring).

## The command surface, as the companion wires it

`src/companion/commandSurface.ts` owns this, and `src/companion/systemPrompt.ts` owns the
prompt. The command surface itself stays in the user's installed skill —
`<root>/<skill-dir>/scripts/derivon-workspace.mjs` — and the companion only wraps it: it keeps
no command list of its own, so the two cannot drift apart.

- **Discovery is Pi's**, through the SDK's own `loadSkills`, with the two roots passed
explicitly and `includeDefaults` off: `<config-dir>/skills` — the user-level root Rust passes as
`--config-dir`, spelled the way it arrived rather than by reading `HOME` here — and
`<workspace>/.derivon/skills`. Pi's semantics come with it: one directory per skill, `SKILL.md`
marks the root, the first hit wins, and a name collision is a diagnostic rather than a silent
choice. Pi's order puts the user-level root first, so a user-level skill wins over a project-level
one of the same name; that is Pi's rule, adopted here so a skill is discovered exactly as Pi would
discover it. Pi's own skill directories are never among the roots, so nothing is read from `~/.pi/`.
- **The skills travel to the session, not just their scripts.** The same `loadSkills` call that
finds the command surface supplies the session's skills, so the skills the surface draws from and
the ones the prompt lists are decided together. What enters the prompt is Pi's progressive
disclosure and nothing more — name, description and `SKILL.md` path; the model opens the file with
`read` when the description matches the task, which is why a skill that ships only a `SKILL.md` is
a usable skill. No skill body is injected into a prompt. A root that does not exist is not a
diagnostic, but a `description is required`, an unreadable file or a name collision is, and reaches
the operator on stderr under `[skills]` — the surface's own notes stay under `[command surface]`.
- **Every tool is derived from `--capabilities`.** A granted command becomes one custom tool
whose parameters come from that command's own `argv` and `stdin` declarations in camel case,
with the workspace root supplied by the companion — never a parameter, since ADR-0011 fixes it
for the session. The schema is plain JSON Schema rather than a TypeBox one, which Pi accepts and
which keeps `typebox` out of this application's dependencies; a command that reads a document on
stdin gets one free-form object parameter, because the surface publishes a schema *name* and a
prose shape rather than a machine-readable description, and the command validates its own input.
- **The envelope text is the tool result.** Exit 0 and exit 1 are both successful calls — the
model has to be able to read `issues[].code` and retry — while exit 2 and anything that does not
print a `derivon.command-result/v1` envelope are tool errors the model reads as failures. The
child runs under `process.execPath`, the sidecar Node Rust started the companion with, never a
`node` from `PATH`.
- **The prompt lists what the grant table holds**, in the same order the tools are built from it,
so a command cannot appear in the prompt and not in the session or the other way round. The same
rule covers the mode-level tools: `systemPrompt` is given the session's own tool list, and the
paragraph about `derivon` appears only when that list names it.
- **No installed skill is a configuration state, not an error.** No tool is registered, one line
on stderr names both roots that were searched, and the session still works — the same shape as an
empty model catalog, whose own rendering in the panel is a separate change rather than something
this ticket reaches. The surface is read when a session is built, not kept from the last one, so
a skill the operator installs while the application runs reaches the next session.

- Extension loading is the other configuration state that travels on the same reply. A load that
  failed, a root that could not be read, and a project root that was skipped because the project is
  not trusted each become an `[extensions]` line on stderr and a note in the `models` reply's
  `diagnosis`, beside the catalog's own reason. A broken extension must not be able to fail a
  session, a model list or the process — and must not be dropped either: the operator wrote that
  code, and is owed the reason it did nothing.

## The extensions a session may hold

`src/companion/extensions.ts` owns this. An extension is the operator's own code: it can register
tools, handlers and providers into a session, and the application does not decide what it may do
with it. There are two roots — the user-level `<root>/extensions`, and the project-level
`<workspace>/.derivon/extensions`.

- **Discovery and loading are Pi's**, through the SDK's `discoverAndLoadExtensions`: the same
  one-level rules (a `*.ts`/`*.js` file, a directory with `index.ts`/`index.js`, a `package.json`
  declaring `pi.extensions`), the same TypeScript transform, and the same load errors. What this
  application supplies is the two roots and the working directory the load happens in.
- **The loading working directory is the application's own root, never the workspace.** Pi's
  discovery adds `<cwd>/.pi/extensions` as a root of its own and offers no argument that turns it
  off, so a loading cwd inside a workspace would let that workspace's `.pi` tree be loaded with no
  trust decision at all; `<root>` is a directory a workspace cannot write. An extension's `pi.exec`
  without an explicit working directory therefore starts there rather than in the workspace, while
  `ctx.cwd`, which is what a registered tool's own handler reads, is the session's.
- **A project's extensions wait for trust.** The project root is loaded only when the operator has
  written its path, or an ancestor's, into `<root>/trust.json` with `true` — `{ "/work/graph": true }`,
  the same shape and the same nearest-ancestor rule as Pi's own trust file, read from this
  application's root. This application has no prompt that writes it and takes trust from nothing
  else, so it is a file the operator edits, like `models.json`; a store that cannot be parsed trusts
  nothing and says so. Nothing written *below* the project can trust it: a workspace cannot vouch
  for itself.
- **The tools an extension registers are part of the session's tool set.** A session's allowlist is
  the mode's grant table plus the names the loaded extensions registered, so a tool the operator
  installed is usable and not merely present — and an extension that registers `write` or `bash`
  puts it in the session. That is the point rather than a leak: the client's tool set is not a
  capability limit, and the boundary that holds is the artifact
  ([ADR-0011](../adr/0011-change-workspace-content-through-the-script-command-surface.md),
  [ADR-0010](../adr/0010-pi-sdk-companion-process.md)). The learning session's guard reads tool
  names and arguments and not their origin, so it fences an extension's `write` exactly as it would
  fence Pi's.
- **One load serves one session.** Pi binds a runtime's actions when the session is built, so two
  sessions sharing one runtime would have one session's own `pi.sendMessage()` arrive in the other.
  The load is per (mode, workspace), and the panel's configuration read shares it: what the panel
  reports and what the session holds come from one execution of the operator's code, not two. That
  also makes the panel's read a place where that code first runs — Pi's own CLI does the same when
  it starts — and the project root is behind the trust decision either way. The load is read again
  for the next session, so an extension installed while the application runs reaches the session
  after it.
- **The shipped bundle carries the modules an extension imports.** The companion is one file beside
  the Node runtime and ships no `node_modules`, so `scripts/build-companion.mjs` defines
  `PI_BUNDLED_NODE`: with it Pi's loader resolves `@earendil-works/pi-coding-agent`, `typebox` and
  the rest out of the bundle, and without it an extension that imports any of them would load on the
  build machine and fail in the installed application.
- **Nothing installed is not a diagnostic**, the same rule the skills follow. What is reported is a
  load that failed and a project root that was skipped, and both are reported twice on purpose: on
  stderr for the operator reading the process, and in the reply the panel renders.

## The graph reads and queries, as the companion wires it

`src/companion/cliTool.ts` owns one tool and nothing else. The recipes the skills carry for reading
and querying a graph all go through `derivon`, and before this the session had no way to ask them:
the command surface audits and changes the workspace and answers nothing about reachability. It is a
thin shell, not a family of tools and not a structured operation table.

- **Its input is the CLI's own words.** One parameter, `argv`: the command and its flags, with no
  program name. Nothing else is interpreted, so the tool keeps no second command list and cannot
  drift from the syntax the skills and `derivon <command> --help` describe.
- **The graph is the session's, twice over.** The manifest's `graph` is sent to the CLI on stdin,
  and `--input` — the one global option that would read a graph from a file — is refused before
  anything runs. The workspace is the session's own, closed over when the tool is built, the same
  as every command tool's workspace root (ADR-0011).
- **Both modes hold it, and it has no capability.** `derivon` is a stateless processor that never
  writes a file — even `point add` and `apply` print their result — so a call changes nothing and
  there is no capability to intersect. That it changes nothing is what puts it outside the command
  surface; changing workspace content still goes only through that surface.
- **The child is the operator's installation.** It is spawned by name on the PATH the companion
  was started with (Rust passes the application's own through), rooted at the workspace, and the
  child runs as the operator with their permissions: a commissioned CLI, never a copy shipped
  beside the companion, and never the sidecar `node`. A CLI installed somewhere that PATH does not
  carry is therefore a session-environment problem rather than this tool's. A missing CLI is a
  readable tool error that points at the `derivon-cli` skill for installation and updating;
  version policy stays there, and the companion checks none.
- **The answer is the CLI's.** A clean run is its stdout and nothing added to it, so a query's JSON
  arrives as printed; anything on stderr and a non-zero exit are appended rather than thrown,
  because an unreachable target and a refused argument are different answers and the model has to
  tell them apart — the same reason the command surface treats its own diagnostics as a successful
  call.
- **One runner, two children.** `src/companion/childProcess.ts` holds the spawn, the two streams,
  the stdin write and the abort, so the surface's script under the application's Node and the
  operator's CLI by name share one implementation of the parts that are easy to get wrong.

## The guard the learning session carries

`src/companion/guard.ts` owns it: one inline extension whose `tool_call` handler refuses the calls
that would write inside the workspace, registered only for the learning session and only when a
workspace is open. It reads the built-in tools' own arguments — `path` for `write` and `edit`, the
command text for `bash` and for `powershell` — and judges containment on the resolved real path, so
a symlinked parent does not hide where a write lands.

The shell rule is deliberately narrow, because the working directory *is* the workspace and every
relative path in a command therefore resolves inside it: only the arguments a write form actually
lands on are inspected (redirections, `tee`, `rm`, `mv`, `cp`'s destination, `sed -i`, `dd of=`, and
the like), while reads that merely name the workspace are left alone. Everything an interpreter, an
editor or an unfamiliar quoting can do is outside it, which is what "a guard is a fence, not a
sandbox" means in practice (ADR-0011).

PowerShell has its own rule rather than a shared one, because its write forms are cmdlets: a target
is a positional argument or a named path parameter, and each form declares which of those it writes
to — `Copy-Item`'s source is a read while `Move-Item`'s source is a removal, and `Set-Content -Path
x y` writes `x`, not `y`. The rule knows the names PowerShell itself ships for those cmdlets (`rm`,
`cp`, `ren` and the rest) as well as the long ones, because a rule that only knew the long name
would let the short one through. A parameter it does not know how to read becomes a positional and
is refused, which is the safe side. Its edge is the vocabulary: a cmdlet outside that table is not
seen at all — the same edge the POSIX rule has, where `/bin/rm` is not the word `rm`. It is the same
fence and no more: a script run by an interpreter, another provider, or an encoding this does not
know is outside it, and real isolation is the OS or container boundary ADR-0011 defers to
([#123](https://github.com/derivon-research/derivon-mindmap/issues/123)).

So is the command surface itself: a granted command is an arbitrary script the operator installed
(or the workspace carries), run with the companion's full permissions, and the guard never sees it.
A capability declaration is a contract the surface keeps, not something the companion enforces;
what the reader enforces is the artifact ([#123](https://github.com/derivon-research/derivon-mindmap/issues/123)).

## The session's environment

`src/companion/sessionEnvironment.ts` owns this, and it runs once, before any session exists.
Its two effects are process-wide — Pi resolves both from this process's state, not per session —
and neither one can fail a session: each is a line on stderr, in the `[session environment]`
shape, and the session works anyway.

- **Pi's agent directory is this application's root.** `getShellEnv()` builds a session's PATH
from `getAgentDir()/bin`, and `getAgentDir()` reads the environment variable `PI_CODING_AGENT_DIR`
(`ENV_AGENT_DIR` for this package; the SDK exports neither it nor `getShellEnv`). So the companion
sets it to `--config-dir` and then checks it landed: if it did not, a diagnostic says so instead
of the session quietly getting `~/.pi/agent/bin`. The other things `createAgentSession({ agentDir })`
moves were checked one by one and are inert here: the default resource loader — and with it Pi's
package manager and the trust-requiring project resources — is never constructed (the companion
supplies `resourceLoaderFor`), the settings manager and the session directory are `inMemory`, the
trust store (`ProjectTrustStore`) is built only by Pi's own CLI entry points, and `ModelRuntime`
gets explicit `modelsPath`/`authPath` with an in-memory catalog store. The one thing the agent
directory still decides is the session's PATH prefix, which is the point.
- **`<root>/bin/node` is how `node …` works in a skill's prose.** On Unix it is a symlink to
`process.execPath` — the sidecar runtime Rust started the companion with, never one from the
operator's PATH; on Windows, where a symlink needs a privilege an installer does not have, it is a
`node.cmd` that forwards. Never a copy: the runtime is about 110 MB and it already ships beside
the companion. A file the operator put there is left alone and named in a diagnostic; a shim that
could not be written is a diagnostic too.
- **ADR-0010 holds here as everywhere else.** The companion neither reads nor falls back to
`~/.pi/`, and the runtime a session gets is the application's own, not the machine's. The shim is
the only thing the companion writes under the root besides `selected-models.json`.

## The shell a mode holds

Built-ins start disabled and a mode grants the ones it needs, so *which shell tool* a session
holds is a grant decision, not a platform branch inside a tool: `bash` on darwin and linux,
`powershell` on win32 (`shellToolName`). Naming it matters because Pi's `bash` tool resolves Git
Bash on Windows, which this application does not require and the companion's cleared environment
does not find, while PowerShell is there on any Windows install. Where neither exists, the note
above says so and the session stays usable.

Both modes also hold `read`, which is how the model inspects the documents it is working on, and
`derivon`, which is how it reads and queries the graph (above). The
modes differ in what a *write* may do, and that is a different axis (ADR-0011) — the learning
session's shell is not taken away for it.

## Environment isolation

Rust starts the companion with `env_clear()` and a five-name allowlist (`PATH`, `HOME`,
`TMPDIR`, `LANG`, `LC_ALL`). That is defence in depth, not the rule — Pi's ambient
credential fallback reads `process.env` live, downstream of any injected
`CredentialStore`, and also consults Google ADC and AWS profile files that no
environment allowlist covers. The attribution filter above is what actually holds.

It is not a sandbox for the operator's own extensions either. An extension runs in this
process, which holds the resolved credentials of the model the session is on; the
allowlist stops it from reading the environment and nothing stops it from reading what
`ModelRuntime` resolved. That is the operator's own code with the operator's own
credentials, inside the local trust boundary ([ADR-0010](../adr/0010-pi-sdk-companion-process.md)).

## Security follow-up

Credentials sit in a plain JSON file, `~/.derivon/auth.json`. A later
slice should replace that with an OS credential store or a custom Pi `CredentialStore`
adapter. Until then, do not add remote providers or web-hosted model access.

## Testing

- `npm run build:companion` produces the single-file Node companion.
- `npm run test:node` runs the companion integration test against a local OpenAI-compatible
  test provider; it does not call a real model service. The provider fixture reads a
  request's last user message rather than its whole body: the conversation history
  travels with each request, so a marker matched against the body would answer every
  later turn. The test deliberately spawns the companion with a machine-wide
  `ANTHROPIC_API_KEY` set and asserts the catalog is unchanged. A test whose result
  depends on the developer's shell is a defect in the isolation it exists to prove —
  `src/companion/modelConfiguration.test.ts` covers the same ground without spawning a
  process.
- `npm run test` also runs that integration test, the browser tests, typechecking, and the
  initial JavaScript budget.
- `npm run build:desktop` builds the companion, copies the current Node runtime into
  `src-tauri/binaries/`, and produces the desktop webview bundle.
