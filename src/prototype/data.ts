/**
 * PROTOTYPE ONLY — throwaway. Starting routes on the real bundled example graph (64 concepts,
 * 68 derivations, 6 groups of parallel derivations). Subgraphs come from the greedy test
 * solver; labels, ids and the "an author wrote these" framing are made up.
 */
import workspaceText from '../examples/math-reforged/.derivon/workspace.json?raw';
import { solveGreedily } from '../testing/routeSolver';
import { parseWorkspaceGraph, type WorkspaceGraph } from '../workspace/index';
import { executableOrder, type Route } from './routeModel';

export const graph: WorkspaceGraph = parseWorkspaceGraph(workspaceText);

export const FOUNDATIONS = ['foundation-fields', 'finite-tuple'];

/** The draft every new route starts from: what the solver says for these targets and known. */
export function solverDraft(known: readonly string[], targets: readonly string[]) {
  return solveGreedily(graph, { knownConceptIds: known, targetConceptIds: targets });
}

// Axler's way: eigenvalues and upper-triangular matrices (ch. 5) before inner products (ch. 6),
// and the spectral theorem through triangularisation plus normal operators, not the solver's
// shorter self-adjoint derivation.
const axlerEigen = solverDraft(FOUNDATIONS, ['triangular-diagonal']).derivationIds;
const axlerInner = solverDraft(FOUNDATIONS, ['orthonormal', 'normal-selfadjoint']).derivationIds
  .filter((id) => !axlerEigen.includes(id));
const axlerIds = [...axlerEigen, ...axlerInner, 'spectral'];
const axler: Route = {
  id: 'r-ax7spq', owner: 'workspace', label: '按 Axler 的讲法走到谱定理',
  description: '先特征值与上三角化，再内积；谱定理走上三角化 + 正规算子。与 Linear Algebra Done Right 的章节顺序一致。',
  known: FOUNDATIONS, targets: ['spectral-theorem'],
  derivationIds: axlerIds, order: executableOrder(graph, FOUNDATIONS, axlerIds).order,
};

const svdDraft = solverDraft(FOUNDATIONS, ['svd']);
const svd: Route = {
  id: 'r-sv4d2m', owner: 'workspace', label: '最快到 SVD',
  description: '求解器给的那条，没有改动顺序。',
  known: FOUNDATIONS, targets: ['svd'],
  derivationIds: svdDraft.derivationIds, order: null,
};

/** Written against an older graph: names a derivation that no longer exists. Load-time check catches it. */
const stale: Route = {
  id: 'r-ex9m3k', owner: 'workspace', label: '考试大纲：行列式（旧）',
  description: '图改过之后没人更新它。',
  known: FOUNDATIONS, targets: ['determinant'],
  derivationIds: ['given-fields', 'def-vector', 'linear-map-def', 'operator-def', 'alternating-old', 'det-build'],
  order: null,
};

const mineDraft = solverDraft([...FOUNDATIONS, 'span', 'independence', 'basis'], ['diagonalization']);
const mine: Route = {
  id: 'r-k7f3q2', owner: 'personal', label: '特征值与对角化',
  description: '',
  known: [...FOUNDATIONS, 'span', 'independence', 'basis'], targets: ['diagonalization'],
  derivationIds: mineDraft.derivationIds, order: mineDraft.order,
};

export const initialRoutes: readonly Route[] = [axler, svd, stale, mine];

const ALPHABET = '23456789abcdefghjkmnpqrstvwxyz';
export function newRouteId() {
  let id = 'r-';
  for (let i = 0; i < 6; i += 1) id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return id;
}
