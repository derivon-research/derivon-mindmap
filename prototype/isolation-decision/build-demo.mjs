#!/usr/bin/env node
/**
 * PROTOTYPE (issue #124) — inline evidence.json into the demo so the page is one file that
 * opens by double-click and can be mailed around.
 *
 *   node prototype/isolation-decision/run-experiments.mjs   # measure
 *   node prototype/isolation-decision/build-demo.mjs        # fold the measurement into the page
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const evidence = readFileSync(path.join(HERE, 'evidence.json'), 'utf8').trim();
const template = readFileSync(path.join(HERE, 'demo.template.html'), 'utf8');
// `</script>` inside a JSON string would close the block; a bare `</` is enough to be safe.
const page = template.replace('/*__EVIDENCE__*/', evidence.replaceAll('</', '<\\/'));
writeFileSync(path.join(HERE, 'isolation-decision.html'), page);
process.stdout.write(`wrote isolation-decision.html (${(page.length / 1024).toFixed(0)} KB, evidence inlined)\n`);
