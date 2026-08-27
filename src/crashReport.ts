import { invoke } from '@tauri-apps/api/core';

export const CRASH_REPORT_EVENT = 'derivon:crash-report';
export const FRONTEND_CRASH_REPORT_KEY = 'derivon.crash-report/v1';

const RESIZE_OBSERVER_LOOP_WARNINGS = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]);

type NativeCrashReport = {
  details: string;
  path: string;
};

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function isBenignResizeObserverWarning(message: string, error: unknown): boolean {
  return error == null && RESIZE_OBSERVER_LOOP_WARNINGS.has(message.trim());
}

export function isStoredResizeObserverWarning(details: string): boolean {
  if (!details.startsWith('来源: 前端未处理异常\n')) return false;
  const lastLine = details.trimEnd().split('\n').at(-1)?.trim() ?? '';
  return RESIZE_OBSERVER_LOOP_WARNINGS.has(lastLine);
}

function errorDetails(value: unknown): string[] {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = value;
  let depth = 0;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      lines.push(`${depth ? 'Caused by: ' : ''}${current.name}: ${current.message}`);
      if (current.stack) lines.push(...current.stack.split('\n').slice(1));
      current = current.cause;
    } else {
      lines.push(`${depth ? 'Caused by: ' : ''}${String(current)}`);
      current = undefined;
    }
    depth += 1;
  }
  return lines.length ? lines : ['Error: 未提供异常详情'];
}

export function formatFrontendCrash(source: string, error: unknown, context?: string): string {
  return [
    `来源: ${source}`,
    `时间: ${new Date().toISOString()}`,
    `页面: ${window.location.href}`,
    `User agent: ${navigator.userAgent}`,
    ...(context ? [`上下文: ${context}`] : []),
    '',
    ...errorDetails(error),
  ].join('\n');
}

export function persistFrontendCrash(details: string): void {
  try {
    localStorage.setItem(FRONTEND_CRASH_REPORT_KEY, details);
  } catch {
    // The in-memory event still lets the current session expose the report.
  }
  window.dispatchEvent(new CustomEvent(CRASH_REPORT_EVENT, { detail: { details } }));
}

export function installGlobalCrashCapture(): () => void {
  const handleError = (event: ErrorEvent) => {
    if (isBenignResizeObserverWarning(event.message, event.error)) return;
    persistFrontendCrash(formatFrontendCrash('前端未处理异常', event.error ?? event.message));
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    persistFrontendCrash(formatFrontendCrash('前端未处理 Promise rejection', event.reason));
  };
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);
  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}

export async function readPendingCrashReport(): Promise<string | null> {
  const reports: string[] = [];
  const frontend = localStorage.getItem(FRONTEND_CRASH_REPORT_KEY);
  if (frontend && isStoredResizeObserverWarning(frontend)) {
    localStorage.removeItem(FRONTEND_CRASH_REPORT_KEY);
  } else if (frontend) {
    reports.push(`=== Frontend ===\n${frontend}`);
  }
  if (isTauriRuntime()) {
    try {
      const native = await invoke<NativeCrashReport | null>('read_crash_report');
      if (native) reports.push(`=== Rust / Tauri ===\n报告文件: ${native.path}\n${native.details}`);
    } catch {
      // A frontend report must remain available even if the native bridge cannot be queried.
    }
  }
  return reports.length ? reports.join('\n\n') : null;
}

export async function clearPendingCrashReports(): Promise<void> {
  localStorage.removeItem(FRONTEND_CRASH_REPORT_KEY);
  if (isTauriRuntime()) await invoke('clear_crash_report');
}
