import { memo } from 'react';
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';

export type ConceptNodeData = {
  label: string;
  definition: string;
  dimmed: boolean;
  onDelete: (id: string) => void;
};

export type DerivationNodeData = {
  weight: number;
  premiseCount: number;
  dimmed: boolean;
  onDelete: (id: string) => void;
};

export type ConceptFlowNode = Node<ConceptNodeData, 'concept'>;
export type DerivationFlowNode = Node<DerivationNodeData, 'derivation'>;
export type AuthoringFlowNode = ConceptFlowNode | DerivationFlowNode;

export const ConceptNode = memo(function ConceptNode({ id, data, selected }: NodeProps<ConceptFlowNode>) {
  return (
    <div className={`concept-node ${data.dimmed ? 'is-dimmed' : ''}`}>
      <NodeToolbar isVisible={selected} position={Position.Top} align="end">
        <button className="node-action nodrag" type="button" title="删除概念及相关推导" onClick={() => data.onDelete(id)}>
          <Trash2 size={14} />
        </button>
      </NodeToolbar>
      <Handle type="target" id="concept-in" position={Position.Left} title="将推导连接到此概念" />
      <span className="concept-label">{data.label || '未命名'}</span>
      <span className="concept-id">{id}</span>
      <Handle type="source" id="concept-out" position={Position.Right} title="从此概念开始推导" />
    </div>
  );
});

export const DerivationNode = memo(function DerivationNode({ id, data, selected }: NodeProps<DerivationFlowNode>) {
  return (
    <div className={`derivation-node ${data.dimmed ? 'is-dimmed' : ''}`}>
      <NodeToolbar isVisible={selected} position={Position.Top} align="end">
        <button className="node-action nodrag" type="button" title="删除推导" onClick={() => data.onDelete(id)}>
          <Trash2 size={14} />
        </button>
      </NodeToolbar>
      <div className="derivation-diamond" />
      <span className="derivation-weight">{data.weight}</span>
      <span className="derivation-count">{data.premiseCount}</span>
      <Handle type="target" id="premise-in" position={Position.Left} title="追加前提" />
      <Handle type="source" id="conclusion-out" position={Position.Right} title="设置结论" />
    </div>
  );
});
