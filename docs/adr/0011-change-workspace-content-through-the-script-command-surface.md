# Change workspace content only through the script command surface

## Status

Accepted.

## Context

The application is moving to "files are the source of truth": the agent is a coding agent rooted
at the workspace, its writes land on disk, and the application observes and reloads. That move
settles which content exists, but it removes the question this ADR had to answer, because Pi
offers nothing to answer it with. There is no path sandbox: `read`, `write` and `edit` resolve
relative paths against `cwd` and pass absolute paths and `..` through unchanged, and `bash` is an
ordinary shell. The Pi SDK says so itself — "Pi does not include a built-in sandbox". A path fence
would have been a claim the application cannot keep.

So the live question is not where a write may land. It is what makes a change *legal*, who
enforces that, and what is risked when nobody can.

Two properties of this repository make the answer concrete.

Workspace content is one change set — graph, object documents, assets and companion metadata —
but it is not uniformly fragile. A broken manifest is a broken workspace with no partial
tolerance, while a manifest that references a missing document is a localized diagnostic and a
document directory no manifest claims is invisible. Ordering therefore carries more of the
safety than locking does.

Learning state is a different thing entirely. It is application state, owned by the learning
module and never written to the workspace (ADR-0009). Whatever the agent is allowed to change, it
is not that, and no file-mediated rule can reach it.

## Decision

**Workspace content is changed only through the script command surface.** The surface is one set
of commands, each declaring the capability it requires, and one call is one commit: the command
builds the candidate, validates it against the graph protocol and the workspace's reference
rules, and either replaces the manifest or refuses. The caller does not stage, does not sequence,
and does not decide when writing is safe. The dry-run-then-write split that the shell recipes used
exists for shell convenience and is not the required path: for v1.0.0, correctness must not depend
on the agent choosing to check first.

This path is **sanctioned, not enforced**. Nothing prevents a direct write — there is no mechanism
in the client and none at all without one — so writing "illegal" into the architecture would
record a guarantee that cannot be made. What is enforced is the **artifact**: the application
validates any workspace it loads, whoever wrote it, and a command validates its own output before
replacing anything. An unmediated write is therefore *unvalidated*, not *forbidden*. The reader is
what enforces.

Inside the client the boundary is a capability limit. The companion registers exactly the script
commands as tools, with a fixed workspace root, and registers no `read`, `write`, `edit` or
`bash`. Excluding `bash` is what makes the limit real rather than decorative, and it is also why
the shell recipes lose nothing by becoming commands: the capability they provided is the same one.
The tool set is constructed per mode, so a session holds only the capabilities its mode grants;
the learning session has no write command registered in it at all. "Learning mode cannot edit" is
structural, not a switch that some other code path could turn back on. Reading follows where the
truth lives: workspace content is on disk and is read on demand through read-capability commands,
while learner records are not workspace content and reach the model only through the commands that
read them ([ADR-0009](0009-persist-learner-records-outside-the-workspace.md),
[ADR-0012](0012-learning-state-is-mastery.md)). Containment is
checked per entry on the real path, never by string prefix — a prefix check is exactly what let
`/mnt/finance/data-archived` through an allowance of `/mnt/finance/data`.

The application and the agent never write concurrently. Both are driven by one person in one
window, so the rule is a turn-level exclusion: while a conversation turn is in flight the
application suspends autosave and refuses in-application editing, and an unresolved editing draft
blocks starting a turn until the user saves or discards it. The commit carries its own
precondition as well — the manifest is re-read and compared against the one the command read — so
a change that raced loses cleanly instead of overwriting. That is compare-and-swap at the
manifest, which is the artifact both parties contend for; it is not a lock, and not a whole-tree
revision.

**Atomic means semantically atomic.** A command writes its documents first and replaces the
manifest last, by temporary file and rename, so the workspace is loadable and truthful at every
moment. Crash atomicity across files is not provided by this: a crash can leave unreferenced
documents behind, and those are inert rather than dangerous. A journal is the answer if that ever
stops being enough, and it is not built now.

Capabilities are declared by the command surface and granted by mode: `read`, `write-structure`
(graph, orientation configuration, tag declarations), `write-document`, `delete`, `import`. The
command surface holds command → capability, the client holds mode → capability, and the tool set a
session receives is their intersection. Neither side alone can answer "what may this session do",
which is the point: a second hand-maintained list is a second thing to keep in step.

## Rejected alternatives

### Rejected: enforcing the path instead of validating the artifact

No enforcement point exists to attach the rule to. Pi has no filesystem sandbox, no session-level
permission callback, and its only interception point — the extension layer's `tool_call` block —
is a client-side registration detail that is absent entirely without a client. A design whose
central claim is "the agent may not write there" would be false in the mode where the agent holds
`bash`.

### Rejected: keeping the application as the only writer, with the agent proposing changes

This was the recommendation when files-as-truth was decided, and the opposite was chosen. It is
recorded because its consequences are the ones worked out above: once writes land on disk, the
application becomes a viewer and validator of the workspace, and the interesting question stops
being "how do we sandbox file writes".

### Rejected: a staging directory inside the workspace

The application's change detection re-observes the whole tree on every poll, `.derivon`
included — comparing each file's cheap signal where the platform reports a change time, and
reading the bytes where it does not. A long-lived staging directory inside the workspace therefore
reads as a continuous external change, and a command that stages there is fighting the observer it
is supposed to cooperate with. Candidates are built in memory; the only temporary file is adjacent
to its target and lives for milliseconds.

## Consequences

- The existing scripts are not yet this surface. Only `crosslink-documents.mjs` writes workspace
  content, only documents, in place, with no precondition; the atomic manifest replacement that
  `SKILL.md` describes is performed by shell `mv` in `references/unix-recipes.md`; and a
  manifest-writing command does not exist at all, which means the client cannot currently perform
  a graph change through the sanctioned path. The command surface, its capability declarations and
  its single result envelope are a contract change in `derivon-research/skills`.
- The application needed two repairs of its own, neither of them caused by the agent. Both have
  landed. The manifest — and every other file a commit replaces — is written to a temporary
  sibling in the target's directory and renamed over it, with the manifest last, so a reader
  observes the whole previous file or the whole new one instead of a truncated manifest that
  fails the whole workspace open, and never a new manifest naming documents that are not there
  yet. And acquisition now has one written policy, not two callers' `try`/`catch`: an unsettled
  read is fatal where there is no accepted content to report on (opening, explicit reload) and
  deferred where there is (the poll path), so a workspace the agent is writing to no longer turns
  a retry scheduled for one second later into an error banner. A read that fails for any other
  reason — an unparseable manifest, a refused file — is still reported on both paths.
- Change detection no longer reads the whole workspace on every poll, on a platform that reports
  an inode change time. A repeated acquisition compares a cheap signal — size, modification time
  and the change time — and reuses the digest it last read from bytes only for a file whose signal
  has not moved and whose bytes were read within the last minute. A signature carrying no change
  stamp is never reused, because size and modification time are both settable by the writer: where
  the platform reports no change time — Windows — every acquisition reads the files and the poll
  costs what it did before. The first acquisition always reads everything. The signal is narrowed
  rather than trusted: no stat proves a file's bytes unchanged, since a writer can leave all three
  fields identical, so every file is read again at least once a minute and the value stays a hash
  of every file's content digest. No write is authorized on the observation either: a commit
  verifies the whole source from bytes before it writes, so a change the poll did not see refuses
  the commit instead of being overwritten by it. It was, and remains, a performance question; the
  boundary never depended on the poll.
- Adopting an external change clears the loaded document and asset caches, so every committed
  change costs the application a re-read. That is a cost, not a corruption.
- Removing the required dry run removes the audit surface that `crosslink-documents.mjs --all
  --json` provided for a broad migration. Read-capability commands keep that surface, and they are
  what the no-client author uses as well.
- ADR-0010's "built-in tools are disabled in the first slice" is superseded in one part: the first
  slice disables built-in tools *and* registers script commands as the only tools.
- Without a client the boundary is agreement and the skill's instructions, and nothing more. An
  object document may quote third-party text, so document content is data and never instruction;
  the skill has to say so, and today it does not.
