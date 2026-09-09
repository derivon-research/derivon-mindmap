# Run Pi SDK in a desktop companion process

## Status

Accepted.

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

Tauri’s Rust layer owns process supervision and the IPC bridge. It lazily starts the
companion on first use and stops it when the application exits. The companion and
webview communicate through Tauri commands and events, not a local network listener.

The first implementation uses Pi’s default `~/.pi/agent/auth.json` and
`~/.pi/agent/models.json` for local credentials and model discovery. Secure credential
storage is deferred; that is an explicit follow-up, not a silent downgrade.

Each mode gets its own agent instance and remembers its own model. The panels share the
same chat UI and provider contract. Sessions are in-memory and are disposed on “new
conversation”; switching modes does not reset either transcript.

## Consequences

- The web host has no Pi SDK in its module graph and still opens with deterministic
  learning guidance.
- The desktop bundle must include the companion script and a compatible Node runtime;
  requiring users to preinstall Node or `pi` is not acceptable.
- Model selection is driven by Pi’s provider/model catalog, not hardcoded to one
  provider or model.
- Built-in tools are disabled in the first slice. Future tools, mode-specific prompts,
  OAuth, and secure credential adapters extend the companion without leaking those
  details into the webview.
