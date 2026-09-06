import { afterEach, expect, it, vi } from 'vitest';
import { clearStoredFrontendCrashReport, FRONTEND_CRASH_REPORT_KEY } from './browserDiagnostics';

afterEach(() => vi.unstubAllGlobals());

it('clears only the previous diagnostic report and tolerates unavailable storage', () => {
  const removeItem = vi.fn();
  vi.stubGlobal('window', { localStorage: { removeItem } });
  clearStoredFrontendCrashReport();
  expect(removeItem).toHaveBeenCalledExactlyOnceWith(FRONTEND_CRASH_REPORT_KEY);
  removeItem.mockImplementation(() => { throw new Error('storage unavailable'); });
  expect(clearStoredFrontendCrashReport).not.toThrow();
});
