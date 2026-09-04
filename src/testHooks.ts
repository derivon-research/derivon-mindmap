export const TEST_HOOK_EVENT = 'derivon:test-hook';
export const TEST_HOOK_VERSION = 1;

export type TestHookInteraction = 'select-point' | 'switch-target' | 'toggle-panel';
export type TestHookContext = Record<string, string | boolean>;
export type DerivonTestHook = {
  version: typeof TEST_HOOK_VERSION;
  sequence: number;
  at: number;
  kind: 'interactive' | 'interaction-complete';
  interaction?: TestHookInteraction;
  context?: TestHookContext;
};

let sequence = 0;

function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => {
    requestAnimationFrame(() => resolve());
  }));
}

async function emitTestHook(
  hook: Omit<DerivonTestHook, 'version' | 'sequence' | 'at'>,
): Promise<void> {
  await afterPaint();
  window.dispatchEvent(new CustomEvent<DerivonTestHook>(TEST_HOOK_EVENT, {
    detail: {
      version: TEST_HOOK_VERSION,
      sequence: ++sequence,
      at: performance.now(),
      ...hook,
    },
  }));
}

export function emitInteractiveTestHook(): Promise<void> {
  return emitTestHook({ kind: 'interactive' });
}

export function emitInteractionCompleteTestHook(
  interaction: TestHookInteraction,
  context: TestHookContext,
): Promise<void> {
  return emitTestHook({ kind: 'interaction-complete', interaction, context });
}
