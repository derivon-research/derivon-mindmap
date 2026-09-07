import { Bot, MessageSquarePlus, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { answerNeedsWidth } from './panels';

type Exchange = { id: number; prompt: string; context: string; task: string };

/**
 * The learning side's Agent window, in the same unwired shape the authoring side ships:
 * it composes, it echoes, and it says plainly that no model is connected. The orientation
 * flow deliberately does not run through here — that flow is deterministic and must stay
 * correct without any provider.
 */
export function LearningAgentPane({ contextLabel, quickQuestions, onWideAnswer }: {
  contextLabel: string;
  quickQuestions?: readonly { readonly label: string; readonly answer: string }[];
  /** An answer arrived that a narrow column would break; the layout decides what to do. */
  onWideAnswer?: () => void;
}) {
  const [composer, setComposer] = useState('');
  const [task, setTask] = useState('讲解这一步');
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [answered, setAnswered] = useState<readonly { id: number; label: string; answer: string }[]>([]);

  const answer = (question: { readonly label: string; readonly answer: string }) => {
    setAnswered((current) => [...current, { id: Date.now(), ...question }]);
    if (answerNeedsWidth(question.answer)) onWideAnswer?.();
  };

  const send = () => {
    if (!composer.trim()) return;
    setMessages((current) => [...current, { id: Date.now(), prompt: composer.trim(), context: contextLabel, task }]);
    setComposer('');
  };

  return <div className="learning-agent">
    <div className="learning-agent-transcript" role="log" aria-label="Agent 对话">
      {!messages.length && !answered.length && <div className="learning-agent-welcome">
        <Bot size={20} aria-hidden="true" /><span>卡在哪一步？说出来。</span>
      </div>}
      {answered.map((item) => <article className="learning-agent-exchange" key={item.id}>
        <div className="learning-agent-prompt"><small>你</small><p>{item.label}</p></div>
        <div className="learning-agent-response"><strong><Bot size={15} aria-hidden="true" />Agent <small>取自图上的文档</small></strong>
          <p>{item.answer}</p></div>
      </article>)}
      {messages.map((message) => <article className="learning-agent-exchange" key={message.id}>
        <div className="learning-agent-prompt"><small>你</small><p>{message.prompt}</p></div>
        <div className="learning-agent-response"><strong><Bot size={15} aria-hidden="true" />Agent <small>模拟计划 · 未执行</small></strong>
          <p>围绕「{message.context}」准备{message.task}。</p>
          <div className="learning-agent-tool"><Sparkles size={15} aria-hidden="true" />
            <span>{message.task}<small>未连接模型，没有生成任何讲解。</small></span></div>
        </div>
      </article>)}
    </div>
    {quickQuestions && quickQuestions.length > 0 && <div className="learning-agent-quick">
      {quickQuestions.map((question) => <button key={question.label} type="button"
        onClick={() => answer(question)}>
        {question.label}
      </button>)}
    </div>}
    <form className="learning-agent-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <textarea aria-label="Agent 消息" placeholder="问这一步的任何地方…" value={composer}
        onChange={(event) => setComposer(event.target.value)} />
      <footer>
        <select aria-label="Agent 任务" value={task} onChange={(event) => setTask(event.target.value)}>
          <option>讲解这一步</option><option>换个说法再讲一遍</option><option>给一个例子</option>
        </select>
        <button type="button" className="learning-agent-reset" title="新对话" aria-label="新对话"
          onClick={() => { setMessages([]); setAnswered([]); }}><MessageSquarePlus size={15} /></button>
        <button type="submit" className="learning-primary" title="发送消息" aria-label="发送消息"
          disabled={!composer.trim()}><Send size={15} /></button>
      </footer>
    </form>
  </div>;
}
