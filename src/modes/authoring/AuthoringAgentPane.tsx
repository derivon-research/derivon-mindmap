import { Bot, FileText, MessageSquarePlus, PanelRightClose, PanelRightOpen, Send } from 'lucide-react';
import { useState } from 'react';

type Exchange = { id: number; prompt: string; context: string; task: string };
export function AuthoringAgentPane({ open, onToggle, contextLabel }: { open: boolean; onToggle: () => void; contextLabel: string }) {
  const [composer, setComposer] = useState('');
  const [task, setTask] = useState('修改文档');
  const [messages, setMessages] = useState<Exchange[]>([]);
  function send() {
    if (!composer.trim()) return;
    setMessages((current) => [...current, { id: Date.now(), prompt: composer.trim(), context: contextLabel, task }]);
    setComposer('');
  }
  return <aside className={`authoring-agent-pane ${open ? '' : 'is-collapsed'}`} aria-label="创作 Agent">
    <header><button type="button" className="authoring-icon" title={open ? '收起 Agent' : '展开 Agent'} aria-label={open ? '收起 Agent' : '展开 Agent'} aria-expanded={open} onClick={onToggle}>
      {open ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button>
      {open && <><Bot size={16} /><strong>Agent</strong><small>模拟</small><span className="authoring-flex" />
        <button type="button" className="authoring-icon" title="新对话" aria-label="新对话" onClick={() => setMessages([])}><MessageSquarePlus size={16} /></button></>}
    </header>
    <div className="authoring-agent-body" hidden={!open}>
      <div className="authoring-agent-context"><FileText size={14} /><span>{contextLabel}</span></div>
      <div className="authoring-agent-transcript" role="log" aria-label="Agent 对话">
        {!messages.length && <div className="authoring-agent-welcome"><Bot size={20} /><span>有什么需要一起完成？</span></div>}
        {messages.map((message) => <article className="authoring-agent-exchange" key={message.id}>
          <div className="authoring-agent-prompt"><small>你</small><p>{message.prompt}</p></div>
          <div className="authoring-agent-response"><strong><Bot size={15} />Agent <small>模拟计划 · 未执行</small></strong>
            <p>围绕「{message.context}」准备{message.task}。</p><div className="authoring-agent-tool"><FileText size={15} /><span>{message.task}<small>未连接模型，未修改工作区。</small></span></div>
          </div>
        </article>)}
      </div>
      <form className="authoring-agent-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <textarea aria-label="Agent 消息" placeholder="描述你想完成的修改…" value={composer} onChange={(event) => setComposer(event.target.value)} />
        <footer><select aria-label="Agent 任务" value={task} onChange={(event) => setTask(event.target.value)}><option>修改文档</option><option>调整前提与结果</option><option>创建概念与推导</option></select><span className="authoring-flex" /><button type="submit" className="authoring-primary" title="发送消息" aria-label="发送消息" disabled={!composer.trim()}><Send size={15} /></button></footer>
      </form>
    </div>
  </aside>;
}
