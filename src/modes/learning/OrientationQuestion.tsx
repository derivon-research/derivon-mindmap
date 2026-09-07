import { ArrowRight, SkipForward } from 'lucide-react';
import { useState } from 'react';
import type { OrientationQuestion } from '../../workspace/index';

/**
 * The author's question, rendered as buttons. Shared by the learner's orientation view and
 * by the author's preview of the same configuration, so what an author checks is exactly
 * what a learner is asked.
 *
 * Mount it with the question id as `key`: the multi-select tally belongs to one question.
 */
export function OrientationQuestionBlock({ question, onAnswer, onSkip }: {
  readonly question: OrientationQuestion;
  readonly onAnswer: (optionIds: readonly string[]) => void;
  readonly onSkip: () => void;
}) {
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState('');

  const answer = (optionIds: readonly string[]) => {
    setFailure('');
    try {
      onAnswer(optionIds);
      setChosen([]);
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };

  return <div className="orientation-question">
    <h2>{question.prompt || '请选择'}</h2>
    <ul className="orientation-options">
      {question.options.map((option) => <li key={option.id}>
        <button type="button" aria-pressed={chosen.includes(option.id)}
          onClick={() => (question.select === 'one'
            ? answer([option.id])
            : setChosen(chosen.includes(option.id) ? chosen.filter((id) => id !== option.id) : [...chosen, option.id]))}>
          {option.label || option.id}
        </button>
      </li>)}
    </ul>
    {failure && <p className="orientation-warning" role="alert">{failure}</p>}
    <footer className="orientation-actions">
      <button type="button" onClick={() => { setChosen([]); onSkip(); }}>
        <SkipForward size={15} aria-hidden="true" />跳过
      </button>
      {question.select === 'many' && <button type="button" className="orientation-primary" onClick={() => answer(chosen)}>
        <ArrowRight size={15} aria-hidden="true" />继续
      </button>}
    </footer>
  </div>;
}
