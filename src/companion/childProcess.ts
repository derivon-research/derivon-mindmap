import { spawn } from 'node:child_process';

/**
 * One child process, and what it did.
 *
 * The companion runs two kinds of child: the command surface's script, under the application's
 * own Node, and the operator's `derivon`, by name. Starting either one and collecting what it
 * said is the same plumbing both times — both streams as text, the input handed over on stdin,
 * the exit code reported — so it is written once here rather than twice at the two call sites,
 * where the parts that are easy to get wrong (the EPIPE write, the abort, the process that never
 * starts) would be the parts most likely to drift apart.
 */
export type ProcessResult = {
  /** `null` when the process did not exit on its own: a signal, or a failure to start. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** The process could not be started at all. The streams then hold whatever was captured. */
  readonly failure: Error | null;
};

/**
 * Run one command to completion.
 *
 * The child is spawned without a shell, so the command and every argument reach it as written
 * and nothing between here and the OS interprets them.
 */
export function runProcess(options: {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdin?: string;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
}): Promise<ProcessResult> {
  const { command, args, stdin, cwd, signal } = options;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ code: null, stdout: '', stderr: '', failure: asError(error) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    // A child that exits before reading its input leaves the write to fail with EPIPE, and an
    // unhandled 'error' on a stream would take the companion down with it. The exit code and the
    // output are the whole report; the failed write adds nothing to them.
    child.stdin.on('error', () => {});
    const abort = () => { child.kill(); };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const settle = (result: ProcessResult) => {
      signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    child.on('error', (error) => settle({ code: null, stdout, stderr, failure: asError(error) }));
    child.on('close', (code) => settle({ code, stdout, stderr, failure: null }));
    if (stdin === undefined) child.stdin.end();
    else child.stdin.end(stdin);
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
