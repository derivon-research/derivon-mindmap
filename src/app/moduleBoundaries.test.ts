import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** What `#host` resolves to per build. Mirrors `hostEntry()` in `vite.config.ts`. */
const HOST_ENTRY: Record<'web' | 'desktop', string> = {
  web: 'hosts/web/host.ts',
  desktop: 'hosts/desktop/host.ts',
};

/** Heavy dependencies the first screen may never carry, and the tour that is not coming back. */
const FORBIDDEN_ON_FIRST_SCREEN = [
  '@antv/g6',
  'katex',
  '@tiptap',
  'd3-force',
  '@dagrejs/dagre',
  'react-joyride',
  '@earendil-works/pi-coding-agent',
];

type ModuleImports = { staticImports: string[]; dynamicImports: string[] };
type ResolvedModule = { file: string; imports: ModuleImports };

/** Static imports keep a module in the loading chunk; `import()` is the lazy boundary. */
function readImports(file: string, source: string): ModuleImports {
  const staticImports: string[] = [];
  const dynamicImports: string[] = [];
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) {
      // `import type` is erased before bundling, so it cannot put anything in a chunk.
      // Counting it would make sharing a type definition look like shipping the module.
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly === true
        : node.isTypeOnly;
      if (!typeOnly) staticImports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length > 0
      && ts.isStringLiteral(node.arguments[0])) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return { staticImports, dynamicImports };
}

/** Resolve like the bundler does, including `dir` meaning `dir/index.ts`. */
async function readModule(relativePath: string): Promise<ResolvedModule | null> {
  for (const candidate of [relativePath, `${relativePath}.ts`, `${relativePath}.tsx`, `${relativePath}/index.ts`]) {
    let source: string;
    try {
      source = await readFile(path.join(sourceRoot, candidate), 'utf8');
    } catch {
      continue;
    }
    const parsable = candidate.endsWith('.ts') || candidate.endsWith('.tsx');
    return {
      file: candidate,
      imports: parsable ? readImports(candidate, source) : { staticImports: [], dynamicImports: [] },
    };
  }
  return null;
}

function resolveRelative(fromFile: string, specifier: string): string {
  // Vite resource queries (`?raw`, `?worker`) are not part of the path.
  const [modulePath] = specifier.split('?');
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), modulePath));
}

/**
 * Walk the import graph from an entry the way a bundler decides what a chunk contains.
 * `followDynamic` off answers "what is in the first chunk"; on answers "what can this
 * build reach at all".
 */
async function walk(entry: string, host: 'web' | 'desktop', followDynamic: boolean): Promise<{
  modules: Set<string>;
  packages: Set<string>;
}> {
  const modules = new Set<string>();
  const packages = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (modules.has(current)) continue;
    modules.add(current);

    const resolved = await readModule(current);
    if (resolved === null) throw new Error(`Unresolvable module in the import graph: ${current}`);
    modules.add(resolved.file);

    const specifiers = followDynamic
      ? [...resolved.imports.staticImports, ...resolved.imports.dynamicImports]
      : resolved.imports.staticImports;

    for (const specifier of specifiers) {
      if (specifier === '#host') {
        pending.push(HOST_ENTRY[host]);
      } else if (specifier.startsWith('.')) {
        pending.push(resolveRelative(resolved.file, specifier));
      } else {
        packages.add(specifier);
      }
    }
  }

  return { modules, packages };
}

const firstScreen = (host: 'web' | 'desktop') => walk('app/main.tsx', host, false);
const wholeBuild = (host: 'web' | 'desktop') => walk('app/main.tsx', host, true);

describe('first screen', () => {
  it.each(['web', 'desktop'] as const)('loads no mode subtree statically on %s', async (host) => {
    const { modules } = await firstScreen(host);
    expect([...modules].filter((module) => module.startsWith('modes/'))).toEqual([]);
  });

  it.each(['web', 'desktop'] as const)('carries no rendering, typesetting or editing dependency on %s', async (host) => {
    const { packages } = await firstScreen(host);
    const forbidden = [...packages].filter((name) =>
      FORBIDDEN_ON_FIRST_SCREEN.some((heavy) => name === heavy || name.startsWith(`${heavy}/`)));
    expect(forbidden).toEqual([]);
  });

  it('does not reach the v0.4.2 application from the new entry', async () => {
    const { modules } = await firstScreen('desktop');
    expect(modules).not.toContain('App.tsx');
  });
});

describe('rendering isolation', () => {
  it('depends only on its own files and external libraries', async () => {
    const { modules, packages } = await walk('rendering/index.ts', 'web', true);
    expect([...modules].filter((module) => !module.startsWith('rendering/'))).toEqual([]);
    expect([...packages].filter((name) => !['react', '@antv/g6'].includes(name))).toEqual([]);
  });

  it.each(['web', 'desktop'] as const)('keeps every rendering file behind a lazy boundary on %s', async (host) => {
    const { modules } = await firstScreen(host);
    expect([...modules].filter((module) => module.startsWith('rendering/'))).toEqual([]);
  });
});

describe('authoring in a web build', () => {
  it('is unreachable, statically and dynamically', async () => {
    const { modules } = await wholeBuild('web');
    expect([...modules].filter((module) => module.startsWith('modes/authoring'))).toEqual([]);
  });

  it('is reachable on desktop, so the guard above is testing something', async () => {
    const { modules } = await wholeBuild('desktop');
    expect([...modules].some((module) => module.startsWith('modes/authoring'))).toBe(true);
  });

  it('leaves the orientation editor out of the module graph, with the rest of authoring', async () => {
    const { modules } = await wholeBuild('web');
    expect([...modules].filter((module) => module.startsWith('modes/authoring/orientation'))).toEqual([]);
  });
});

describe('workspace I/O', () => {
  it('stays behind the port: no mode and no rendering file reaches a source or a host', async () => {
    const { modules } = await wholeBuild('desktop');
    const owning = [...modules].filter((module) => module.startsWith('modes/') || module.startsWith('rendering/'));
    const offenders: string[] = [];
    for (const module of owning) {
      const resolved = await readModule(module);
      const reached = [...resolved!.imports.staticImports, ...resolved!.imports.dynamicImports]
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => resolveRelative(resolved!.file, specifier))
        // `ports/RouteSolver` is a capability a mode is handed and may name; the workspace
        // source and the host adapters are not.
        .filter((target) => target.startsWith('ports/WorkspaceSource') || target.startsWith('hosts/'));
      if (reached.length) offenders.push(`${module} → ${reached.join(', ')}`);
    }
    // CONTEXT.md: 工作区 I/O 不得进入 src/modes/ 或 src/rendering/. A mode asks the shared
    // authoring commands for a content change; it never holds a source or a host adapter.
    expect(offenders).toEqual([]);
  });
});

describe('orientation on the web', () => {
  it('carries the flow, so a workspace without a conversation provider still opens', async () => {
    const { modules } = await wholeBuild('web');
    expect(modules).toContain('modes/learning/orientation.ts');
  });
});

describe('Pi companion isolation', () => {
  it.each(['web', 'desktop'] as const)('keeps the Node-only Pi SDK out of the first screen on %s', async (host) => {
    const { packages, modules } = await firstScreen(host);
    expect([...packages].some((name) => name === '@earendil-works/pi-coding-agent'
      || name.startsWith('@earendil-works/pi-coding-agent/'))).toBe(false);
    expect([...modules].some((module) => module.startsWith('companion/'))).toBe(false);
  });

  it('keeps the companion implementation out of the web build', async () => {
    const { modules, packages } = await wholeBuild('web');
    expect([...modules].some((module) => module.startsWith('companion/'))).toBe(false);
    expect([...packages].some((name) => name === '@earendil-works/pi-coding-agent'
      || name.startsWith('@earendil-works/pi-coding-agent/'))).toBe(false);
  });
});
