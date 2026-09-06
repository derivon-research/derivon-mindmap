export const FRONTEND_CRASH_REPORT_KEY = 'derivon.crash-report/v1';

export function clearStoredFrontendCrashReport(): void {
  try { window.localStorage.removeItem(FRONTEND_CRASH_REPORT_KEY); }
  catch { /* Unavailable diagnostic storage must not prevent application startup. */ }
}
