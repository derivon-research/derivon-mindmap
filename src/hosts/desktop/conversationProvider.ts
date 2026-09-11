import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ConversationNotification,
  ConversationRequest,
  ConversationResponse,
} from '../../companion/protocol';
import type {
  ConversationCatalog,
  ConversationEvent,
  ConversationMode,
  ConversationModel,
  ConversationProvider,
} from '../../ports/ConversationProvider';

/**
 * The desktop conversation adapter: the companion protocol over Tauri's IPC.
 *
 * The protocol types come from `src/companion/protocol.ts` — the one definition both
 * ends share. This is a type-only import, so nothing of the companion's implementation
 * enters the webview bundle; `src/app/moduleBoundaries.test.ts` holds that line.
 */
export function createDesktopConversationProvider(mode: ConversationMode): ConversationProvider {
  const listeners = new Set<(event: ConversationEvent) => void>();
  const queued: ConversationNotification[] = [];
  const dispatch = (notification: ConversationNotification) => {
    if (notification.mode !== mode) return;
    if (listeners.size === 0) {
      queued.push(notification);
      return;
    }
    for (const listener of listeners) listener(notification.event);
  };
  const drain = () => {
    while (queued.length > 0 && listeners.size > 0) dispatch(queued.shift()!);
  };
  const listenerReady = listen<ConversationNotification>('conversation://event',
    (event) => dispatch(event.payload)).then(drain);

  const ask = async <T extends ConversationResponse>(payload: ConversationRequest): Promise<T> =>
    invoke<T>('conversation_request', { payload });

  return {
    // A desktop workspace is identified by its directory (see `desktopWorkspaces.ts`,
    // which is the only place a desktop `WorkspaceHandle.id` is made), so the identifier
    // the application hands back is exactly the path to root the agent at.
    async setWorkspace(workspaceId: string | null) {
      await ask({ type: 'setWorkspace', path: workspaceId });
    },
    async send(prompt: string) {
      await ask({ type: 'send', mode, prompt });
    },
    async abort() {
      await ask({ type: 'abort', mode });
    },
    async newConversation() {
      await ask({ type: 'new', mode });
    },
    async listModels(): Promise<ConversationCatalog> {
      try {
        const { models, diagnosis, selected } =
          await ask<Extract<ConversationResponse, { type: 'models' }>>({ type: 'listModels', mode });
        return { models, diagnosis, selected };
      } catch (error) {
        // The bridge could not reach the companion at all: no catalog, but a reason.
        return { models: [], diagnosis: error instanceof Error ? error.message : String(error) };
      }
    },
    async setModel(model: ConversationModel) {
      await ask({ type: 'setModel', mode, providerId: model.providerId, modelId: model.modelId });
    },
    subscribe(listener: (event: ConversationEvent) => void) {
      listeners.add(listener);
      void listenerReady.then(drain);
      return () => { listeners.delete(listener); };
    },
  };
}
