import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ConversationCatalog,
  ConversationEvent,
  ConversationModel,
  ConversationProvider,
} from '../../ports/ConversationProvider';

type Variant = 'learning' | 'authoring';
type WireEvent = { readonly mode: Variant; readonly event: ConversationEvent };

export function createDesktopConversationProvider(variant: Variant): ConversationProvider {
  const listeners = new Set<(event: ConversationEvent) => void>();
  const queuedEvents: WireEvent[] = [];
  const dispatch = (event: WireEvent) => {
    if (event.mode !== variant) return;
    if (listeners.size === 0) {
      queuedEvents.push(event);
      return;
    }
    for (const listener of listeners) listener(event.event);
  };
  const listenerReady = listen<WireEvent>('conversation://event', (event) => dispatch(event.payload))
    .then(() => {
      while (queuedEvents.length > 0 && listeners.size > 0) dispatch(queuedEvents.shift()!);
    });

  return {
    // A desktop workspace is identified by its directory (see `desktopWorkspaces.ts`,
    // which is the only place a desktop `WorkspaceHandle.id` is made), so the identifier
    // the application hands back is exactly the path to root the agent at.
    async setWorkspace(workspaceId: string | null) {
      await invoke('conversation_set_workspace', { path: workspaceId });
    },
    async send(prompt: string) {
      await invoke('conversation_send', { mode: variant, prompt });
    },
    async abort() {
      await invoke('conversation_abort', { mode: variant });
    },
    async newConversation() {
      await invoke('conversation_new', { mode: variant });
    },
    async listModels(): Promise<ConversationCatalog> {
      try {
        return await invoke<ConversationCatalog>('conversation_list_models');
      } catch (error) {
        // The bridge could not reach the companion at all: no catalog, but a reason.
        return { models: [], diagnosis: error instanceof Error ? error.message : String(error) };
      }
    },
    async setModel(model: ConversationModel) {
      await invoke('conversation_set_model', {
        mode: variant,
        providerId: model.providerId,
        modelId: model.modelId,
      });
    },
    subscribe(listener: (event: ConversationEvent) => void) {
      listeners.add(listener);
      void listenerReady.then(() => {
        while (queuedEvents.length > 0 && listeners.size > 0) dispatch(queuedEvents.shift()!);
      });
      return () => { listeners.delete(listener); };
    },
  };
}
