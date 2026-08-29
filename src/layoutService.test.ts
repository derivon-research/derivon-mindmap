import { describe, expect, it } from 'vitest';
import { sampleDocument } from './sample';
import { LayoutCancelledError, LayoutService } from './layoutService';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  message: { requestId: number; task?: Record<string, unknown> } | null = null;
  terminated = false;

  postMessage(message: { requestId: number; task?: Record<string, unknown> }) {
    this.message = message;
  }

  terminate() {
    this.terminated = true;
  }

  respond(positions: Record<string, { x: number; y: number }>) {
    this.onmessage?.({
      data: { requestId: this.message?.requestId, positions },
    } as MessageEvent);
  }
}

describe('LayoutService', () => {
  it('cancels an in-flight worker before starting a newer layout revision', async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    const service = new LayoutService(() => workers.shift() as unknown as Worker);
    const firstWorker = workers[0];
    const secondWorker = workers[1];

    const first = service.layoutDocument(sampleDocument);
    const firstResult = expect(first).rejects.toBeInstanceOf(LayoutCancelledError);
    const second = service.layoutDocument(sampleDocument);

    expect(secondWorker.message?.task).toEqual({ kind: 'document' });
    await firstResult;
    expect(firstWorker.terminated).toBe(true);
    secondWorker.respond({ A: { x: 10, y: 20 } });
    await expect(second).resolves.toEqual({ A: { x: 10, y: 20 } });
    expect(secondWorker.terminated).toBe(true);
  });

  it('disposes the active request and worker', async () => {
    const worker = new FakeWorker();
    const service = new LayoutService(() => worker as unknown as Worker);
    const request = service.layoutDocument(sampleDocument);
    const result = expect(request).rejects.toBeInstanceOf(LayoutCancelledError);

    service.dispose();

    await result;
    expect(worker.terminated).toBe(true);
  });
});
