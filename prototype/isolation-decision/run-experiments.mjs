#!/usr/bin/env node
/**
 * PROTOTYPE (issue #124) — the macOS half of the "external isolation" decision.
 *
 * It runs, on this machine, the two things the ticket asks to be *proven* rather than argued:
 *
 *  1. A command the `tool_call` guard does not refuse — the guard matches write forms by word,
 *     and `node -e "…writeFileSync…"` has none — still cannot write the workspace, because the
 *     write fails at the system level. Also: the command-surface path (`spawn(node, [script])`)
 *     never enters the guard at all, and is covered by the same mechanism.
 *  2. What the mechanism costs: per-tool-call launch overhead, profile size sensitivity, and
 *     whether a second session process can be booted inside it.
 *
 * Two postures are measured side by side, because the ticket's motivation and its acceptance
 * criterion are not the same requirement:
 *
 *  - `workspace-deny` — deny writes to the workspace only. Keeps every skill that writes
 *    anywhere else working. Does NOT stop `rm -rf ~`, which is what #124 opens with.
 *  - `write-allowlist` — deny all writes, hand back TMPDIR / the user-level root / app data.
 *    Answers the motivation too; the cost is that a skill can no longer write anywhere else.
 *
 * It also attacks itself — hardlink, symlink, firmlink alias (`/System/Volumes/Data`), `..`
 * spelling, and a profile generated from a non-canonical path — because a boundary statement is
 * only worth writing if the escapes were actually tried.
 *
 * Usage:  node prototype/isolation-decision/run-experiments.mjs
 * Output: prototype/isolation-decision/evidence.json + a human-readable summary on stdout.
 *
 * Nothing here is product code. Nothing outside `.scratch/`, TMPDIR and `$HOME/.derivon-prototype-probe.txt`
 * is written, and the probe file is removed.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = path.join(HERE, '.scratch');
const REPO = path.resolve(HERE, '../..');
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const BASH = '/bin/bash';
const NODE = process.execPath;
const HOME = os.homedir();
const TMPDIR = os.tmpdir();
const HOME_PROBE = path.join(HOME, '.derivon-prototype-probe.txt');
const TMP_PROBE = path.join(TMPDIR, 'derivon-prototype-probe.txt');

const WS = path.join(SCRATCH, 'workspace');       // the workspace under test
const OUT = path.join(SCRATCH, 'outside');        // scratch that is neither workspace nor TMPDIR
const BIN = path.join(SCRATCH, 'bin');            // stands in for `<root>/bin`
const SKILL = path.join(SCRATCH, 'skill.mjs');    // stands in for a command-surface script
const COMPANION = path.join(REPO, 'dist-companion', 'companion.mjs');

/** What a session is allowed to keep writing under the strict posture. */
const ROOT = path.join(SCRATCH, 'config-root');   // stands in for `~/.derivon`
const APPDATA = path.join(SCRATCH, 'appdata');    // stands in for the app-data directory

const observations = [];
const contradictions = [];
const timings = {};
const notes = [];

/**
 * Files an attempt is observed through. They are removed for every run, because a probe that
 * is left behind from the previous posture reads as "nothing happened".
 */
const probeTargets = new Set();

/** A probe file's content as a comparable value: absent, unreadable, or its text. */
function readProbe(target) {
  try { return readFileSync(target, 'utf8'); } catch (error) { return error.code === 'ENOENT' ? '<absent>' : `<unreadable:${error.code}>`; }
}

let ws = WS;                                       // canonical workspace path, set after reset()
const say = (line) => process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function reset() {
  rmSync(SCRATCH, { recursive: true, force: true });
  for (const probe of probeTargets) rmSync(probe, { force: true });
  mkdirSync(BIN, { recursive: true });
  mkdirSync(path.join(WS, 'deep'), { recursive: true });
  mkdirSync(OUT, { recursive: true });
  mkdirSync(ROOT, { recursive: true });
  mkdirSync(APPDATA, { recursive: true });

  writeFileSync(path.join(WS, 'secret.txt'), 'original\n');
  writeFileSync(path.join(WS, 'deep', 'nested.txt'), 'original\n');
  writeFileSync(path.join(OUT, 'source.txt'), 'from-outside\n');
  writeFileSync(HOME_PROBE, 'original\n');   // a file in $HOME the strict posture must protect
  writeFileSync(TMP_PROBE, 'original\n');    // a file in TMPDIR nothing should have to protect
  writeFileSync(path.join(ROOT, 'selected-models.json'), '{}\n');
  // A permissive profile, for the "can a sandboxed process lift its own sandbox?" attempt.
  writeFileSync(path.join(BIN, 'permissive.sb'), '(version 1)\n(allow default)\n');

  // The command-surface script, in the shape `commandSurface.ts` runs one:
  // `spawn(process.execPath, [script, ...args])` — no `tool_call` hook anywhere on the way.
  writeFileSync(SKILL, [
    "import { writeFileSync } from 'node:fs';",
    'const [target, text] = process.argv.slice(2);',
    "writeFileSync(target, `${text}\\n`);",
    "process.stdout.write(`wrote ${target}\\n`);",
    '',
  ].join('\n'));
}

const POSTURES = [
  { id: 'none', label: 'no isolation (today)' },
  { id: 'workspace-deny', label: 'L1 · writes denied in the workspace only', template: 'learning-workspace-deny.sb.tmpl' },
  { id: 'write-allowlist', label: 'L2 · writes denied everywhere except an allow-list', template: 'learning-write-allowlist.sb.tmpl' },
];

/** Write the profile for a posture, and the wrapper `settings.shellPath` would point at. */
function profilesFor(posture, workspace = realpathSync(WS)) {
  if (!posture.template) return { profile: null, wrapper: null };
  const profile = path.join(BIN, `${posture.id}.sb`);
  writeFileSync(profile, readFileSync(path.join(HERE, posture.template), 'utf8')
    .replaceAll('__WORKSPACE__', workspace)
    .replaceAll('__HOME__', HOME)
    .replaceAll('__TMPDIR__', TMPDIR)
    .replaceAll('__ROOT__', realpathSync(ROOT))
    .replaceAll('__APPDATA__', realpathSync(APPDATA)));
  const wrapper = path.join(BIN, `${posture.id}-bash`);
  // Pi calls `{ shell, args: ['-c'] }`; the companion is started with `env_clear()` and five
  // allowed names, so a wrapper has to find everything by convention, not from the environment.
  writeFileSync(wrapper, [
    '#!/bin/sh',
    `here=$(cd "$(dirname "$0")" && pwd) || exit 126`,
    `exec ${SANDBOX_EXEC} -f "$here/${posture.id}.sb" ${BASH} "$@"`,
    '',
  ].join('\n'));
  chmodSync(wrapper, 0o755);
  return { profile, wrapper };
}

// ---------------------------------------------------------------------------
// Running and observing
// ---------------------------------------------------------------------------

/** Every file under the workspace, as relative path → `mode:content`, so a chmod counts. */
function snapshot(root) {
  const state = {};
  if (!existsSync(root)) return state;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) { state[rel] = '<dir>'; walk(full); }
      else {
        const mode = statSync(full).mode & 0o7777;
        let content;
        try { content = readFileSync(full, 'utf8'); } catch (error) { content = `<unreadable:${error.code}>`; }
        state[rel] = `${mode.toString(8)}:${content}`;
      }
    }
  };
  walk(root);
  return state;
}

/**
 * What a run is observed through.
 *
 * The workspace is the thing isolation is about, so a workspace change is the default signal —
 * but three questions (does it still delete $HOME? can it still write TMPDIR? did the network
 * answer?) are about other files, and those need their own lens.
 */
const signals = {
  workspace: () => 'workspace',
  /** The attempt is judged by whether this file's content changed (creation counts). */
  fileIs: (target) => { probeTargets.add(target); return ['probe', target]; },
};

function runPosture(command, { profile, wrapper }) {
  const argv = profile
    ? [SANDBOX_EXEC, '-f', profile, BASH, '-c', command]
    : [BASH, '-c', command];
  const started = process.hrtime.bigint();
  const result = spawnSync(argv[0], argv.slice(1), { cwd: SCRATCH, encoding: 'utf8', timeout: 20_000 });
  return {
    argv,
    status: result.status,
    stderr: (result.stderr ?? '').trim(),
    ms: Number(process.hrtime.bigint() - started) / 1e6,
    wrapper, // recorded so the evidence names what a wrapper adds; see cost()
  };
}

/**
 * One attempt under every posture.
 *
 * `expect` is a claim per posture — 'WROTE' if the design says the command should still be able
 * to write, 'NO-WRITE' if the design says the mechanism stops it. The point of running is that an
 * observation can disagree, and when it does it is printed as CONTRADICTS, not smoothed over.
 */
function attempt({ id, purpose, command, signal = signals.workspace(), expect, probes = [] }) {
  const [kind, target] = Array.isArray(signal) ? signal : [signal, null];
  for (const posture of POSTURES) {
    reset();
    const before = snapshot(WS);
    const probeBefore = target ? readProbe(target) : null;
    const { profile } = profilesFor(posture);
    const result = runPosture(command, { profile });
    const after = snapshot(WS);
    const changedWorkspace = JSON.stringify(before) !== JSON.stringify(after);
    const observed = kind === 'probe'
      ? (readProbe(target) !== probeBefore ? 'WROTE' : 'NO-WRITE')
      : (changedWorkspace ? 'WROTE' : 'NO-WRITE');
    const wanted = expect[posture.id];
    const verdict = wanted === observed ? 'PASS' : 'CONTRADICTS';
    if (verdict === 'CONTRADICTS') contradictions.push(`${id} [${posture.id}]: wanted ${wanted}, observed ${observed}`);
    observations.push({
      id, purpose, posture: posture.id, command,
      expect: wanted, observed, verdict,
      exitStatus: result.status,
      stderrFirstLine: result.stderr.split('\n')[0] ?? '',
      probes: probes.map((probe) => `${path.basename(probe)}=${existsSync(probe) ? 'exists' : 'absent'}`),
      ms: Number(result.ms.toFixed(1)),
    });
    const mark = verdict === 'PASS' ? '·' : '!';
    const detail = kind === 'probe' ? ` (${path.basename(target)})` : '';
    say(`  ${mark} ${posture.id.padEnd(15)} ${observed.padEnd(8)} ${id}${detail}`);
    // Only a profile that failed to *compile* or a command that never ran is worth the console
    // here; the denials themselves are collected once, below.
    if (result.stderr && /unbound|sandbox-exec:|Syntax|Invalid|No such file/.test(result.stderr)) {
      say(`      wanted ${wanted}; profile/tooling said: ${result.stderr.split('\n')[0]}`);
    }
  }
}

function section(title) {
  say(`\n== ${title} ==`);
}

// ---------------------------------------------------------------------------
// The commands under test
// ---------------------------------------------------------------------------

/**
 * The crafted command.
 *
 * The guard's write forms are words — rm/rmdir/mkdir/touch/truncate/tee, cp/mv/ln/install,
 * `dd of=`, `sed -i`, and redirections. `node -e` is none of those, so the guard sees a `bash`
 * call with no write target in it and lets it through. That is not a bug in the guard; it is the
 * reason #124 exists.
 */
const guardBypass = () => `node -e "require('node:fs').writeFileSync('${ws}/secret.txt','pwned\\\\n')"`;

function guardSection() {
  section('1. a command the guard does not refuse (control first: it really does write)');
  attempt({
    id: 'guard-invisible: node -e writes a workspace file',
    purpose: '命令里没有任何一个写入形式词，所以 tool_call 守卫会放行。',
    command: guardBypass(),
    expect: { none: 'WROTE', 'workspace-deny': 'NO-WRITE', 'write-allowlist': 'NO-WRITE' },
  });
  attempt({
    id: 'guard-invisible: node -e rewrites the manifest',
    purpose: '丢一个文件里最坏的那一个：工作区清单。',
    command: `node -e "require('node:fs').writeFileSync('${ws}/workspace.json','{ \\"broken\\": true }\\\\n')"`,
    expect: { none: 'WROTE', 'workspace-deny': 'NO-WRITE', 'write-allowlist': 'NO-WRITE' },
  });

  section('2. the command surface, which the guard never sees at all');
  attempt({
    id: 'command-surface script writes the workspace',
    purpose: 'spawn(node, [script]) —— 守卫不在这条路上，只有系统层拦得住。',
    command: `node ${SKILL} ${ws}/deep/nested.txt pwned`,
    expect: { none: 'WROTE', 'workspace-deny': 'NO-WRITE', 'write-allowlist': 'NO-WRITE' },
  });

  section('3. the forms the guard does catch — are they stopped one layer lower?');
  for (const [id, command] of [
    ['shell redirect', `printf pwned > ${ws}/secret.txt`],
    ['grandchild (bash → sh)', `${BASH} -c "sh -c 'printf pwned > ${ws}/secret.txt'"`],
    ['cp into the workspace', `cp ${path.join(OUT, 'source.txt')} ${ws}/copied.txt`],
    ['mv into the workspace', `mv ${path.join(OUT, 'source.txt')} ${ws}/moved.txt`],
    ['rm inside the workspace', `rm ${ws}/deep/nested.txt`],
    ['chmod inside the workspace', `chmod 000 ${ws}/secret.txt`],
    ['mv out of the workspace', `mv ${ws}/secret.txt ${path.join(OUT, 'taken.txt')}`],
  ]) {
    attempt({
      id, purpose: '守卫认得的写入形式，或一个后代进程。',
      command,
      expect: { none: 'WROTE', 'workspace-deny': 'NO-WRITE', 'write-allowlist': 'NO-WRITE' },
      probes: id.startsWith('mv out') ? [path.join(OUT, 'taken.txt')] : [],
    });
  }
}

function motivationSection() {
  section('4. the thing the ticket actually opens with: a granted script can `rm -rf ~`');
  attempt({
    id: 'delete a file in $HOME',
    purpose: 'L1 只禁工作区，所以这一条是两种姿态的分水岭。',
    command: `rm ${HOME_PROBE}`,
    signal: signals.fileIs(HOME_PROBE),
    expect: { none: 'WROTE', 'workspace-deny': 'WROTE', 'write-allowlist': 'NO-WRITE' },
  });
  attempt({
    id: 'write anywhere else in $HOME (e.g. ~/.zshrc, ~/.ssh/authorized_keys)',
    purpose: '删除是响的那种；覆写是安静的那种。',
    command: `printf pwned > ${path.join(HOME, '.derivon-prototype-probe.txt')}`,
    signal: signals.fileIs(HOME_PROBE),
    expect: { none: 'WROTE', 'workspace-deny': 'WROTE', 'write-allowlist': 'NO-WRITE' },
  });
  attempt({
    id: 'write a scratch file next to the workspace (neither TMPDIR nor root)',
    purpose: 'L2 的代价：技能想在工作区之外留一个产物文件。',
    command: `printf ok > ${path.join(OUT, 'artifact.txt')}`,
    signal: signals.fileIs(path.join(OUT, 'artifact.txt')),
    expect: { none: 'WROTE', 'workspace-deny': 'WROTE', 'write-allowlist': 'NO-WRITE' },
  });

  section('5. what must keep working');
  attempt({
    id: 'read the workspace',
    purpose: '学习侧要读工作区；禁写不能变成禁读。',
    command: `cat ${ws}/secret.txt > /dev/null && echo read-ok`,
    expect: { none: 'NO-WRITE', 'workspace-deny': 'NO-WRITE', 'write-allowlist': 'NO-WRITE' },
  });
  attempt({
    id: 'write a cache file in TMPDIR',
    purpose: '查证类工具会写临时文件。',
    command: `printf ok > ${path.join(TMPDIR, 'derivon-prototype-probe-2.txt')}`,
    signal: signals.fileIs(path.join(TMPDIR, 'derivon-prototype-probe-2.txt')),
    expect: { none: 'WROTE', 'workspace-deny': 'WROTE', 'write-allowlist': 'WROTE' },
  });
  attempt({
    id: 'write the user-level root (selected-models.json)',
    purpose: 'companion 自己维护 <root>；写不了它就等于会话坏了。',
    command: `printf '{ "m": 1 }' > ${path.join(ROOT, 'selected-models.json')}`,
    signal: signals.fileIs(path.join(ROOT, 'selected-models.json')),
    expect: { none: 'WROTE', 'workspace-deny': 'WROTE', 'write-allowlist': 'WROTE' },
  });
  attempt({
    id: 'write the application data directory (learner records)',
    purpose: 'ADR-0009 把学习者记录放在工作区之外，命令面要写它。',
    command: `printf ok > ${path.join(APPDATA, 'state.json')}`,
    signal: signals.fileIs(path.join(APPDATA, 'state.json')),
    expect: { none: 'WROTE', 'workspace-deny': 'WROTE', 'write-allowlist': 'WROTE' },
  });
  attempt({
    id: 'reach the network (a model call, tavily-cli)',
    purpose: '沙箱管的是写，不是连通性 —— 弄坏查证工具的沙箱不能出厂。',
    command: `node -e "fetch('https://example.com').then(r=>require('node:fs').writeFileSync('${path.join(TMPDIR, 'derivon-prototype-net.txt')}',String(r.status)))"`,
    signal: signals.fileIs(path.join(TMPDIR, 'derivon-prototype-net.txt')),
    expect: { none: 'WROTE', 'workspace-deny': 'WROTE', 'write-allowlist': 'WROTE' },
  });
}

function escapeSection() {
  section('6. escapes, tried on purpose');
  const cases = [
    ['hardlink out of the workspace, then rewrite through it',
      `ln ${ws}/secret.txt ${path.join(OUT, 'hard.txt')} && printf pwned > ${path.join(OUT, 'hard.txt')}`],
    ['symlink out of the workspace, then rewrite through it',
      `ln -s ${ws}/secret.txt ${path.join(OUT, 'sym.txt')} && printf pwned > ${path.join(OUT, 'sym.txt')}`],
    ['symlinked parent directory',
      `ln -s ${ws} ${path.join(OUT, 'alias')} && printf pwned > ${path.join(OUT, 'alias', 'secret.txt')}`],
    ['`..` spelling of the same path',
      `printf pwned > ${ws}/../workspace/secret.txt`],
    ['firmlink alias (/System/Volumes/Data)',
      `printf pwned > /System/Volumes/Data${ws}/alias.txt`],
    ['nested sandbox-exec with a permissive profile (can the child undo it?)',
      `${SANDBOX_EXEC} -f ${path.join(BIN, 'permissive.sb')} ${BASH} -c "printf pwned > ${ws}/secret.txt"`],
  ];
  for (const [id, command] of cases) {
    attempt({
      id, purpose: '路径型规则只有路径匹配做得好才算数；沙箱也不能被里面的进程摘掉。',
      command,
      expect: { none: 'WROTE', 'workspace-deny': 'NO-WRITE', 'write-allowlist': 'NO-WRITE' },
    });
  }

  // Metadata is not a file's bytes, and "cannot write" has to cover it too.
  const xattrResult = path.join(OUT, 'xattr-result.txt');
  attempt({
    id: 'extended attribute on a workspace file',
    purpose: '一种不是文件内容的写 —— 也在 file-write* 里吗？',
    command: `xattr -w derivon.isolation.probe pwned ${ws}/secret.txt && xattr -p derivon.isolation.probe ${ws}/secret.txt > ${xattrResult}`,
    signal: signals.fileIs(xattrResult),
    expect: { none: 'WROTE', 'workspace-deny': 'NO-WRITE', 'write-allowlist': 'NO-WRITE' },
  });
}

/**
 * The misconfiguration that matters most: a profile generated from the path spelling the
 * application happens to have, instead of the canonical one.
 *
 * macOS spells /var (TMPDIR) through a symlink, and so does any workspace reached through one.
 * A profile whose rule does not match enforces nothing, and nothing in the UI would say so.
 */
function misconfigurationSection() {
  section('7. a profile generated from a non-canonical path enforces nothing');
  const tmpSpelled = path.join(TMPDIR, `derivon-sbx-${process.pid}`);   // e.g. /var/folders/…/T/…
  const rows = [];
  let misconfiguredLeaked = false;
  for (const [id, templateFrom, writeVia] of [
    ['profile 用应用收到的拼写（/var/folders/…），写入走内核的拼写（/private/var/folders/…）',
      () => tmpSpelled, () => realpathSync(tmpSpelled)],
    ['profile 用 canonical 拼写，写入走应用的拼写',
      () => realpathSync(tmpSpelled), () => tmpSpelled],
  ]) {
    rmSync(tmpSpelled, { recursive: true, force: true });
    mkdirSync(tmpSpelled, { recursive: true });
    writeFileSync(path.join(tmpSpelled, 'secret.txt'), 'original\n');
    const posture = POSTURES.find((candidate) => candidate.id === 'workspace-deny');
    const profile = path.join(SCRATCH, 'misconfig.sb');
    writeFileSync(profile, readFileSync(path.join(HERE, posture.template), 'utf8')
      .replaceAll('__WORKSPACE__', templateFrom()));
    const target = path.join(writeVia(), 'secret.txt');
    const result = spawnSync(SANDBOX_EXEC, ['-f', profile, BASH, '-c', `printf pwned > ${target}`], { encoding: 'utf8' });
    const wrote = readFileSync(path.join(tmpSpelled, 'secret.txt'), 'utf8').includes('pwned');
    if (wrote) misconfiguredLeaked = true;
    rows.push({
      id, profileRule: path.relative(SCRATCH, profile), wrote,
      observed: wrote ? 'WROTE' : 'NO-WRITE',
      target,
      stderrFirstLine: (result.stderr ?? '').trim().split('\n')[0] ?? '',
    });
    say(`  ${wrote ? '!' : '·'} ${wrote ? 'WROTE' : 'NO-WRITE'}  ${id}`);
    if (result.stderr) say(`      stderr: ${(result.stderr ?? '').trim().split('\n')[0]}`);
    rmSync(tmpSpelled, { recursive: true, force: true });
  }
  notes.push(misconfiguredLeaked
    ? 'a profile generated from a non-canonical workspace path enforces nothing and fails silently — the application must canonicalize and verify, not trust the string'
    : 'the non-canonical profile did NOT leak; re-check this finding');
  return rows;
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))];

function measure({ id, n, argv, what }) {
  const samples = [];
  for (let i = 0; i < n; i += 1) {
    const started = process.hrtime.bigint();
    spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', cwd: SCRATCH });
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  timings[id] = { what, n, medianMs: Number(quantile(samples, 0.5).toFixed(2)), p90Ms: Number(quantile(samples, 0.9).toFixed(2)) };
  say(`  ${id.padEnd(52)} n=${String(n).padEnd(3)} median ${timings[id].medianMs} ms  p90 ${timings[id].p90Ms} ms`);
}

function costSection() {
  const posture = POSTURES.find((candidate) => candidate.id === 'workspace-deny');
  const { profile, wrapper } = profilesFor(posture);
  section('8. cost per tool call');
  measure({ id: 'bash -c true (no isolation, today)', what: 'spawning the shell Pi already spawns', n: 60, argv: [BASH, '-c', 'true'] });
  measure({ id: 'sandbox-exec -f profile bash -c true', what: 'shape A/B: one sandbox-exec in front of the shell', n: 60, argv: [SANDBOX_EXEC, '-f', profile, BASH, '-c', 'true'] });
  measure({ id: 'settings.shellPath wrapper → bash -c true', what: 'the same, plus the /bin/sh wrapper Pi would call', n: 60, argv: [wrapper, '-c', 'true'] });
  measure({ id: 'node -e "" (no isolation)', what: 'what a skill script costs already', n: 30, argv: [NODE, '-e', ''] });
  measure({ id: 'sandbox-exec -f profile node -e ""', what: 'the sandbox added to that', n: 30, argv: [SANDBOX_EXEC, '-f', profile, NODE, '-e', ''] });

  section('9. cost of the profile itself (it is compiled once per launch)');
  for (const rules of [1, 10, 100, 500]) {
    const big = path.join(BIN, `rules-${rules}.sb`);
    const body = Array.from({ length: rules }, (_, i) => `(deny file-write* (subpath "${path.join(OUT, 'nope', String(i))}"))`).join('\n');
    writeFileSync(big, `(version 1)\n(allow default)\n(deny file-write* (subpath "${ws}"))\n${body}\n`);
    measure({ id: `sandbox-exec with ${rules} deny rule(s)`, what: 'rule-count sensitivity', n: 30, argv: [SANDBOX_EXEC, '-f', big, BASH, '-c', 'true'] });
  }
}

/** Boot the real companion inside the profile: does the session shape survive the mechanism? */
async function companionSection() {
  section('10. the actual companion process, inside the profile');
  if (!existsSync(COMPANION)) {
    notes.push(`no ${path.relative(REPO, COMPANION)} — run \`npm run build:companion\` to measure it`);
    say('  companion not built; skipped');
    return;
  }
  const posture = POSTURES.find((candidate) => candidate.id === 'workspace-deny');
  const { profile } = profilesFor(posture);
  const probe = (label, argv) => new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(argv[0], argv.slice(1), {
      cwd: REPO, stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME, TMPDIR, LANG: process.env.LANG ?? 'en_US.UTF-8', LC_ALL: '' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      const rss = spawnSync('/bin/ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' }).stdout.trim();
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      child.kill('SIGKILL');
      resolve({
        label, aliveMs: Number(elapsed.toFixed(0)), rssKb: Number(rss) || null,
        stdoutBytes: stdout.length, stderrFirstLine: stderr.split('\n')[0] ?? '',
      });
    }, 2500);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ label, exitedEarlyWith: code, stdoutBytes: stdout.length, stderrFirstLine: stderr.split('\n')[0] ?? '', rssKb: null }); });
  });
  const configDir = ROOT;
  const rows = [
    await probe('bare node, no isolation', [NODE, '-e', 'setTimeout(()=>{},5000)']),
    await probe('companion, no isolation', [NODE, COMPANION, '--config-dir', configDir]),
    await probe('companion, inside the workspace-deny profile', [SANDBOX_EXEC, '-f', profile, NODE, COMPANION, '--config-dir', configDir]),
    await probe('companion, inside the write-allowlist profile', [
      SANDBOX_EXEC, '-f', profilesFor(POSTURES.find((candidate) => candidate.id === 'write-allowlist')).profile,
      NODE, COMPANION, '--config-dir', configDir,
    ]),
  ];
  for (const row of rows) {
    say(`  ${row.label.padEnd(52)} rss ${String(row.rssKb ?? `exit ${row.exitedEarlyWith}`).padEnd(9)} stderr: ${row.stderrFirstLine || '(silent)'}`);
  }
  timings.companion = rows;
}

// ---------------------------------------------------------------------------

reset();
ws = realpathSync(WS);
for (const posture of POSTURES) profilesFor(posture);

say('PROTOTYPE — issue #124, macOS mechanism evidence');
say(`macOS ${spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim()}  ${os.arch()}  node ${process.version}  (bundle ships ${readFileSync(path.join(REPO, 'scripts/prepare-companion.mjs'), 'utf8').match(/NODE_VERSION = '([^']+)'/)?.[1] ?? '?'})`);
say(`sandbox-exec: ${existsSync(SANDBOX_EXEC) ? 'present at /usr/bin/sandbox-exec (deprecated by Apple, still shipped)' : 'ABSENT'}`);
say(`workspace: ${ws}`);
if (!existsSync(SANDBOX_EXEC)) { say('nothing to measure without it'); process.exit(1); }

guardSection();
motivationSection();
escapeSection();
const misconfigurations = misconfigurationSection();
costSection();
await companionSection();

const banner = spawnSync(SANDBOX_EXEC, ['-f', path.join(BIN, 'workspace-deny.sb'), BASH, '-c', 'true'], { encoding: 'utf8' });
if (banner.stderr.trim()) notes.push(`sandbox-exec writes to stderr on every launch: ${banner.stderr.trim().split('\n')[0]}`);
rmSync(HOME_PROBE, { force: true });
rmSync(TMP_PROBE, { force: true });

const postures = Object.fromEntries(POSTURES.map((posture) => [posture.id, {
  label: posture.label,
  template: posture.template ?? null,
  profile: posture.template ? readFileSync(path.join(BIN, `${posture.id}.sb`), 'utf8') : null,
  wrapper: posture.template ? readFileSync(path.join(BIN, `${posture.id}-bash`), 'utf8') : null,
}]));

writeFileSync(path.join(HERE, 'evidence.json'), `${JSON.stringify({
  prototype: 'issue #124 external isolation — macOS mechanism evidence',
  generatedAt: new Date().toISOString(),
  host: {
    os: `macOS ${spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim()} (${os.arch()})`,
    node: process.version,
    nodeRuntime: NODE,
    sandboxExec: SANDBOX_EXEC,
    workspace: ws,
  },
  postures,
  attempts: observations,
  misconfigurations,
  timings,
  contradictions,
  notes,
}, null, 2)}\n`);

section('verdict');
say('  the mechanism\'s own words (kernel/host, not an application string):');
for (const row of observations.filter((r) => r.posture === 'workspace-deny' && r.observed === 'NO-WRITE' && r.stderrFirstLine).slice(0, 3)) {
  say(`    ${row.id}: ${row.stderrFirstLine}`);
}
const leaked = observations.filter((row) => row.posture !== 'none' && row.expect === 'NO-WRITE' && row.observed === 'WROTE');
const broke = observations.filter((row) => row.expect === 'WROTE' && row.observed === 'NO-WRITE');
say(`  writes that should have been denied but happened   : ${leaked.length}${leaked.length ? ` → ${[...new Set(leaked.map((r) => r.id))].join(', ')}` : ''}`);
say(`  things the mechanism broke that it must not break  : ${broke.length}${broke.length ? ` → ${[...new Set(broke.map((r) => r.id))].join(', ')}` : ''}`);
const l1Leaks = leaked.filter((row) => row.posture === 'workspace-deny');
say(`  workspace writes leaked under L1                   : ${l1Leaks.length}`);
say(`  misconfigured profile (non-canonical path)         : ${misconfigurations.map((row) => `${row.observed}`).join(' / ')}`);
if (notes.length) say(`  notes: ${notes.join(' | ')}`);
say(`  evidence.json written (${observations.length} observations, ${Object.keys(timings).length} timing groups)`);
