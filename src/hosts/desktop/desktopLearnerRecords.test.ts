import { describe, expect, it, vi } from 'vitest';
import type { DesktopInvoke } from './desktopWorkspaceSource';
import { createDesktopLearnerRecordFiles } from './desktopLearnerRecords';

describe('the desktop learner record files port', () => {
  it('reads a present record and carries the version the write has to match', async () => {
    const invoke = vi.fn(async () => ({ text: '{}\n', version: 'v1' })) as unknown as DesktopInvoke;
    await expect(createDesktopLearnerRecordFiles(invoke).read('math-reforged', 'state'))
      .resolves.toEqual({ presence: 'present', text: '{}\n', version: 'v1' });
    expect(invoke).toHaveBeenCalledWith('read_learner_record', { workspaceId: 'math-reforged', file: 'state' });
  });

  it('reads an absent record as missing rather than as bad content', async () => {
    const invoke = vi.fn(async () => ({ text: null, version: null })) as unknown as DesktopInvoke;
    await expect(createDesktopLearnerRecordFiles(invoke).read('w', 'routes')).resolves.toEqual({ presence: 'missing' });
  });

  it('sends the read version as the precondition, and null for a record it read as absent', async () => {
    const invoke = vi.fn(async () => 'v2') as unknown as DesktopInvoke;
    const files = createDesktopLearnerRecordFiles(invoke);
    await files.write('w', 'state', '{}\n', { presence: 'present', version: 'v1' });
    expect(invoke).toHaveBeenLastCalledWith('write_learner_record', {
      workspaceId: 'w', file: 'state', text: '{}\n', expectedVersion: 'v1',
    });
    await files.write('w', 'state', '{}\n', { presence: 'missing' });
    expect(invoke).toHaveBeenLastCalledWith('write_learner_record', {
      workspaceId: 'w', file: 'state', text: '{}\n', expectedVersion: null,
    });
  });
});
