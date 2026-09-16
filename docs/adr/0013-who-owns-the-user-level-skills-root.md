# The application installs the base skills, and only seeds them

## Status

Accepted. It supersedes the main path of
[`derivon-research/skills#14`](https://github.com/derivon-research/skills/issues/14), which made
an upstream `skills` CLI agent target the way skills reach `~/.derivon/skills/`.

## Context

[#104](https://github.com/derivon-research/derivon-mindmap/issues/104) made a session discover
its script command surface from two skill roots — the user-level `~/.derivon/skills/` and a
project's `<workspace>/.derivon/skills/` — and
[#122](https://github.com/derivon-research/derivon-mindmap/issues/122) put the skills' bodies in
reach of the session. Neither put a file in either root. Nothing did. So every installation
discovered zero skills and reported the same diagnostic, which is correct and useless:

```text
没有可用的脚本命令面：在 ~/.derivon/skills 和 <workspace>/.derivon/skills 下都没有找到 <skill>/scripts/derivon-workspace.mjs。
```

The skills repository's own ticket decided how to fix that: add a `derivon` target to the
upstream `skills` CLI so that

```sh
npx skills add derivon-research/skills --skill derivon-mindmap --skill derivon-cli -a derivon
```

lands the files in the right place, with hand-copying recorded as a *transitional* step.

Two things about this application make that the wrong main path.

**Its users are mostly not developers.** #127 states it plainly. That path requires a Node
installation and an `npx` invocation before the authoring side can change anything at all. The
step recorded as transitional is the only one such a user can perform, which means it is the
real path and the CLI target is the optional one.

**The contract does not need the application to pin the artifact.** The session holds no
command list: every tool is derived from what the surface publishes through `--capabilities` at
the moment a session is built, and the companion "keeps no command list of its own, so the two
cannot drift apart" (ADR-0011). What the application names is the *capability vocabulary* and the
two artifact categories, and the intersection is what a mode gets. A surface that is newer than
the one the application shipped therefore cannot break it:

- a command with a capability the application does not know simply does not intersect, so the
  tool is not registered — silent, and it fails closed;
- the artifact protocols are versioned, and the reader refuses a protocol string it does not
  recognise rather than reinterpreting it;
- the result envelope is validated by shape, not against a pinned revision.

## Decision

**The application installs the base skills into the user-level root, and only seeds them.**

The base set is two skills: `derivon-mindmap`, which carries the script command surface, and
`derivon-cli`, which the `derivon` tool needs to be installed. The other four skills in
`derivon-research/skills` are methodology skills for an operator's own agents elsewhere; they
are not this application's sessions and are not shipped with it.

**The bytes come from a pinned revision, at build time.** A prepare step fetches the base set
from `derivon-research/skills` at a revision this repository names, and ships it as a Tauri
resource. That is the shape `scripts/prepare-companion.mjs` already uses for the Node runtime:
pin the version, fetch the artifact from its canonical source, ship it. Nothing is fetched at
runtime — the application is local-first, and the user-level root is meant to hold the
operator's files and nothing else.

**Installation never overwrites.** On the first use that creates `~/.derivon`, a skill from the
seed is copied to `<root>/skills/<name>` only when that directory is not already there. The
skills root is the operator's, in the same sense the extensions root is (#121): whatever is in
it, no matter who put it there, is what a session uses. A directory that cannot be copied is a
diagnostic and never a failure — a session without a command surface is still a usable session.

**The pinned revision is a build input, not a runtime authority.** Once installed, the skill is
read exactly as any operator-installed skill is read. The application does not repair it back to
the seed, and does not treat the seed as the current version.

**A version difference is reported, never enforced.** The surface declares its own version in
`--capabilities`, beside the schemas it already publishes. The application compares that with
the version of the seed it shipped and says so through the configuration-state channel (#127),
under the `skills` scope. It invents no version: a surface that declares none produces no
notice, because "unknown" is not "different". Skills and this application keep their own release
cadences.

## Rejected alternatives

### Rejected: the upstream CLI target as the main path

It is the better path for a developer, and it stays welcome as one. It cannot be the path a
non-developer is asked to take, and a path that only developers can take does not make the
feature exist for this application's users. What that ticket recorded as the transitional
method — copying or symlinking a skill in by hand — is what this decision makes the
application's own job.

### Rejected: the application owns the skills root

Owning it would mean overwriting on update, and `~/.derivon/skills/` is a directory an operator
edits and replaces deliberately — the same argument that made the extensions root the operator's
(#121). An application update that silently reverts an operator's edit is worse than a stale
skill, and it is the specific harm "seed only" exists to avoid.

### Rejected: binding the skill version to the application's version

The skills change often and cheaply: they are documents and scripts, and the command surface
itself changed as recently as #104 and #122. This application's release is heavy — a Node
sidecar of about 110 MB, per-platform bundles, signing and notarisation. Binding a
fast-moving artifact to a slow release train means a skill fix waits for an application
release, which is the wrong pairing, and it would make the two repositories' version numbers
lie about each other.

It is also unnecessary. The property that makes a shipped copy safe is not that it is the only
copy, but that the application holds no command list: an installed surface may be newer or
older than the seed without changing what the application can do with it (see *Context*). A pin
says which revision this release was built and tested against; it does not say the two must
agree.

### Rejected: fetching the skills at runtime

A network dependency in the path that makes authoring work at all, in an application whose
model configuration, workspace content and learner records are all local files. The pinned
build-time fetch gives the same reproducibility without it.

## Consequences

- The bundle grows by the base set — 3,214,117 bytes (about 3.1 MB) at the revision pinned today,
  not the 110 KB the surface's own code suggests: `derivon-workspace.mjs` and its `lib/` are small,
  but the surface shells out to three prebuilt renderer bundles (`render-documents.mjs` and
  `export-route-textbook.mjs` are about 1.3 MB each, `crosslink-documents.mjs` about 300 KB), and a
  surface missing them would fail at the commands that need them rather than at load. Against a
  ~110 MB runtime this is not decisive, and it is the price of the authoring side working on a fresh
  install.
- A fresh install no longer reports "no command surface", so that notice becomes what it should
  be: an anomaly, from a skill deleted by hand or a project root shadowing the user-level one.
- **Updating an installed seed is not part of this.** Doing it safely needs to know whether the
  installed copy is the one this application put there and whether it has since been edited;
  that is a separate decision, and until it is made the only writer of an existing directory is
  the operator.
- The surface's own version reaches the panel only once `derivon-research/skills` publishes it.
  Until then the comparison is exercised against fixtures and reports nothing, which is the
  behaviour for "declares no version" rather than an unfinished path.
- `derivon-research/skills#14`'s main path is superseded. Its CLI target stays a good way to
  install or replace a skill, and its README section stays true, but neither is what the
  application relies on.
