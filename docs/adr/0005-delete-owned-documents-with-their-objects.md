# Delete owned documents with their objects

Deleting a concept or product derivation must also delete its owned object documents and
assets as part of the complete content change, rather than leaving files behind. The legacy
application's graph-only deletion loses the GUI entry through which those files were managed;
retaining them is not a conservative user experience when the user cannot subsequently clean
them up through the application.

This does not authorize recursive deletion without impact analysis. Other documents can link
to the deleted document or use its assets, and orientation configuration can refer to the
concept. Direct deletion is blocked until the user repairs affected references through the GUI
or confirms a complete plan that includes those repairs. Do not silently strip links, remove
images from surviving documents, or treat an unreadable reference source as proof of no
references. Until a safe deletion can complete, the object retains its management entry.

## Consequences

The content module owns reference impact analysis and deletion planning; callers do not
assemble graph edits and file deletions independently. The host adapter needs an inventory
of owned files, including assets no longer mentioned in the document text, and verified write
failure behaviour. Those capabilities are not supplied by the current path-based commit
interface alone. No whole-workspace garbage collector or new on-disk format is implied.

See the [workspace content and synchronization design](../workspace-content-sync.md) for
implementation ownership, tests and capability gaps.
