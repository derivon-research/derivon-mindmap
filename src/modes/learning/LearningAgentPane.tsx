import { ConversationPane, type QuickQuestion } from '../shared/ConversationPane';
import type { ConversationProvider } from '../../ports/ConversationProvider';
import { answerNeedsWidth } from './panels';

export function LearningAgentPane({ quickQuestions, onWideAnswer, conversation, drainPendingChanges }: {
  quickQuestions?: readonly QuickQuestion[];
  onWideAnswer?: () => void;
  conversation?: ConversationProvider;
  drainPendingChanges?: () => Promise<void>;
}) {
  return <ConversationPane
    mode="learning"
    provider={conversation}
    placeholder="卡在哪一步？说出来。"
    quickQuestions={quickQuestions}
    fallbackMessage="未连接模型，没有生成任何讲解。"
    drainPendingChanges={drainPendingChanges}
    onMessageComplete={(text) => {
      if (answerNeedsWidth(text)) onWideAnswer?.();
    }}
  />;
}
