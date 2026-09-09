import { Bot, MessageSquarePlus, Send, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationModel, ConversationProvider } from '../../ports/ConversationProvider';
import './ConversationPane.css';

export type ConversationVariant = 'learning' | 'authoring';

type Message = {
  readonly id: number;
  readonly role: 'user' | 'assistant';
  text: string;
  state: 'streaming' | 'done' | 'error' | 'stopped';
};

export type QuickQuestion = {
  readonly label: string;
  readonly answer: string;
};

export function ConversationPane({
  variant,
  provider,
  placeholder,
  quickQuestions,
  fallbackMessage,
  onMessageComplete,
}: {
  variant: ConversationVariant;
  provider?: ConversationProvider;
  placeholder: string;
  quickQuestions?: readonly QuickQuestion[];
  fallbackMessage: string;
  onMessageComplete?: (text: string) => void;
}) {
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [composer, setComposer] = useState('');
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState<readonly ConversationModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<ConversationModel>();
  const [modelQuery, setModelQuery] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const nextId = useRef(1);
  const activeAssistantId = useRef<number | undefined>(undefined);

  const storageKey = `derivon.agent.model.${variant}`;

  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    void provider.listModels()
      .then((available) => {
        if (cancelled) return;
        setModels(available);
        const stored = localStorage.getItem(storageKey);
        const parsed = stored ? JSON.parse(stored) as ConversationModel : undefined;
        const model = available.find((candidate) =>
          candidate.providerId === parsed?.providerId && candidate.modelId === parsed?.modelId)
          ?? available[0];
        setSelectedModel(model);
        if (model) void provider.setModel(model);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => { cancelled = true; };
  }, [provider, storageKey]);

  useEffect(() => {
    if (!provider) return;
    return provider.subscribe((event) => {
      if (event.kind === 'delta') {
        setMessages((current) => current.map((message) =>
          message.id === activeAssistantId.current
            ? { ...message, text: message.text + event.text, state: 'streaming' }
            : message));
      } else if (event.kind === 'message') {
        setMessages((current) => current.map((message) =>
          message.id === activeAssistantId.current
            ? { ...message, text: event.text, state: 'done' }
            : message));
        onMessageComplete?.(event.text);
      } else if (event.kind === 'error') {
        setMessages((current) => current.map((message) =>
          message.id === activeAssistantId.current
            ? { ...message, text: event.message, state: 'error' }
            : message));
      } else if (event.kind === 'settled') {
        setRunning(false);
        setMessages((current) => current.map((message) =>
          message.id === activeAssistantId.current && message.state === 'streaming'
            ? { ...message, state: 'done' }
            : message));
      }
    });
  }, [provider, onMessageComplete]);

  const groupedModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    const groups = new Map<string, ConversationModel[]>();
    for (const model of models) {
      if (query && !`${model.providerId} ${model.modelId} ${model.label}`.toLowerCase().includes(query)) continue;
      const group = groups.get(model.providerId) ?? [];
      group.push(model);
      groups.set(model.providerId, group);
    }
    return [...groups].map(([providerId, items]) => ({ providerId, items }));
  }, [models, modelQuery]);

  const appendMessage = (role: Message['role'], text = '', state: Message['state'] = 'done') => {
    const id = nextId.current++;
    setMessages((current) => [...current, { id, role, text, state }]);
    return id;
  };

  const send = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || running) return;
    appendMessage('user', text);
    setComposer('');
    if (!provider) {
      appendMessage('assistant', fallbackMessage, 'error');
      onMessageComplete?.(fallbackMessage);
      return;
    }
    activeAssistantId.current = appendMessage('assistant');
    setRunning(true);
    try {
      await provider.send(text);
    } catch (error) {
      setMessages((current) => current.map((message) =>
        message.id === activeAssistantId.current
          ? { ...message, text: error instanceof Error ? error.message : String(error), state: 'error' }
          : message));
      setRunning(false);
    }
  };

  const abort = async () => {
    if (!provider || !running) return;
    setMessages((current) => current.map((message) =>
      message.id === activeAssistantId.current ? { ...message, state: 'stopped' } : message));
    await provider.abort();
  };

  const newConversation = async () => {
    if (provider) await provider.newConversation();
    setMessages([]);
    setRunning(false);
  };

  const selectModel = async (model: ConversationModel) => {
    setSelectedModel(model);
    setModelOpen(false);
    setModelQuery('');
    localStorage.setItem(storageKey, JSON.stringify(model));
    await provider?.setModel(model);
  };

  return <div className="conversation-pane">
    <div className="conversation-transcript" role="log" aria-label="Agent 对话">
      {!messages.length && <div className="conversation-welcome">
        <Bot size={20} aria-hidden="true" /><span>{placeholder}</span>
      </div>}
      {messages.map((message) => <article className="conversation-exchange" key={message.id}>
        {message.role === 'user'
          ? <div className="conversation-user"><small>你</small><p>{message.text}</p></div>
          : <div className={`conversation-assistant is-${message.state}`}>
              <strong><Bot size={15} aria-hidden="true" />Agent {message.state === 'error' && <small>错误</small>}{message.state === 'stopped' && <small>已停止</small>}</strong>
              <p>{message.text || (message.state === 'streaming' ? '…' : '')}</p>
            </div>}
      </article>)}
    </div>
    {quickQuestions && quickQuestions.length > 0 && <div className="conversation-quick">
      {quickQuestions.map((question) => <button key={question.label} type="button" onClick={() => {
        if (provider) void send(question.label);
        else {
          appendMessage('user', question.label);
          appendMessage('assistant', question.answer);
          onMessageComplete?.(question.answer);
        }
      }}>{question.label}</button>)}
    </div>}
    <form className="conversation-composer" onSubmit={(event) => { event.preventDefault(); void send(composer); }}>
      <textarea aria-label="Agent 消息" placeholder={placeholder} value={composer}
        onChange={(event) => setComposer(event.target.value)} />
      <footer>
        {provider && <div className="conversation-model">
          <button type="button" className="conversation-model-button" onClick={() => setModelOpen(!modelOpen)}>
            {selectedModel ? selectedModel.label : '选择模型'}
          </button>
          {modelOpen && <>
            <button type="button" className="conversation-model-backdrop" aria-label="关闭模型选单" onClick={() => setModelOpen(false)} />
            <div className="conversation-model-menu">
              <input aria-label="搜索模型" placeholder="搜索 provider / model" value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)} />
              <div className="conversation-model-list">
                {groupedModels.map(({ providerId, items }) => <section key={providerId}>
                  <small>{providerId}</small>
                  {items.map((model) => <button type="button" key={`${model.providerId}/${model.modelId}`}
                    className={selectedModel?.modelId === model.modelId && selectedModel.providerId === model.providerId ? 'is-selected' : ''}
                    onClick={() => void selectModel(model)}>{model.label}</button>)}
                </section>)}
                {!groupedModels.length && <p>没有可用模型</p>}
              </div>
            </div>
          </>}
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
