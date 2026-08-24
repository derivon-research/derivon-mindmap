import type { AuthoringDocument, Derivation } from './domain';
import { DOCUMENT_SCHEMA } from './domain';

const labels = [
  ['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['e', 'E'], ['f', 'F'],
  ['g', 'G'], ['h', 'H'], ['i', 'I'], ['j', 'J'], ['k', 'K'], ['l', 'L'],
  ['m', 'M'], ['n', 'N'], ['o', 'O'], ['p', 'P'], ['q', 'Q'], ['r', 'R'],
  ['s', 'S'], ['t', 'T'], ['u', 'U'], ['v', 'V'], ['w', 'W'], ['x', 'X'],
  ['y', 'Y'], ['z', 'Z'],
] as const;

const edge = (id: string, premises: string[], conclusion: string, weight = 1): Derivation => ({
  id,
  premises,
  conclusion,
  introduction: `怎样从 ${premises.map((item) => item.toUpperCase()).join('、') || '零基础'} 引入 ${conclusion.toUpperCase()}？`,
  reasoning: `${premises.map((item) => item.toUpperCase()).join(' 与 ') || '基本约定'} 共同给出 ${conclusion.toUpperCase()}。`,
  weight,
});

const derivations: Derivation[] = [
  edge('h-1', [], 'a', 2), edge('h-2', [], 'b', 2), edge('h-3', ['a'], 'c'),
  edge('h-4', ['a', 'b'], 'd', 3), edge('h-5', ['b'], 'e'), edge('h-6', ['c', 'd'], 'f', 2),
  edge('h-7', ['d', 'e'], 'g', 2), edge('h-8', ['f'], 'h'), edge('h-9', ['f', 'g'], 'i', 3),
  edge('h-10', ['g'], 'j'), edge('h-11', ['h', 'i'], 'k', 2), edge('h-12', ['i', 'j'], 'l', 2),
  edge('h-13', ['k', 'l'], 'm', 4), edge('h-14', ['c'], 'n', 4), edge('h-15', ['n', 'e'], 'o', 2),
  edge('h-16', ['o'], 'i', 2), edge('h-17', ['m'], 'p'), edge('h-18', ['m', 'o'], 'q', 3),
  edge('h-19', ['p', 'q'], 'r', 2), edge('h-20', ['r'], 's'), edge('h-21', ['q'], 't', 2),
  edge('h-22', ['s', 't'], 'u', 3), edge('h-23', ['u'], 'v'), edge('h-24', ['v', 'j'], 'w', 2),
  edge('h-25', ['w'], 'x'), edge('h-26', ['x', 'l'], 'y', 2), edge('h-27', ['y'], 'z'),
  edge('h-28', ['z'], 'x', 1),
];

export const sampleDocument: AuthoringDocument = {
  schema: DOCUMENT_SCHEMA,
  document: {
    title: 'B-超图录入实验',
    description: '用于验证概念定义与多前提推导的作者侧数据结构。',
    updatedAt: new Date().toISOString(),
  },
  graph: {
    concepts: labels.map(([id, label]) => ({ id, label, definition: `概念 ${label} 的客观定义。` })),
    derivations,
  },
  view: { positions: {} },
};
