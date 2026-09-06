# Persist Markdown, not rendered pages

An object document in `derivon.workspace/v1` consists of `document.md` and its assets.
Markdown may contain inline HTML; rendering that source belongs to browsing, not to
workspace acquisition, validation or persistence. A separate `index.html` is neither a
required object file nor a second source of truth. The manifest continues to reference
an owned directory, without an HTML path or format selector.

This corrects the dual-file requirement recorded in PR #74. It was not the intended
product semantics: in Agent-Harness-101, 241 KB of Markdown caused opening to acquire
184 MB of generated HTML. Faster hashing or transport would mitigate that amplification
without removing its cause. Creation and editing now commit only Markdown and assets;
both modes acquire and render the accepted Markdown on demand. Opening reads only the
graph and companion metadata, never all Markdown bodies. Explicit full-text search may
request a batch of bodies; hidden views and metadata indexing may not trigger acquisition.
Read failures remain local diagnostics. Inline HTML is preserved verbatim in saved Markdown and is sandboxed when
rendered.

Existing unrelated files are not deleted on open or save. Standalone publication, if
requested, is a separate export outside the workspace, not a prerequisite for using it.
