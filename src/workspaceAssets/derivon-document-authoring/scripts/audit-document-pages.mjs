#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const usage = `Usage:
  node audit-document-pages.mjs [--base-url <url>] [--runtime <project>] <workspace> [object-id-or-document ...]

Static publication checks have no package dependency. With --base-url, the runtime
project must provide playwright and the command also audits a 390px browser viewport.`;

const argv = process.argv.slice(2);
function takeOption(name) {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} requires a value.`);
  argv.splice(index, 2);
  return value;
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(usage);
  process.exit(0);
}
const baseUrl = takeOption('--base-url');
const runtimeRoot = takeOption('--runtime') || process.env.DERIVON_RUNTIME_ROOT || process.cwd();
const workspaceRoot = resolve(argv.shift() || '.');
const selectors = new Set(argv.map((value) => value.replace(/\/$/, '')));
const manifestPath = resolve(workspaceRoot, '.derivon/workspace.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.graph || !Array.isArray(manifest.graph.points) || !Array.isArray(manifest.graph.hyperedges)) {
  throw new Error(`Invalid Derivon manifest: ${manifestPath}`);
}

const objects = [...manifest.graph.points, ...manifest.graph.hyperedges]
  .map((object) => ({ id: object.id, document: object.data?.document, format: object.data?.format }))
  .filter((object) => object.format === 'markdown' && typeof object.document === 'string');
const selected = selectors.size === 0
  ? objects
  : objects.filter((object) => selectors.has(object.id)
    || selectors.has(object.document)
    || selectors.has(object.document.split('/').at(-1)));
if (selected.length === 0) throw new Error('No matching Markdown documents.');

const issues = [];
for (const object of selected) {
  const sourcePath = resolve(workspaceRoot, object.document, 'document.md');
  const publicationPath = resolve(workspaceRoot, object.document, 'index.html');
  try {
    await readFile(sourcePath, 'utf8');
    const html = await readFile(publicationPath, 'utf8');
    const visibleMarkup = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '');
    if (!/<meta\s+name=["']viewport["']/i.test(html)) issues.push(`${object.document}: missing viewport meta tag`);
    if (/class=["'][^"']*\bkatex-error\b/i.test(html)) issues.push(`${object.document}: contains a KaTeX error`);
    if (/\$/.test(visibleMarkup)) issues.push(`${object.document}: contains a visible dollar delimiter`);
  } catch (error) {
    issues.push(`${object.document}: ${error?.code === 'ENOENT' ? 'missing source or publication file' : error.message}`);
  }
}

if (baseUrl) {
  let chromium;
  try {
    const runtimeRequire = createRequire(resolve(runtimeRoot, 'package.json'));
    ({ chromium } = runtimeRequire('playwright'));
  } catch (error) {
    console.error(`Cannot load Playwright from ${resolve(runtimeRoot)}.`);
    console.error('Pass --runtime <project> pointing to a project with playwright installed.');
    throw error;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  for (const object of selected) {
    consoleErrors = [];
    const url = new URL(`${object.document}/index.html`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    await page.goto(url.href, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => {
      const components = [...document.body.querySelectorAll('div')]
        .filter((element) => element.querySelector(':scope > style') && element.querySelector(':scope > script'));
      return {
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        katexErrors: document.querySelectorAll('.katex-error').length,
        visibleDollars: (document.body.innerText.match(/\$/g) || []).length,
        formulaOverflow: [...document.querySelectorAll('.katex-display')]
          .some((formula) => formula.scrollWidth > formula.clientWidth),
        componentScroll: components.some((component) => component.scrollHeight > component.clientHeight + 1),
      };
    });
    if (result.pageOverflow) issues.push(`${object.document}: page overflows horizontally at 390px`);
    if (result.katexErrors) issues.push(`${object.document}: browser found ${result.katexErrors} KaTeX error(s)`);
    if (result.visibleDollars) issues.push(`${object.document}: browser found visible dollar delimiters`);
    if (result.formulaOverflow) issues.push(`${object.document}: a displayed formula needs horizontal scrolling at 390px`);
    if (result.componentScroll) issues.push(`${object.document}: an interactive component has internal vertical overflow`);
    for (const error of consoleErrors) issues.push(`${object.document}: console error: ${error}`);
  }
  await browser.close();
}

if (issues.length > 0) {
  for (const issue of issues) console.error(`error  ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`ok     ${selected.length} publication(s) audited${baseUrl ? ' in a 390px browser viewport' : ''}`);
}
