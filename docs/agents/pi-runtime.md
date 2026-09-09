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
   - Uses Pi’s default `auth.json` and `models.json` until secure credential storage is
     added.
   - Runs one process with one session per mode.

## Provider/model configuration

- Use Pi’s default `~/.pi/agent/models.json` for provider and model discovery.
- Use Pi’s default `~/.pi/agent/auth.json` for local credentials in the first slice.
- Do not hardcode a provider or model.
- Each mode remembers its own selected model; switching modes does not change the other
  mode’s selection.

## Prompt and tool extension

- Start from a neutral, fixed system prompt.
- Add mode-specific prompts by composing a new harness config in the companion, not by
  branching inside the webview.
- Add tools only through Pi’s custom tool API.
- Keep built-in filesystem and shell tools disabled unless a mode explicitly needs them.
- Future authoring tools should be composed into the authoring harness only.

## Security follow-up

The first slice intentionally uses Pi’s default local credential files. A later slice
should replace that with an OS credential store or a custom Pi `CredentialStore`
adapter. Until then, do not add remote providers or web-hosted model access.

## Testing

- `npm run build:companion` produces the single-file Node companion.
- `npm run test:node` runs the companion integration test against a local OpenAI-compatible
  test provider; it does not call a real model service.
- `npm run test` also runs that integration test, the browser tests, typechecking, and the
  initial JavaScript budget.
- `npm run build:desktop` builds the companion, copies the current Node runtime into
  `src-tauri/binaries/`, and produces the desktop webview bundle.
