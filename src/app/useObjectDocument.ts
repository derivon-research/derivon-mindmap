import { useEffect, useState } from 'react';
import type { WorkspaceReader } from '../synchronization';
import type { TextResource } from '../workspace/index';

export function useObjectDocument(path: string, accepted: TextResource | undefined,
  readDocuments: WorkspaceReader['readDocuments'] | undefined, active = true): TextResource | undefined {
  const [loaded, setLoaded] = useState<{ path: string; reader: typeof readDocuments; resource: TextResource }>();
  useEffect(() => {
    if (accepted || !active || !path) return;
    let cancelled = false;
    const read = readDocuments ? readDocuments([path]).then((resources) => resources[path])
      : Promise.resolve({ status: 'error' as const, message: `Missing document: ${path}` });
    void read.catch((error: unknown): TextResource => ({ status: 'error', message: String(error) }))
      .then((resource) => { if (!cancelled) setLoaded({ path, reader: readDocuments, resource }); });
    return () => { cancelled = true; };
  }, [accepted, active, path, readDocuments]);
  return accepted ?? (loaded?.path === path && loaded.reader === readDocuments ? loaded.resource : undefined);
}
