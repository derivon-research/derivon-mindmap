export type ConversationModel = {
  readonly providerId: string;
  readonly modelId: string;
  /**
   * The catalog's display name, when it declares one. Optional on purpose: a model
   * without a name is shown by its id rather than given a made-up label, and a model
   * with one still shows its id, because the name alone does not say which model this
   * is.
   */
  readonly name?: string;
};

/**
 * The catalog and, when it is empty or partial, why. An empty catalog is a legitimate
 * configuration state, so it never travels as a rejected promise — but it always
 * carries its reason, because "没有可用模型" on its own is indistinguishable from a
 * provider that failed to start.
 */
export type ConversationCatalog = {
  readonly models: readonly ConversationModel[];
  readonly diagnosis?: string;
};

export type ConversationEvent =
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'settled' };

export interface ConversationProvider {
  /**
   * Which workspace the conversation is about, or null when none is open.
   *
   * A host that runs a local agent roots it there, so the agent reasons about the
   * workspace the learner or author actually has open rather than wherever the
   * application happened to be started from. The identifier is the host's own: it is
   * opaque to the application, and each host knows what its workspace identifiers mean.
   */
  setWorkspace(workspaceId: string | null): Promise<void>;
  send(prompt: string): Promise<void>;
  abort(): Promise<void>;
  newConversation(): Promise<void>;
  listModels(): Promise<ConversationCatalog>;
  setModel(model: ConversationModel): Promise<void>;
  subscribe(listener: (event: ConversationEvent) => void): () => void;
}
