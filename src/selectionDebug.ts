const DEBUG_ENDPOINT = '/__derivon_selection_debug';

export const selectionDebugEnabled = new URLSearchParams(window.location.search).get('debugSelection') === '1';

const sessionId = selectionDebugEnabled
  ? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  : '';
let sequence = 0;
const ready = selectionDebugEnabled
  ? fetch(DEBUG_ENDPOINT, { method: 'DELETE' }).catch(() => undefined)
  : Promise.resolve();

export function traceSelection(event: string, details: Record<string, unknown> = {}) {
  if (!selectionDebugEnabled) return;
  const entry = {
    sessionId,
    sequence: ++sequence,
    timestamp: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() * 10) / 10,
    event,
    ...details,
  };
  console.debug('[selection-debug]', entry);
  void ready.then(() => fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    keepalive: true,
  })).catch(() => undefined);
}
