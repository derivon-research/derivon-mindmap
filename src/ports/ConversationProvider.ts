export type ConversationModel = {
  readonly providerId: string;
  readonly modelId: string;
  readonly label: string;
};

export type ConversationEvent =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'settled' };

export interface ConversationProvider {
  send(prompt: string): Promise<void>;
  abort(): Promise<void>;
  newConversation(): Promise<void>;
  listModels(): Promise<readonly ConversationModel[]>;
  setModel(model: ConversationModel): Promise<void>;
  subscribe(listener: (event: ConversationEvent) => void): () => void;
}
