import { ConversationPane, type QuickQuestion } from '../shared/ConversationPane';
import type { ConversationProvider } from '../../ports/ConversationProvider';
import { answerNeedsWidth } from './panels';

export function LearningAgentPane({ quickQuestions, onWideAnswer, conversation }: {
  quickQuestions?: readonly QuickQuestion[];
  onWideAnswer?: () => void;
  conversation?: ConversationProvider;
}) {
  return <ConversationPane
    variant="learning"
    provider={conversation}
    placeholder="卡在哪一步？说出来。"
    quickQuestions={quickQuestions}
    fallbackMessage="未连接模型，没有生成任何讲解。"
    onMessageComplete={(text) => {
      if (answerNeedsWidth(text)) onWideAnswer?.();
    }}
  />;
}
