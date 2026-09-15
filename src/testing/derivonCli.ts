import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** One invocation of the fixture CLI, as it saw itself. */
export type CliCall = {
  readonly argv: readonly string[];
  readonly input: string;
};

/** What installing the fixture under a throwaway directory handed back. */
export type DerivonCli = {
  /** The one directory to put on `PATH`. */
  readonly binDirectory: string;
  /** Every invocation so far, in order. */
  readonly calls: () => Promise<CliCall[]>;
};

/**
 * The `derivon` CLI a companion test installs on `PATH` instead of the operator's own.
 *
 * Deliberately not the real CLI: this repository's tests must not depend on a sibling checkout
 * or on what the machine has installed, and what the companion owes is the wiring — one argv
 * array, the workspace's own `graph` on stdin, and stdout, stderr and the exit code back
 * unchanged. What it does speak is the installed contract's shape: the same commands, the same
 * flags, JSON on stdout, a usage error with exit 2, and `--pretty`.
 *
 * It answers from the graph it is handed rather than from a canned document, so a test can
 * prove that the graph which arrived is the workspace's, and it records each invocation beside
 * itself so a test can prove what the argv was.
 */
export async function installDerivonCli(directory: string, interpreter: string = process.execPath): Promise<DerivonCli> {
  const binDirectory = path.join(directory, 'bin');
  const recordPath = path.join(directory, 'invocations.jsonl');
  await mkdir(binDirectory, { recursive: true });
  const script = path.join(binDirectory, 'derivon');
  await writeFile(script, derivonCliScript(recordPath, interpreter));
  // The kernel has to run it by name, the way it runs the installed CLI.
  await chmod(script, 0o755);
  return { binDirectory, calls: () => readCalls(recordPath) };
}

async function readCalls(recordPath: string): Promise<CliCall[]> {
  try {
    const text = await readFile(recordPath, 'utf8');
    const calls: CliCall[] = [];
    for (const line of text.split('\n')) {
      if (line) calls.push(JSON.parse(line) as CliCall);
    }
    return calls;
  } catch {
    // No file means the CLI was never started — a distinguishable outcome, and the tests that
    // expect nothing to run assert on exactly that.
    return [];
  }
}

/**
 * The fixture's source, with the path it records into baked in.
 *
 * Written as one file a test executes by name, so nothing about the fixture is injected into the
 * companion: the shell finds it on `PATH` exactly the way it finds the installed CLI. Its
 * interpreter is named by absolute path rather than through `env node`, because a test that
 * depended on the developer's `node` would be testing the machine rather than the companion.
 */
function derivonCliScript(recordPath: string, interpreter: string): string {
  return `#!${interpreter}
import { appendFileSync } from 'node:fs';

const RECORD = ${JSON.stringify(recordPath)};

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  appendFileSync(RECORD, JSON.stringify({ argv: process.argv.slice(2), input }) + '\\n');
  run(process.argv.slice(2), input);
});

function run(argv, graphText) {
  // One switch for how the whole document is printed, the way the installed contract has it.
  const pretty = argv.includes('--pretty');
  const print = (value) => {
    process.stdout.write((pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + '\\n');
  };
  // A usage error the way the installed CLI reports one: one JSON object on stderr, nothing on
  // stdout, and its own exit code.
  const usage = (message) => {
    process.stderr.write(JSON.stringify({ error: { code: 'invalid_arguments', message } }) + '\\n');
    process.exitCode = 64;
  };
  const flag = (name) => argv.flatMap((word, index) =>
    (word === name && index + 1 < argv.length ? [argv[index + 1]] : []));

  if (argv[0] === '--version') {
    process.stdout.write('derivon 9.9.9-fixture\\n');
    return;
  }
  if (argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write('Stateless operations on Derivon weighted directed B-hypergraphs\\n');
    return;
  }

  const graph = JSON.parse(graphText);
  const command = argv[0];
  const subject = argv[1];
  const starts = flag('--start');
  const targets = flag('--target');
  const reached = closure(graph, starts);

  if (command === 'point' && subject === 'list') return print(graph.points);
  if (command === 'hyperedge' && subject === 'list') return print(graph.hyperedges);
  if (command === 'query' && subject === 'closure') {
    return print({
      pointIds: graph.points.map((point) => point.id).filter((id) => reached.has(id)),
      startPointIds: starts,
    });
  }
  if (command === 'query' && subject === 'route') {
    if (!targets.length) return usage('error: the following required arguments were not provided:\\n  --target <TARGETS>');
    const selected = graph.hyperedges.filter((edge) =>
      reached.has(edge.head) && edge.tails.every((tail) => reached.has(tail)));
    const reachable = targets.every((target) => reached.has(target));
    return print({
      reachable,
      cost: reachable ? selected.reduce((total, edge) => total + edge.weight, 0) : null,
      executableOrder: selected.map((edge) => edge.id),
      hyperedgeIds: selected.map((edge) => edge.id),
      pointIds: graph.points.map((point) => point.id).filter((id) => reached.has(id)),
      startPointIds: starts,
      targetPointIds: targets,
      provenOptimal: reachable,
    });
  }
  if (command === 'query' && subject === 'diagnose') {
    if (!targets.length) return usage('error: the following required arguments were not provided:\\n  --target <TARGETS>');
    return print({
      reachable: targets.every((target) => reached.has(target)),
      startPointIds: starts,
      targetPointIds: targets,
      targetDiagnoses: targets.map((target) => ({
        targetPointId: target,
        blockingPointIds: reached.has(target) ? [] : [target],
        cycles: [],
      })),
    });
  }
  return usage("error: unrecognized subcommand '" + String(command) + "'");
}

function closure(graph, starts) {
  const reached = new Set(starts);
  for (let grew = true; grew;) {
    grew = false;
    for (const edge of graph.hyperedges) {
      if (edge.tails.every((tail) => reached.has(tail)) && !reached.has(edge.head)) {
        reached.add(edge.head);
        grew = true;
      }
    }
  }
  return reached;
}
`;
}
