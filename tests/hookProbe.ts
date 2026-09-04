import type { Page } from '@playwright/test';
import { TEST_HOOK_EVENT, type DerivonTestHook } from '../src/testHooks';

type HookWindow = Window & { __derivonShellHooks?: DerivonTestHook[] };

/** Listen for the runtime performance contract's events before application scripts run. */
export async function collectHooks(page: Page): Promise<void> {
  await page.addInitScript((eventName) => {
    const hookWindow = window as HookWindow;
    hookWindow.__derivonShellHooks = [];
    window.addEventListener(eventName, (event) => {
      hookWindow.__derivonShellHooks?.push((event as CustomEvent<DerivonTestHook>).detail);
    });
  }, TEST_HOOK_EVENT);
}

export function collectedHooks(page: Page): Promise<DerivonTestHook[]> {
  return page.evaluate(() => (window as HookWindow).__derivonShellHooks ?? []);
}
