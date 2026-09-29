import { describe, expect, it, vi } from 'vitest';
import type { DesktopInvoke } from './desktopWorkspaceSource';
import { createDesktopLearnerRecordFiles } from './desktopLearnerRecords';

describe('the desktop learner record files port', () => {
  it('reads a present record and carries the version the write has to match', async () => {
    const invoke = vi.fn(async () => ({ text: '{}\n', version: 'v1' })) as unknown as DesktopInvoke;
    await expect(createDesktopLearnerRecordFiles(invoke).read('math-reforged', { kind: 'state' }))
      .resolves.toEqual({ presence: 'present', text: '{}\n', version: 'v1' });
    expect(invoke).toHaveBeenCalledWith('read_learner_record', { workspaceId: 'math-reforged', file: { kind: 'state' } });
  });

  it('reads an absent record as missing rather than as bad content', async () => {
    const invoke = vi.fn(async () => ({ text: null, version: null })) as unknown as DesktopInvoke;
    await expect(createDesktopLearnerRecordFiles(invoke).read('w', { kind: 'route', id: 'r-k7f3q2' }))
      .resolves.toEqual({ presence: 'missing' });
    expect(invoke).toHaveBeenCalledWith('read_learner_record', { workspaceId: 'w', file: { kind: 'route', id: 'r-k7f3q2' } });
  });

  it('sends the read version as the precondition, and null for a record it read as absent', async () => {
    const invoke = vi.fn(async () => 'v2') as unknown as DesktopInvoke;
    const files = createDesktopLearnerRecordFiles(invoke);
    await files.write('w', { kind: 'state' }, '{}\n', { presence: 'present', version: 'v1' });
    expect(invoke).toHaveBeenLastCalledWith('write_learner_record', {
      workspaceId: 'w', file: { kind: 'state' }, text: '{}\n', expectedVersion: 'v1',
    });
    await files.write('w', { kind: 'route', id: 'r-k7f3q2' }, '{}\n', { presence: 'missing' });
    expect(invoke).toHaveBeenLastCalledWith('write_learner_record', {
      workspaceId: 'w', file: { kind: 'route', id: 'r-k7f3q2' }, text: '{}\n', expectedVersion: null,
    });
  });

  it('lists and deletes personal routes through their own commands', async () => {
    const invoke = vi.fn(async (command: string) => (command === 'list_learner_routes' ? ['r-k7f3q2.json'] : null)) as unknown as DesktopInvoke;
    const files = createDesktopLearnerRecordFiles(invoke);
    await expect(files.listRoutes('w')).resolves.toEqual(['r-k7f3q2.json']);
    expect(invoke).toHaveBeenLastCalledWith('list_learner_routes', { workspaceId: 'w' });
    await files.deleteRoute('w', 'r-k7f3q2', 'v1');
    expect(invoke).toHaveBeenLastCalledWith('delete_learner_route', { workspaceId: 'w', routeId: 'r-k7f3q2', expectedVersion: 'v1' });
  });
});
