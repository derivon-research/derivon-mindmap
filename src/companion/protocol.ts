import type {
  ConversationCatalog,
  ConversationEvent,
  ConversationMode,
} from '../ports/ConversationProvider';

/**
 * The wire contract between the webview and the companion process.
 *
 * It is defined once, here, and imported by both sides. Tauri's Rust layer sits in the
 * middle but deliberately does not know this contract: it supervises the process and
 * routes envelopes, so a field renamed here cannot silently desynchronise a third
 * hand-written copy. See ADR-0010.
 */
export type ConversationRequest =
  | { readonly type: 'listModels'; readonly mode: ConversationMode }
  | { readonly type: 'setWorkspace'; readonly path: string | null }
  | {
    readonly type: 'setModel';
    readonly mode: ConversationMode;
    readonly providerId: string;
    readonly modelId: string;
  }
  | { readonly type: 'send'; readonly mode: ConversationMode; readonly prompt: string }
  | { readonly type: 'abort'; readonly mode: ConversationMode }
  | { readonly type: 'new'; readonly mode: ConversationMode };

/** The reply to one request. Failures travel as `error`, never as a rejected transport. */
export type ConversationResponse =
  | ({ readonly type: 'models' } & ConversationCatalog)
  | { readonly type: 'ok' }
  | { readonly type: 'error'; readonly message: string };

/** An unsolicited line: something happened in one mode's session. */
export type ConversationNotification = {
  readonly type: 'event';
  readonly mode: ConversationMode;
  readonly event: ConversationEvent;
};

/**
 * The envelope Rust adds and strips. It is the only part of the protocol the Rust layer
 * reads, which is what lets it stay a pipe.
 */
export type Envelope = { readonly id: number };
