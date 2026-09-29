/**
 * A `LearnerRecordFiles` over a real directory, so a store or an editor is exercised against
 * the same filesystem shape the desktop host uses: `learner-records/<id>/state.json` and
 * `learner-records/<id>/routes/<route id>.json`, a temporary sibling renamed over the target,
 * and a version that is the SHA-256 of what was read.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  LearnerRecordFile, LearnerRecordFileRead, LearnerRecordFiles,
} from '../ports/LearnerRecordFiles';
import { isRouteId } from '../workspace/index';

export function createTempLearnerRecordFiles(root: string): LearnerRecordFiles {
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const read = async (workspaceId: string, file: LearnerRecordFile): Promise<LearnerRecordFileRead> => {
    let bytes: Buffer;
    try {
      bytes = await readFile(tempLearnerRecordPath(root, workspaceId, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { presence: 'missing' };
      throw error;
    }
    return { presence: 'present', text: bytes.toString('utf8'), version: digest(bytes) };
  };
  const expect = async (workspaceId: string, file: LearnerRecordFile, version: string | null) => {
    const current = await read(workspaceId, file);
    if ((current.presence === 'present' ? current.version : null) !== version) {
      throw new Error(`学习者记录已被其他写入方更新（${path.basename(tempLearnerRecordPath(root, workspaceId, file))}）`);
    }
  };
  return {
    read,
    async write(workspaceId, file, text, precondition) {
      const target = tempLearnerRecordPath(root, workspaceId, file);
      await expect(workspaceId, file, precondition.presence === 'present' ? precondition.version : null);
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.part`;
      await writeFile(temporary, text);
      await rename(temporary, target);
      return digest(Buffer.from(text, 'utf8'));
    },
    async deleteRoute(workspaceId, routeId, version) {
      const file = { kind: 'route', id: routeId } as const;
      await expect(workspaceId, file, version);
      await rm(tempLearnerRecordPath(root, workspaceId, file));
    },
    async listRoutes(workspaceId) {
      try {
        const entries = await readdir(path.join(root, 'learner-records', workspaceId, 'routes'), { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    },
  };
}

/** Where the files above land, for a test that wants to look at or delete one. */
export function tempLearnerRecordPath(root: string, workspaceId: string, file: LearnerRecordFile): string {
  const directory = path.join(root, 'learner-records', workspaceId);
  if (file.kind === 'state') return path.join(directory, 'state.json');
  if (!isRouteId(file.id)) throw new Error(`${file.id} 不是路线 id`);
  return path.join(directory, 'routes', `${file.id}.json`);
}
