import type { AuthoringDocument, Position } from './domain';
import type { LayoutMode } from './layout';

type DocumentLayoutTask = {
  kind: 'document';
  mode: LayoutMode;
};

type NeighborhoodLayoutTask = {
  kind: 'neighborhood';
  nodeIds: string[];
  anchorId?: string;
  overviewPositions: Record<string, Position>;
};

type LayoutTask = DocumentLayoutTask | NeighborhoodLayoutTask;

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

type ActiveRequest = {
  requestId: number;
  reject: (reason: unknown) => void;
};

export class LayoutCancelledError extends Error {
  constructor() {
    super('Layout request was superseded');
    this.name = 'LayoutCancelledError';
  }
}

export class LayoutService {
  private worker: Worker | null = null;
  private active: ActiveRequest | null = null;
  private nextRequestId = 1;

  constructor(
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }),
  ) {}

  layoutDocument(
    document: AuthoringDocument,
    mode: LayoutMode = 'auto',
  ): Promise<Record<string, Position>> {
    return this.request(document, { kind: 'document', mode });
  }

  layoutNeighborhood(
    document: AuthoringDocument,
    nodeIds: Iterable<string>,
    anchorId: string | undefined,
    overviewPositions: Record<string, Position>,
  ): Promise<Record<string, Position>> {
    return this.request(document, {
      kind: 'neighborhood',
      nodeIds: [...nodeIds],
      anchorId,
      overviewPositions,
    });
  }

  cancel(): void {
    if (this.active) this.active.reject(new LayoutCancelledError());
    this.active = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }

  dispose(): void {
    this.cancel();
  }

  private request(document: AuthoringDocument, task: LayoutTask): Promise<Record<string, Position>> {
    this.cancel();
    const worker = this.createWorker();
    const requestId = this.nextRequestId++;
    this.worker = worker;

    return new Promise((resolve, reject) => {
      this.active = { requestId, reject };
      worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
        if (event.data.requestId !== requestId || this.active?.requestId !== requestId) return;
        this.active = null;
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.positions ?? {});
      };
      worker.onerror = (event) => {
        if (this.active?.requestId !== requestId) return;
        this.active = null;
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        reject(new Error(event.message || 'Automatic layout worker failed'));
      };
      worker.postMessage({ requestId, document, task } satisfies LayoutWorkerRequest);
    });
  }
}
