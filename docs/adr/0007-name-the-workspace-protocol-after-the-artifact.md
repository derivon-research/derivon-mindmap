# Name the workspace protocol after the artifact, not the producer

The manifest at `.derivon/workspace.json` identified itself as `derivon.authoring/v0.3.0`.
That name states who writes the file. It does not state what the file is. Learning mode
reads every field of it and cannot write any of them, so naming the format after authoring
encodes an access rule into a format identifier, where it does not belong and cannot be
enforced. v1 renames the schema to `derivon.workspace/v1`.

The replacement name is not new vocabulary. `CONTEXT.md` already calls the surrounding
material workspace content, the port that reads it is already `WorkspaceSource`, and the
file is already `workspace.json`. The glossary term "authoring manifest" becomes "workspace
manifest" and keeps its meaning: the root descriptor of a workspace, which carries the graph
and binds each graph object to a document directory.

`derivon.derivation/...` was rejected. Derivation structure — tails, head, weight — is owned
by `derivon.graph/v1` in `derivon-research/derivon`, and this manifest's contribution is
precisely the layer that is *not* derivation structure: labels, document bindings and tags.
`CONTEXT.md` also records that `derivation` carries three live meanings across the
mathematical model, the product and the authoring methodology, and requires a qualifier at
every use. A term that cannot be used unqualified cannot serve as a format identifier.
`derivon.mindmap/v1` was rejected for a weaker form of the original error: the README
commits this format to being maintained by Git, editors, shells and agents, and the graphs
in `derivon-research/mindmaps` and `derivon-research/math-reforged` are expected to outlive
any one application that reads them.

The version string drops to a single major component to match `derivon.graph/v1`, whose CLI
contract test treats `derivon.graph/v2` as the unsupported-schema case. Two protocols in one
product should not carry two versioning conventions.

## Consequences

- v1 already breaks compatibility by adding `points[].data.tags` and by dropping
  `view.replacements` as a product capability. The rename rides that single break: there is
  one migration from `derivon.authoring/v0.3.0` to `derivon.workspace/v1`, not two. It ships
  inside [#57](https://github.com/derivon-research/derivon-mindmap/issues/57) rather than as
  its own ticket, because #57 is the work that first needs `tags` and first writes a
  companion document; renaming separately would migrate every manifest twice.
- The workspace boundary accepts both schema strings on read and emits only the new one on
  write. This is the existing legacy-field treatment in `CONTEXT.md`, applied to the schema
  identifier: `derivon.authoring/v0.3.0` becomes an input dialect, not a supported output.
  No product state or module design carries the old name inward.
- The rename is cross-repo. Beyond this repository it appears in `derivon-research/skills`,
  `derivon-research/mindmaps`, `derivon-research/math-reforged`, `derivon-research/derivon`
  and `derivon-research/planning`. Content repositories hold committed manifests that must
  either be migrated or continue to load through the input dialect; agent skills instruct
  agents to write the string and would otherwise emit a dead name.
- The naming rule generalizes but is not a ban on mode words. An artifact read by both modes
  may not be named for one of them. An artifact that genuinely serves a single flow may be:
  the orientation companion document introduced by
  [#57](https://github.com/derivon-research/derivon-mindmap/issues/57) is named
  `derivon.orientation/v1` because orientation is its whole subject, not its writer.
- Companion documents get their own schema identifiers rather than manifest fields, so the
  manifest's version does not move when a companion document's does.
