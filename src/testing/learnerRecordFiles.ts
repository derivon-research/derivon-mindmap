/**
 * A `LearnerRecordFiles` over a real directory, so a store or an editor is exercised against
 * the same filesystem shape the desktop host uses: `learner-records/<id>/<file>.json`, a
 * temporary sibling renamed over the target, and a version that is the SHA-256 of what was read.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  LearnerRecordFileRead, LearnerRecordFileName, LearnerRecordFiles,
} from '../ports/LearnerRecordFiles';

export function createTempLearnerRecordFiles(root: string): LearnerRecordFiles {
  const filePath = (workspaceId: string, file: LearnerRecordFileName) =>
    path.join(root, 'learner-records', workspaceId, `${file}.json`);
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const read = async (workspaceId: string, file: LearnerRecordFileName): Promise<LearnerRecordFileRead> => {
    let bytes: Buffer;
    try {
      bytes = await readFile(filePath(workspaceId, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { presence: 'missing' };
      throw error;
    }
    return { presence: 'present', text: bytes.toString('utf8'), version: digest(bytes) };
  };
  return {
    read,
    async write(workspaceId, file, text, precondition) {
      const target = filePath(workspaceId, file);
      const current = await read(workspaceId, file);
      if (current.presence !== precondition.presence
        || (current.presence === 'present' && precondition.presence === 'present' && current.version !== precondition.version)) {
        throw new Error(`学习者记录已被其他写入方更新（${file}.json）`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.part`;
      await writeFile(temporary, text);
      await rename(temporary, target);
      return digest(Buffer.from(text, 'utf8'));
    },
  };
}

/** Where the files above land, for a test that wants to look at or delete one. */
export function tempLearnerRecordPath(root: string, workspaceId: string, file: LearnerRecordFileName): string {
  return path.join(root, 'learner-records', workspaceId, `${file}.json`);
}
