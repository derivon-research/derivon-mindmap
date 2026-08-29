/// <reference lib="webworker" />

import type { AuthoringDocument, Position } from './domain';
import { layoutDocument, layoutNeighborhood, type LayoutMode } from './layout';

type LayoutTask = {
  kind: 'document';
  mode: LayoutMode;
} | {
  kind: 'neighborhood';
  nodeIds: string[];
  anchorId?: string;
  overviewPositions: Record<string, Position>;
};

type LayoutWorkerRequest = {
  requestId: number;
  document: AuthoringDocument;
  task: LayoutTask;
};

type LayoutWorkerResponse = {
  requestId: number;
  positions?: Record<string, Position>;
  error?: string;
};

self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { requestId, document, task } = event.data;
  try {
    const positions = task.kind === 'document'
      ? layoutDocument(document, { mode: task.mode })
      : layoutNeighborhood(
          document,
          new Set(task.nodeIds),
          task.anchorId,
          task.overviewPositions,
        );
    self.postMessage({ requestId, positions } satisfies LayoutWorkerResponse);
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies LayoutWorkerResponse);
  }
};

export {};
