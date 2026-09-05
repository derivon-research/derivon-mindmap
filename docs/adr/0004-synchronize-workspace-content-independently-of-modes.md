# Synchronize workspace content independently of modes

Workspace synchronization outlives the currently displayed mode: accepted authoring changes
enter effective in-memory content, are available to read-only learning previews, and are
automatically saved without making mode switching a save command. Write authority comes
from accepting a change through desktop authoring, not from which mode happens to be visible
when a queued write runs; learner goals, known concepts and progress never become workspace
writes.

Making each mode save and reload independently would split the preview across content
versions and duplicate conflict handling. Requiring a save before learning would make a
read-only preview depend on successful disk I/O. Instead, one synchronization module owns
the content lifecycle, while a separate content module prepares complete validated changes
without host I/O; each mode retains its own interaction and learning-state responsibilities.

## Consequences

Incomplete editing drafts are not saved or previewed, but still prevent automatic replacement
of their editing basis. When local edits exist, external updates require conflict resolution;
v1 does not automatically merge them. Failed saves retain effective in-memory content and
allow further editing and preview with an explicit unsaved state, retry and close warning.
These are in-process protections, not a promise of recovery after a crash.

The read/write interface needs further design for consistent content reads and protection
against external writes. Existing rollback is not evidence of either concurrency safety or
crash atomicity. See the accepted, not yet implemented
[workspace content and synchronization design](../workspace-content-sync.md).
