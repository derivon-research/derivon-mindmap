export const READY_THRESHOLD_MS = 2_500;
export const INTERACTION_THRESHOLD_MS = 200;

export function integerEnvironmentValue(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

export type RuntimeSample = {
  run: number;
  readyMs: number;
  selectConceptMs: number;
  switchTargetMs: number;
  panelExpandMs: number;
  panelCollapseMs: number;
};

export type Distribution = {
  samples: number;
  min: number;
  median: number;
  p75: number;
  p95: number;
  max: number;
};

function percentile(values: number[], ratio: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)];
}

function distribution(values: number[]): Distribution {
  return {
    samples: values.length,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

export function summarizeRuntime(samples: RuntimeSample[]) {
  return {
    runs: samples.length,
    readyMs: distribution(samples.map((sample) => sample.readyMs)),
    interactionMs: {
      selectConcept: distribution(samples.map((sample) => sample.selectConceptMs)),
      switchTarget: distribution(samples.map((sample) => sample.switchTargetMs)),
      togglePanel: distribution(samples.flatMap((sample) => [sample.panelExpandMs, sample.panelCollapseMs])),
    },
  };
}

export type RuntimeSummary = ReturnType<typeof summarizeRuntime>;

function formatDistribution(name: string, values: Distribution, threshold: number): string {
  const number = (value: number) => value.toFixed(1).padStart(7);
  return `| ${name} | ${values.samples} | ${number(values.min)} | ${number(values.median)} | ${number(values.p75)} | ${number(values.p95)} | ${number(values.max)} | ${threshold} |`;
}

export function formatRuntimeSummary(
  host: 'web' | 'desktop',
  fixtureName: string,
  conceptCount: number,
  summary: RuntimeSummary,
): string {
  return [
    `# Runtime performance: ${fixtureName}`,
    '',
    `Host: ${host}. Fixture size: ${conceptCount} concepts. Samples: ${summary.runs}.`,
    '',
    '| Metric | Samples | Min ms | Median ms | P75 ms | P95 ms | Max ms | Limit ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    formatDistribution('Open to interactive', summary.readyMs, READY_THRESHOLD_MS),
    formatDistribution('Select concept', summary.interactionMs.selectConcept, INTERACTION_THRESHOLD_MS),
    formatDistribution('Switch target', summary.interactionMs.switchTarget, INTERACTION_THRESHOLD_MS),
    formatDistribution('Toggle panel', summary.interactionMs.togglePanel, INTERACTION_THRESHOLD_MS),
    '',
  ].join('\n');
}

export function runtimeBudgetFailures(summary: RuntimeSummary): string[] {
  const failures: string[] = [];
  if (summary.readyMs.max > READY_THRESHOLD_MS) {
    failures.push(`open to interactive ${summary.readyMs.max.toFixed(1)} ms > ${READY_THRESHOLD_MS} ms`);
  }
  if (summary.interactionMs.selectConcept.max > INTERACTION_THRESHOLD_MS) {
    failures.push(`select concept ${summary.interactionMs.selectConcept.max.toFixed(1)} ms > ${INTERACTION_THRESHOLD_MS} ms`);
  }
  if (summary.interactionMs.switchTarget.max > INTERACTION_THRESHOLD_MS) {
    failures.push(`switch target ${summary.interactionMs.switchTarget.max.toFixed(1)} ms > ${INTERACTION_THRESHOLD_MS} ms`);
  }
  if (summary.interactionMs.togglePanel.max > INTERACTION_THRESHOLD_MS) {
    failures.push(`toggle panel ${summary.interactionMs.togglePanel.max.toFixed(1)} ms > ${INTERACTION_THRESHOLD_MS} ms`);
  }
  return failures;
}
