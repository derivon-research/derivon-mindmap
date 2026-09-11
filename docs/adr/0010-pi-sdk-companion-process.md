# Run Pi SDK in a desktop companion process

## Status

Accepted. The configuration and diagnostics sections were rewritten before the first
release; see *Rejected: reusing the machine's Pi configuration* below.

## Context

Derivon Mindmap needs a real streaming conversation in the desktop app, but
`@earendil-works/pi-coding-agent` is a Node.js runtime library. It depends on Node
processes, the local filesystem, model catalogs, and credentials. A Tauri webview has
none of those capabilities and must not receive model credentials.

The learning side and authoring side both need an agent panel, but their state and
future tools will diverge. The web host is learning-only and must keep working without
a provider.

## Decision

The desktop host runs one Node companion process for the whole application. The
companion owns Pi SDK `AgentSession`, `ModelRuntime`, model selection, and conversation
lifecycle. The webview only renders the panel and talks to a small
`ConversationProvider` port; it never imports Pi SDK, never spawns a process, and never
holds a credential.

Tauri's Rust layer owns process supervision and the IPC bridge. It lazily starts the
companion on first use and stops it when the application exits. The companion and
webview communicate through Tauri commands and events, not a local network listener.

Each mode gets its own agent instance and remembers its own model. The panels share the
same chat UI and provider contract. Sessions are in-memory and are disposed on "new
conversation"; switching modes does not reset either transcript.

The protocol between the two is written once, in `src/companion/protocol.ts`, and
imported by both ends. Tauri exposes a single command that carries a payload through
untouched, so the Rust layer supervises a process and routes envelopes without knowing
the conversation vocabulary — a middle layer that restated the contract would be a third
copy to keep in step, and the one no compiler checks.

### The application owns its model configuration

The application reads its own `models.json` and `auth.json` from the Tauri application
configuration directory. Both files use Pi's file syntax, so a provider block can be
copied from Pi's documentation or from an existing `~/.pi/agent/models.json` unchanged.
They are the application's files: it does not read, write, or fall back to `~/.pi/`, and
it does not require Pi CLI to be installed.

**What the panel offers is a function of those two files and nothing else.** This is a
stronger claim than "we pass our own paths", and it needs enforcing rather than
assuming, because Pi's `ModelRuntime` is generous about what counts as configured:

- Its ~40 built-in providers are always composed in, whatever `models.json` says.
  `models.json` is an overlay on that catalog, not a replacement.
- Credentials resolve through an ambient fallback that reads `process.env` live —
  `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`, and so on — and, for two providers, reads
  credential files belonging to other tools (Google ADC, the AWS profile). Injecting a
  `CredentialStore` does not disable that fallback; the fallback lives downstream of the
  store.

So a provider is offered only when Pi attributes its credential to one of the
application's own files. `ModelRuntime.getProviderAuthStatus` reports that attribution,
and the companion accepts `stored` (the application's `auth.json`), `models_json_key`,
and `models_json_command`. It rejects `environment` and `fallback` — the sources that
mean "something else on this machine". Rust additionally starts the companion with a
cleared environment and a small allowlist, so nothing the operator exported reaches Pi's
ambient fallback in the first place. That is defence in depth, not the rule; the rule is
the attribution filter, which also covers the credential files belonging to other tools
that no environment allowlist can reach.

### A failure says what failed

An empty model list is a legitimate configuration state, not an error channel. The
`ConversationProvider` port therefore reports a diagnosis alongside the catalog, and the
panel shows it next to "没有可用模型".

This is load-bearing for the section above rather than a nicety: a missing `models.json`
is silent in Pi's loader, an unparseable one resolves successfully with an empty
catalog, and both look identical to a companion that failed to start. Every layer must
stop discarding evidence — the companion surfaces `ModelRuntime.getError()`, Rust keeps
the companion's stderr instead of routing it to `/dev/null`, and the panel stops
collapsing every rejected promise into an empty list.

### Rejected: reusing the machine's Pi configuration

The first implementation used Pi's default `~/.pi/agent/auth.json` and `models.json`,
on the reasoning that a developer with Pi installed would need no setup. It was rejected
once it shipped, for three reasons.

It is not what the application is for: Derivon Mindmap is not a Pi front-end, and its
users are not required to be Pi users. It makes behaviour depend on the operator's
machine in ways nobody declared — the companion's own integration test failed on a
developer machine because an unrelated shell variable made real provider models appear
where the fixture had declared none. And a GUI application launched from Finder does not
inherit a shell environment, so the configuration that appears to work in `tauri dev`
is not the configuration that runs after packaging.

Secure credential storage remains deferred. Credentials sit in a plain JSON file in the
application configuration directory, which is a smaller exposure than before — one
application's file rather than the operator's Pi credentials — but it is still an
explicit follow-up, not a solved problem.

## Consequences

- The web host has no Pi SDK in its module graph and still opens with deterministic
  learning guidance.
- The desktop bundle must include the companion script and a compatible Node runtime;
  requiring users to preinstall Node or `pi` is not acceptable.
- Model selection is driven by the application's provider/model catalog, not hardcoded
  to one provider or model.
- First run has no configuration and therefore no models. That state must be legible:
  the panel says which files it read and that they are absent, rather than presenting
  the same empty list it would show for a crashed companion.
- Tests that exercise model discovery must be able to determine the whole answer from a
  fixture directory. A test whose result depends on the developer's shell is a defect in
  the test and in the isolation it is meant to prove.
- Built-in tools are disabled in the first slice, and script commands are registered in
  their place as the only tools; the tool set is constructed per mode, so a session holds only
  the capabilities its mode grants (see
  `0011-change-workspace-content-through-the-script-command-surface.md`). Mode-specific prompts,
  OAuth, and secure credential adapters extend the companion without leaking those details into
  the webview.
