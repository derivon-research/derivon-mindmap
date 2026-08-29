import { useEffect, useState } from 'react';
import { GitBranch, Save, X } from 'lucide-react';
import { ConceptMultiSelect } from './ConceptMultiSelect';
import { ConceptSingleSelect } from './ConceptSingleSelect';
import { formatWeight, normalizeWeight, type Point } from './domain';

type DerivationDraft = {
  tails: string[];
  head: string | null;
  weight: number;
};

type DerivationFormProps = {
  mode: 'create' | 'edit';
  derivationId?: string;
  points: Point[];
  visibleIds: ReadonlySet<string>;
  initial: DerivationDraft;
  onSubmit: (draft: { tails: string[]; head: string; weight: number }) => void;
  onCancel: () => void;
};

export function DerivationForm({
  mode,
  derivationId,
  points,
  visibleIds,
  initial,
  onSubmit,
  onCancel,
}: DerivationFormProps) {
  const [tails, setTails] = useState(initial.tails);
  const [head, setHead] = useState<string | null>(initial.head);
  const [weight, setWeight] = useState(formatWeight(initial.weight));
  const parsedWeight = Number(weight);
  const validWeight = weight.trim() !== '' && Number.isFinite(parsedWeight) && parsedWeight >= 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const toggleTail = (pointId: string) => {
    setTails((current) => current.includes(pointId)
      ? current.filter((id) => id !== pointId)
      : [...current, pointId]);
  };

  return (
    <aside className="inspector derivation-form" aria-label={mode === 'create' ? '新建推导' : '编辑推导前提与结论'}>
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">Derivation</span>
          <strong>{mode === 'create' ? '新建推导' : derivationId}</strong>
        </div>
        <button type="button" title="取消" aria-label="取消" onClick={onCancel}><X size={16} /></button>
      </div>

      <ConceptMultiSelect
        id={`${mode}-derivation-premises`}
        label="前提集合"
        points={points}
        selectedIds={tails}
        tone="premise"
        visibleIds={visibleIds}
        onToggle={toggleTail}
      />

      <ConceptSingleSelect
        id={`${mode}-derivation-conclusion`}
        label="结论"
        points={points}
        selectedId={head}
        visibleIds={visibleIds}
        onSelect={setHead}
      />

      {mode === 'create' && (
        <label className="weight-field">
          成本权重
          <input
            type="number"
            min="0"
            step="0.1"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
      )}

      <div className="derivation-form-actions">
        <button type="button" className="text-button" onClick={onCancel}><X size={14} /><span>取消</span></button>
        <button
          type="button"
          className="primary-button"
          disabled={!head || !validWeight}
          onClick={() => {
            if (!head || !validWeight) return;
            onSubmit({ tails, head, weight: normalizeWeight(parsedWeight) });
          }}
        >
          {mode === 'create' ? <GitBranch size={14} /> : <Save size={14} />}
          <span>{mode === 'create' ? '创建推导' : '保存更改'}</span>
        </button>
      </div>
    </aside>
  );
}
