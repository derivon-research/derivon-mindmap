/** A text file the workspace tried to read: either its text, or why it could not be read. */
export type TextResource =
  | { readonly status: 'ready'; readonly text: string }
  | { readonly status: 'error'; readonly message: string };

/** A localized content problem. A workspace stays open and browsable while it carries these. */
export type ContentDiagnostic = { readonly path: string; readonly message: string };
