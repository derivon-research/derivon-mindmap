import { memo } from 'react';
import { ChevronDown, ChevronRight, Layers3, Trash2 } from 'lucide-react';
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from '@xyflow/react';
import { formatWeight, type ViewReplacement } from './domain';
import { TOUR_FEATURES, tourTarget } from './onboarding';

export type ConceptNodeData = {
  label: string;
  dimmed: boolean;
  depth: number;
  replacements: Array<{
    replaceWith: string;
    show: ViewReplacement['show'];
    label: string;
    onToggle: (replaceWith: string, show: ViewReplacement['show']) => void;
  }>;
  onDelete: (id: string) => void;
};

export type DerivationNodeData = {
  activeId: string;
  weight: number;
  premiseCount: number;
  dimmed: boolean;
  alternatives: Array<{ id: string; weight: number }>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export type ConceptFlowNode = Node<ConceptNodeData, 'concept'>;
export type DerivationFlowNode = Node<DerivationNodeData, 'derivation'>;
export type AuthoringFlowNode = ConceptFlowNode | DerivationFlowNode;

export const ConceptNode = memo(function ConceptNode({ id, data, selected }: NodeProps<ConceptFlowNode>) {
  return (
    <div className={`concept-node ${data.dimmed ? 'is-dimmed' : ''}`} data-depth={data.depth}>
      <NodeToolbar isVisible={selected} position={Position.Top} align="end">
        <button className="node-action nodrag" type="button" title="删除概念及相关推导" onClick={() => data.onDelete(id)}>
          <Trash2 size={14} />
        </button>
      </NodeToolbar>
      <Handle type="target" id="concept-in" position={Position.Left} title="将推导连接到此概念" />
      <span className="concept-label">{data.label || '未命名'}</span>
      <div className="concept-meta">
        <span className="concept-id">{id}</span>
        <div className="replacement-tags">
          {data.replacements.map((replacement) => (
            <button
              className="replacement-tag nodrag"
              type="button"
              {...tourTarget(TOUR_FEATURES.replacementToggle)}
              key={`${replacement.replaceWith}:${replacement.show}`}
              title={replacement.show === 'points' ? `显示 ${replacement.label}` : `替换为 ${replacement.replaceWith}`}
              onClick={(event) => {
                event.stopPropagation();
                replacement.onToggle(replacement.replaceWith, replacement.show);
              }}
            >
              {replacement.show === 'points' ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span>{replacement.label}</span>
            </button>
          ))}
        </div>
      </div>
      <Handle type="source" id="concept-out" position={Position.Right} title="从此概念开始推导" />
    </div>
  );
});

export const DerivationNode = memo(function DerivationNode({ data, selected }: NodeProps<DerivationFlowNode>) {
  const activeIndex = data.alternatives.findIndex((alternative) => alternative.id === data.activeId);
  const stackDepth = Math.min(2, data.alternatives.length - 1);
  const message = `该推导路径有 ${data.alternatives.length} 种方式实现`;
  return (
    <div className={`derivation-node ${data.dimmed ? 'is-dimmed' : ''}`}>
      <NodeToolbar isVisible={selected} position={Position.Top} align="end">
        <button className="node-action nodrag" type="button" title="删除推导" onClick={() => data.onDelete(data.activeId)}>
          <Trash2 size={14} />
        </button>
      </NodeToolbar>
      {Array.from({ length: stackDepth }, (_, index) => stackDepth - index).map((layer) => (
        <div className={`derivation-diamond is-stack-layer stack-layer-${layer}`} key={layer} />
      ))}
      <div className="derivation-diamond is-active" />
      <span className="derivation-weight">{formatWeight(data.weight)}</span>
      <span className="derivation-count">{data.premiseCount}</span>
      {data.alternatives.length > 1 && (
        <button
          className="derivation-path-count nodrag"
          type="button"
          {...tourTarget(TOUR_FEATURES.derivationAlternatives)}
          aria-label={message}
          title={`${message}；点击查看下一种`}
          onClick={(event) => {
            event.stopPropagation();
            data.onSelect(data.alternatives[(activeIndex + 1) % data.alternatives.length].id);
          }}
        >
          <Layers3 size={11} />
          <span>{data.alternatives.length}</span>
        </button>
      )}
      <Handle type="target" id="premise-in" position={Position.Left} title="追加前提" />
      <Handle type="source" id="conclusion-out" position={Position.Right} title="设置结论" />
    </div>
  );
});
