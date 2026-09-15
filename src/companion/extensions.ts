import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  createExtensionRuntime,
  discoverAndLoadExtensions,
  type Extension,
  type ExtensionRuntime,
  type LoadExtensionsResult,
} from '@earendil-works/pi-coding-agent';

/** One extension that could not be loaded, in Pi's own shape. */
export type ExtensionFailure = LoadExtensionsResult['errors'][number];

/**
 * The extensions one session may hold, and what stopped the rest.
 *
 * Extensions are loaded into the session's own runtime, so one of these belongs to exactly one
 * session: Pi binds the runtime's actions when the session is built, and two sessions sharing a
 * runtime would have one session's `pi.sendMessage()` reach the other.
 */
export type ExtensionState = {
  /** Loaded extensions, ready to be handed to a session's resource loader. */
  readonly extensions: readonly Extension[];
  readonly errors: readonly ExtensionFailure[];
  /** The runtime the extensions registered into; the session binds it. */
  readonly runtime: ExtensionRuntime;
  /** Readable one-liners for the operator: what failed, what was skipped, and why. */
  readonly notes: readonly string[];
};

/** Where an extension root sits relative to the thing that owns it. */
export type ExtensionRoot = {
  readonly path: string;
  /**
   * A project-level root is the project's own code, so it is loaded only once the operator has
   * said the project is trusted. The user-level root is the operator's own, and is not gated.
   */
  readonly project: boolean;
};

/**
 * The two roots an extension is installed under.
 *
 * The user-level one is the directory `#120` gave the application — `<config-dir>/extensions`,
 * which the host resolves to `~/.derivon/extensions` — and the project-level one sits beside the
 * workspace's skills. Neither is `~/.pi/agent/extensions` or `<workspace>/.pi/extensions`: this
 * application's roots are its own, the same rule the skills and the model configuration follow.
 */
export function extensionRoots(configDirectory: string, workspacePath: string | null): readonly ExtensionRoot[] {
  const project = projectExtensionRoot(workspacePath);
  return [
    { path: path.join(configDirectory, 'extensions'), project: false },
    ...(project ? [{ path: project, project: true }] : []),
  ];
}

function projectExtensionRoot(workspacePath: string | null): string | undefined {
  return workspacePath ? path.join(workspacePath, '.derivon', 'extensions') : undefined;
}

/** The file the operator writes to trust a project; it lives in the application's own root. */
export function trustFile(configDirectory: string): string {
  return path.join(configDirectory, 'trust.json');
}

/**
 * Paths are compared in canonical form, so a workspace reached through a symlink matches the
 * path the operator wrote down, and two spellings of one directory are one entry.
 */
function canonical(target: string): string {
  const resolved = path.resolve(target);
  try {
    return realpathSync(resolved);
  } catch {
    // A path that is not there cannot be canonicalised; its resolved spelling is all there is.
    return resolved;
  }
}

/** Path to decision, canonicalised. An absent entry means "nothing has been said about this". */
export type TrustStore = ReadonlyMap<string, boolean>;

/**
 * Read the trust store.
 *
 * Pi keeps a `trust.json` of this shape next to its own configuration and asks the operator about
 * a project the first time it opens one. This application does not ask, and takes trust from
 * nothing else, so this file is the operator's to write by hand — the same class of file as
 * `models.json` and `auth.json`, in the same root `#120` established. The shape is Pi's (a map
 * from an absolute path to a decision, the nearest entry at or above the project deciding), so an
 * operator who already knows Pi's file can read this one.
 *
 * A store that cannot be read trusts nothing and says so: refusing to load a project's code
 * because its permission file is malformed is the safe side, and reading a broken file as
 * permission is not.
 */
export function readTrustStore(file: string): { readonly trust: TrustStore; readonly note?: string } {
  if (!existsSync(file)) return { trust: new Map() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { trust: new Map(), note: `信任文件不可读：${file}（${message(error)}），没有任何项目受信任。` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { trust: new Map(), note: `信任文件不是一个「路径 → true/false」的对象：${file}，没有任何项目受信任。` };
  }
  const trust = new Map<string, boolean>();
  for (const [key, value] of Object.entries(parsed)) {
    if (value === true || value === false) trust.set(canonical(key), value);
  }
  return { trust };
}

/**
 * Whether the project at `workspacePath` may load its own extensions.
 *
 * The nearest entry at or above the project decides, so trusting a folder trusts what is in it,
 * and a `false` written closer in takes it back. Nothing written *below* the project can speak
 * for it: a workspace cannot trust itself.
 */
export function trustDecisionAt(trust: TrustStore, workspacePath: string): boolean {
  let current = canonical(workspacePath);
  for (;;) {
    const decision = trust.get(current);
    if (decision !== undefined) return decision;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * Load the extensions this application's roots offer, for one session.
 *
 * Discovery and loading are Pi's, through the SDK's own `discoverAndLoadExtensions`: the same
 * one-level rules (a `*.ts`/`*.js` file, a directory with `index.ts`/`index.js`, a `package.json`
 * declaring `pi.extensions`), the same TypeScript transform, and the same load errors. Two things
 * are this application's, and both are in the arguments:
 *
 * - **The roots.** The user-level root is the agent directory's own `extensions/`, which is the
 *   global root this loader looks in, and the project-level root is passed explicitly — only when
 *   the project is trusted, and only when the directory is there.
 * - **The working directory the loading happens in.** It is the application's own root and never
 *   the workspace. Pi's discovery adds `<cwd>/.pi/extensions` as a root of its own, with no
 *   argument able to turn it off, so a loading cwd inside a workspace would let that workspace's
 *   `.pi` tree be loaded with no trust decision at all. The application's root is a directory a
 *   workspace cannot write. An extension's `pi.exec` without an explicit working directory
 *   therefore starts there rather than in the workspace; `ctx.cwd`, which is what a tool's own
 *   handler reads, is the session's.
 *
 * A root that is not there offers nothing, and nothing installed anywhere is the ordinary state of
 * a machine rather than a diagnostic — the same rule the skills follow. What is reported is a load
 * that failed and a project root that was skipped because the project is not trusted.
 *
 * This never rejects. An extension is the operator's own code and a broken one must not be able to
 * fail the session, the model list, or the application: every failure becomes a note the operator
 * reads and, in the panel, a diagnosis beside the model catalog's own.
 */
export async function openExtensions(options: {
  configDirectory: string;
  workspacePath: string | null;
}): Promise<ExtensionState> {
  const { configDirectory, workspacePath } = options;
  const notes: string[] = [];
  const { trust, note } = readTrustStore(trustFile(configDirectory));
  if (note) notes.push(note);

  const projectRoot = projectExtensionRoot(workspacePath);
  const configuredPaths: string[] = [];
  if (projectRoot && workspacePath && existsSync(projectRoot)) {
    if (trustDecisionAt(trust, workspacePath)) {
      configuredPaths.push(projectRoot);
    } else {
      notes.push(untrustedNote(workspacePath, configDirectory));
    }
  }

  let loaded: LoadExtensionsResult;
  try {
    loaded = await discoverAndLoadExtensions(configuredPaths, configDirectory, configDirectory);
  } catch (error) {
    notes.push(`扩展未能加载：${message(error)}`);
    loaded = { extensions: [], errors: [], runtime: createExtensionRuntime() };
  }
  for (const failure of loaded.errors) {
    notes.push(`扩展加载失败：${failure.path}（${failure.error}）`);
  }
  return { extensions: loaded.extensions, errors: loaded.errors, runtime: loaded.runtime, notes };
}

/**
 * The names the loaded extensions registered.
 *
 * A session's tool set is its grant table plus these names: the tools the operator gave to their
 * own session by writing an extension. Nothing here is filtered, and that is the point — the
 * application does not decide what a user's own code may offer, which is what makes the session's
 * tool set no longer a capacity limit (ADR-0011, ADR-0010).
 */
export function extensionToolNames(state: ExtensionState): string[] {
  return [...new Set(state.extensions.flatMap((extension) => [...extension.tools.keys()]))];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The one line that tells the operator how to make a project's own extensions loadable. */
function untrustedNote(workspacePath: string, configDirectory: string): string {
  const file = trustFile(configDirectory);
  return `项目级扩展未加载：${workspacePath} 未受信任。把该路径（或它的某一级父目录）写进 ${file} 并置为 true，即可信任它。`;
}
