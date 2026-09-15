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
├── skills/                 # command-surface scripts (#104)
└── extensions/             # user Pi extensions (#121)
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
- **`skills/` and `extensions/` are fixed here, though nothing reads them yet**: the
  command surface starts looking in `skills/` (#104) and user extensions load from
  `extensions/` (#121). Neither is `~/.pi/`, which this application never consults.

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
- `noTools: 'all'` does **not** make `cwd` irrelevant: Pi appends
  `Current working directory: <cwd>` to the system prompt either way, and `cwd` also keys
  project settings, project resource discovery and session metadata. The companion
  supplies its own `ResourceLoader` and in-memory `SessionManager`, so nothing is read
  from or written to the workspace today — but the agent is told where it is.
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

- Start from a neutral, fixed system prompt.
- Add mode-specific prompts by composing a new harness config in the companion, not by
  branching inside the webview.
- **Built-in tools start disabled**, and a mode *grants* the ones it needs: a tool is either a
  script command wrapped with Pi’s custom tool API, one of the mode’s own custom tools below, or
  a built-in the mode asks for — the learning session grants `bash`, so a user can run something
  like `tavily-cli` while learning. The apparatus is `settings.defaultTools` (an empty array
  disables the built-ins while keeping extension and custom tools) plus the session’s `tools`
  allowlist, not `noTools: 'all'`, which also filters custom tools out.
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
- The learning session registers exactly two custom tools, both of them application state:
  setting or appending a goal, and requesting a route recompute (entering preview). There
  is no step-advance tool: a route’s current step is derived from mastery, so there is no
  cursor to move.
- Authoring is the only mode that registers script commands writing workspace content;
  compose them into the authoring harness only.

Both modes build their session with the built-in tools disabled and an explicit grant. The tool
sets above are what the v1.0.0 tickets build (#50 for the learning side, #104 for authoring).

## Environment isolation

Rust starts the companion with `env_clear()` and a five-name allowlist (`PATH`, `HOME`,
`TMPDIR`, `LANG`, `LC_ALL`). That is defence in depth, not the rule — Pi's ambient
credential fallback reads `process.env` live, downstream of any injected
`CredentialStore`, and also consults Google ADC and AWS profile files that no
environment allowlist covers. The attribution filter above is what actually holds.

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
