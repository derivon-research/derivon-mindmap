/** A text file the workspace tried to read: either its text, or why it could not be read. */
export type TextResource =
  | { readonly status: 'ready'; readonly text: string }
  | { readonly status: 'error'; readonly message: string };

/** What a caught error says, for a person to read: its message, or the value itself. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sorts workspace-relative paths by UTF-16 code units, the order every listing and every
 * derived list of files uses, independent of locale.
 */
export function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Whether `path` is a direct child of `directory`: inside it, and not inside a subdirectory of it. */
export function isDirectChild(path: string, directory: string): boolean {
  const prefix = `${directory}/`;
  return path.startsWith(prefix) && path.length > prefix.length && !path.slice(prefix.length).includes('/');
}

/** A localized content problem. A workspace stays open and browsable while it carries these. */
export type ContentDiagnostic = { readonly path: string; readonly message: string };
