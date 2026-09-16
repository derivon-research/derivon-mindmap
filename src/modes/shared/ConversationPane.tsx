import { Bot, MessageSquarePlus, Send, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationModel, ConversationProvider } from '../../ports/ConversationProvider';
import {
  appendTurn,
  applyEvent,
  beginTurn,
  clearTranscript,
  emptyTranscript,
  stopActiveTurn,
  turnText,
  type Transcript,
} from './transcript';
import { TurnPart } from './TurnPart';
import './ConversationPane.css';

export type QuickQuestion = {
  readonly label: string;
  readonly answer: string;
};

/**
 * A model is named by its id; a catalog name is a convenience on top of that. So the id
 * is always on screen: under the name when there is one, and in its place — at full
 * weight, not as a subtitle — when there is not.
 */
function ModelIdentity({ model }: { model: ConversationModel }) {
  return <span className="conversation-model-identity">
    <span className="conversation-model-name">{model.name ?? model.modelId}</span>
    {model.name && <span className="conversation-model-id">{model.modelId}</span>}
  </span>;
}

export function ConversationPane({
  provider,
  placeholder,
  quickQuestions,
  fallbackMessage,
  drainPendingChanges,
  onMessageComplete,
}: {
  provider?: ConversationProvider;
  placeholder: string;
  quickQuestions?: readonly QuickQuestion[];
  fallbackMessage: string;
  /** See `AuthoringModeProps.drainPendingChanges`; absent when there is nothing to write. */
  drainPendingChanges?: () => Promise<void>;
  onMessageComplete?: (text: string) => void;
}) {
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript);
  const [composer, setComposer] = useState('');
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState<readonly ConversationModel[]>([]);
  const [diagnosis, setDiagnosis] = useState<string>();
  const [selectedModel, setSelectedModel] = useState<ConversationModel>();
  const [modelQuery, setModelQuery] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const modelRoot = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  /**
   * The completion callback is held rather than depended on: callers pass an inline
   * arrow, so depending on it would resubscribe on every render — and the provider
   * queues events while nobody is listening, so that gap is real during a stream.
   */
  const completionHandler = useRef(onMessageComplete);
  completionHandler.current = onMessageComplete;

  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    void provider.listModels()
      .then((catalog) => {
        if (cancelled) return;
        setModels(catalog.models);
        setDiagnosis(catalog.diagnosis);
        // The provider owns the selection and remembers it; the panel only shows it.
        setSelectedModel(catalog.selected);
      })
      .catch((error: unknown) => {
        // A provider that rejects instead of reporting still owes the operator a reason;
        // an empty list on its own says nothing about what went wrong.
        if (cancelled) return;
        setModels([]);
        setDiagnosis(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    return provider.subscribe((event) => {
      setTranscript((current) => applyEvent(current, event));
      if (event.kind === 'message') completionHandler.current?.(event.text);
      else if (event.kind === 'settled') setRunning(false);
    });
  }, [provider]);

  /**
   * The menu closes from outside itself. It deliberately does not lay a full-window
   * element over the application to catch that click: an overlay makes every other
   * control inert while the menu is open, and any element the modes blanket-style would
   * be painted across the whole window.
   */
  useEffect(() => {
    if (!modelOpen) return;
    const close = (event: Event) => {
      if (!modelRoot.current?.contains(event.target as Node)) setModelOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [modelOpen]);

  const groupedModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    const groups = new Map<string, ConversationModel[]>();
    for (const model of models) {
      if (query && !`${model.providerId} ${model.modelId} ${model.name ?? ''}`.toLowerCase().includes(query)) continue;
      const group = groups.get(model.providerId) ?? [];
      group.push(model);
      groups.set(model.providerId, group);
    }
    return [...groups].map(([providerId, items]) => ({ providerId, items }));
  }, [models, modelQuery]);

  /** One id per turn, handed to the transcript so a React key survives the whole stream. */
  const takeId = () => String(nextId.current++);

  const send = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || running) return;
    const userId = takeId();
    const assistantId = takeId();
    setTranscript((current) => beginTurn(current, { userId, assistantId, prompt: text }));
    setComposer('');
    if (!provider) {
      setTranscript((current) => applyEvent(current, { kind: 'error', message: fallbackMessage }));
      onMessageComplete?.(fallbackMessage);
      return;
    }
    setRunning(true);
    // Before the Agent is asked anything, so its first read sees what the user has accepted.
    // Best effort: a drain that fails is the save-state banner's story, not this turn's.
    await drainPendingChanges?.().catch(() => {});
    try {
      await provider.send(text);
    } catch (error) {
      setTranscript((current) => applyEvent(current, {
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      }));
      setRunning(false);
    }
  };

  const abort = async () => {
    if (!provider || !running) return;
    setTranscript(stopActiveTurn);
    await provider.abort();
  };

  const newConversation = async () => {
    if (provider) await provider.newConversation();
    setTranscript(clearTranscript());
    setRunning(false);
  };

  const selectModel = async (model: ConversationModel) => {
    setSelectedModel(model);
    setModelOpen(false);
    setModelQuery('');
    await provider?.setModel(model);
  };

  return <div className="conversation-pane" data-shared-pane="conversation">
    <div className="conversation-transcript" role="log" aria-label="Agent 对话">
      {!transcript.turns.length && <div className="conversation-welcome">
        <Bot size={20} aria-hidden="true" /><span>{placeholder}</span>
      </div>}
      {transcript.turns.map((turn) => <article className="conversation-exchange" key={turn.id}>
        {turn.role === 'user'
          ? <div className="conversation-user"><small>你</small><p>{turnText(turn)}</p></div>
          : <div className={`conversation-assistant is-${turn.status}`}>
              <strong><Bot size={15} aria-hidden="true" />Agent {turn.status === 'stopped' && <small>已停止</small>}</strong>
              {/* One continuous assistant surface: the parts, in order, are what the turn said
                  and what it did. An empty streaming turn is the only thing that needs a mark
                  of its own, because it has no part yet. */}
              {!turn.parts.length && turn.status === 'streaming'
                ? <p className="conversation-text">…</p>
                : turn.parts.map((part) => <TurnPart key={part.id} part={part} />)}
            </div>}
      </article>)}
    </div>
    {quickQuestions && quickQuestions.length > 0 && <div className="conversation-quick">
      {/* These answers are taken from the graph's own documents. A model is not asked to
          regenerate them: the point of the quick question is that its answer is sourced.
          Free-form questions go through the composer. */}
      {quickQuestions.map((question) => <button key={question.label} type="button" onClick={() => {
        setTranscript((current) => appendTurn(current, { id: takeId(), role: 'user', text: question.label }));
        setTranscript((current) => appendTurn(current, { id: takeId(), role: 'assistant', text: question.answer }));
        onMessageComplete?.(question.answer);
      }}>{question.label}</button>)}
    </div>}
    <form className="conversation-composer" onSubmit={(event) => { event.preventDefault(); void send(composer); }}>
      <textarea aria-label="Agent 消息" placeholder={placeholder} value={composer}
        onChange={(event) => setComposer(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          // An IME is mid-composition: this Enter is choosing characters, not sending.
          if (event.nativeEvent.isComposing) return;
          event.preventDefault();
          void send(composer);
        }} />
      <footer>
        {provider && <div className="conversation-model" ref={modelRoot}>
          <button type="button" className="conversation-model-button" onClick={() => setModelOpen(!modelOpen)}>
            {selectedModel ? <ModelIdentity model={selectedModel} /> : '选择模型'}
          </button>
          {modelOpen && <div className="conversation-model-menu">
            <input aria-label="搜索模型" placeholder="搜索 provider / model" value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)} />
            <div className="conversation-model-list">
              {groupedModels.map(({ providerId, items }) => <section key={providerId}>
                <small>{providerId}</small>
                {items.map((model) => <button type="button" key={`${model.providerId}/${model.modelId}`}
                  className={selectedModel?.modelId === model.modelId && selectedModel.providerId === model.providerId ? 'is-selected' : ''}
                  onClick={() => void selectModel(model)}><ModelIdentity model={model} /></button>)}
              </section>)}
              {!groupedModels.length && <p>没有可用模型</p>}
            </div>
            {diagnosis && <p className="conversation-model-diagnosis" role="status">{diagnosis}</p>}
          </div>}
        </div>}
        <button type="button" className="conversation-icon" title="新对话" aria-label="新对话" onClick={() => void newConversation()}>
          <MessageSquarePlus size={15} />
        </button>
        {running
          ? <button type="button" className="conversation-primary" title="停止生成" aria-label="停止生成" onClick={() => void abort()}>
              <Square size={15} />
            </button>
          : <button type="submit" className="conversation-primary" title="发送消息" aria-label="发送消息" disabled={!composer.trim()}>
              <Send size={15} />
            </button>}
      </footer>
    </form>
  </div>;
}
