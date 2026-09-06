import { readFileSync } from 'node:fs';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit, TauriEvent } from '@tauri-apps/api/event';
import { afterEach, expect, it, vi } from 'vitest';
import { createWorkspace } from '../../workspace/index';
import { createDesktopWorkspaceActions } from './desktopWorkspaces';

const capability = JSON.parse(readFileSync(new URL('../../../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));

afterEach(() => { clearMocks(); vi.unstubAllGlobals(); });

it('uses the native SDK close path, permits confirmed close, and unregisters the guard', async () => {
  const confirm = vi.fn(() => false);
  vi.stubGlobal('window', { crypto: globalThis.crypto, confirm });
  const destroy = vi.fn();
  mockWindows('main');
  mockIPC((command) => {
    if (command === 'read_workspace_source_graph') return createWorkspace({ title: 'Test' }).content.graphText;
    if (command === 'plugin:window|destroy') {
      expect(capability.permissions).toContain('core:window:allow-destroy');
      destroy();
      return;
    }
    throw new Error(`Unexpected command: ${command}`);
  }, { shouldMockEvents: true });
  const workspace = await createDesktopWorkspaceActions().openRecentWorkspace('/tmp/test');
  let protectedChanges = true;
  const unregister = await workspace.registerCloseGuard!(() => protectedChanges);
  await emit(TauriEvent.WINDOW_CLOSE_REQUESTED);
  expect(confirm).toHaveBeenCalledOnce();
  expect(destroy).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await emit(TauriEvent.WINDOW_CLOSE_REQUESTED);
  await expect.poll(() => destroy.mock.calls.length).toBe(1);
  protectedChanges = false;
  await emit(TauriEvent.WINDOW_CLOSE_REQUESTED);
  await expect.poll(() => destroy.mock.calls.length).toBe(2);
  expect(confirm).toHaveBeenCalledTimes(2);
  unregister();
  await emit(TauriEvent.WINDOW_CLOSE_REQUESTED);
  expect(destroy).toHaveBeenCalledTimes(2);
});
