export const TEST_HOOK_EVENT = 'derivon:test-hook';
export const TEST_HOOK_BUFFER = '__derivonTestHooksV1';
export const TEST_HOOK_VERSION = 1;

export type TestHookInteraction = 'select-concept' | 'switch-target' | 'toggle-panel';
export type TestHookInteractionContext = {
  'select-concept': { conceptId: string };
  'switch-target': { conceptId: string; selected: boolean };
  'toggle-panel': { panel: 'route'; expanded: boolean };
};

export type TestHookInteractionCompletion = {
  [Interaction in TestHookInteraction]: {
    interaction: Interaction;
    context: TestHookInteractionContext[Interaction];
    startedAtMs: number;
  }
}[TestHookInteraction];

type TestHookPayload =
  | { kind: 'interactive' }
  | ({ kind: 'interaction-complete' } & TestHookInteractionCompletion);

export type DerivonTestHook = TestHookPayload & {
  version: typeof TEST_HOOK_VERSION;
  sequence: number;
  completedAtMs: number;
};

let sequence = 0;

function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => {
    requestAnimationFrame(() => resolve());
  }));
}

async function emitTestHook(payload: TestHookPayload): Promise<void> {
  await afterPaint();
  const detail = {
    version: TEST_HOOK_VERSION,
    sequence: ++sequence,
    completedAtMs: performance.now(),
    ...payload,
  } as DerivonTestHook;
  const testWindow = window as Window & { [TEST_HOOK_BUFFER]?: DerivonTestHook[] };
  (testWindow[TEST_HOOK_BUFFER] ??= []).push(detail);
  window.dispatchEvent(new CustomEvent<DerivonTestHook>(TEST_HOOK_EVENT, { detail }));
}

export function emitInteractiveTestHook(): Promise<void> {
  return emitTestHook({ kind: 'interactive' });
}

export function emitInteractionCompleteTestHook(
  completion: TestHookInteractionCompletion,
): Promise<void> {
  return emitTestHook({ kind: 'interaction-complete', ...completion });
}
