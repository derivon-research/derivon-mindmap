#!/usr/bin/env node
/**
 * PROTOTYPE (issue #124) — does the crafted command really pass the guard?
 *
 * `findings.md` claims the guard lets `node -e "…writeFileSync(工作区…)"` through, because its
 * write forms are words (rm/mkdir/touch/tee/cp/mv/ln/install, `dd of=`, `sed -i`, redirections)
 * and `node -e` is none of them. That claim is checkable against the guard itself instead of
 * against a reading of it, so this asks the guard directly.
 *
 *   node prototype/isolation-decision/check-guard.mjs
 *
 * Read-only: it calls `guardDecision` and prints its answer.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardDecision } from '../../src/companion/guard.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ws = path.join(HERE, '.scratch', 'workspace');

const CASES = [
  ['crafted: node -e writes a workspace file', 'bash', { command: `node -e "require('node:fs').writeFileSync('${ws}/secret.txt','pwned\\n')"` }, 'pass'],
  ['crafted: node -e rewrites the manifest', 'bash', { command: `node -e "require('node:fs').writeFileSync('${ws}/workspace.json','{}\\n')"` }, 'pass'],
  ['crafted: skill script is invoked, not inspected', 'bash', { command: `node ${path.join(HERE, '.scratch', 'skill.mjs')} ${ws}/deep/nested.txt pwned` }, 'pass'],
  ['control: shell redirect', 'bash', { command: `printf pwned > ${ws}/secret.txt` }, 'refused'],
  ['control: rm inside the workspace', 'bash', { command: `rm ${ws}/deep/nested.txt` }, 'refused'],
  ['control: write tool', 'write', { path: path.join(ws, 'secret.txt'), content: 'pwned' }, 'refused'],
];

const pad = (text, width) => String(text).padEnd(width);
process.stdout.write(`guard: ${path.relative(process.cwd(), path.join(HERE, '../../src/companion/guard.ts'))}\n`);
process.stdout.write(`workspace: ${ws}\n\n`);

let surprises = 0;
for (const [label, toolName, input, expectation] of CASES) {
  const decision = guardDecision(toolName, input, ws);
  const actual = decision === undefined ? 'pass' : 'refused';
  const ok = actual === expectation;
  if (!ok) surprises += 1;
  process.stdout.write(`${ok ? '·' : '!'} ${pad(expectation, 8)} → ${pad(actual, 8)} ${label}\n`);
  if (decision !== undefined) process.stdout.write(`    reason: ${String(decision.reason ?? JSON.stringify(decision))}\n`);
}
process.stdout.write(`\n${surprises === 0
  ? 'the guard passes every crafted command and refuses every control: the ticket\'s premise holds'
  : `${surprises} case(s) disagree with findings.md — fix the document, not the guard`}\n`);
