# derivon-mindmap

Local-first knowledge graph application built on Tauri 2, React and `derivon-core`. This
repo owns the product semantics shared by learning and authoring modes, plus the
`derivon.workspace/v1` workspace protocol and the `derivon.orientation/v1` companion protocol.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `derivon-research/derivon-mindmap`, via the `gh` CLI.
Graph-protocol issues (`derivon.graph/v1`) belong in `derivon-research/derivon`; this repo
owns the workspace and orientation protocols. Strategy and roadmap live in the private
`derivon-research/planning` repo, never here. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context. Before naming or changing product concepts, derivations, object documents,
tags, or replacement compatibility, read `CONTEXT.md` and `docs/agents/domain.md`.
