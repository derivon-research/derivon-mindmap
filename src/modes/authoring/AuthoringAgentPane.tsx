import { Bot, FileText, MessageSquarePlus, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ConversationProvider } from '../../ports/ConversationProvider';
import { ConversationPane } from '../shared/ConversationPane';

export function AuthoringAgentPane({ open, onToggle, contextLabel, conversation }: {
  open: boolean;
  onToggle: () => void;
  contextLabel: string;
  conversation?: ConversationProvider;
}) {
  return <aside className={`authoring-agent-pane ${open ? '' : 'is-collapsed'}`} aria-label="创作 Agent">
    <header>
      <button type="button" className="authoring-icon" title={open ? '收起 Agent' : '展开 Agent'}
        aria-label={open ? '收起 Agent' : '展开 Agent'} aria-expanded={open} onClick={onToggle}>
        {open ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
      </button>
      {open && <>
        <Bot size={16} aria-hidden="true" />
        <strong>Agent</strong>
        <small>{conversation ? 'Pi' : '模拟'}</small>
        <span className="authoring-flex" />
        <button type="button" className="authoring-icon" title="新对话" aria-label="新对话"
          onClick={() => void conversation?.newConversation()}>
          <MessageSquarePlus size={16} />
        </button>
      </>}
    </header>
    <div className="authoring-agent-body" hidden={!open}>
      <div className="authoring-agent-context">
        <FileText size={14} aria-hidden="true" />
        <span>{contextLabel}</span>
      </div>
      <ConversationPane
        variant="authoring"
        provider={conversation}
        placeholder="描述你想完成的修改…"
        fallbackMessage="未连接模型，未修改工作区。"
      />
    </div>
  </aside>;
}
