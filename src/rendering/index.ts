/** Deliberate semantic marks; their visual channels belong to the renderer. */
export type GraphMark = 'known' | 'target' | 'selected' | 'completed' | 'current' | 'muted';

export type GraphConcept = {
  readonly id: string;
  readonly label: string;
  readonly marks: readonly GraphMark[];
};

export type GraphHyperedge = {
  readonly id: string;
  readonly tails: readonly string[];
  readonly head: string;
  readonly weight: number;
  readonly marks: readonly GraphMark[];
};

type GraphContent = {
  readonly concepts: readonly GraphConcept[];
  readonly hyperedges: readonly GraphHyperedge[];
};

export type GraphView = GraphContent & (
  | { readonly kind: 'overview' }
  | { readonly kind: 'neighbourhood' }
  | { readonly kind: 'route' }
);

export type GraphObject = { readonly kind: 'concept' | 'derivation'; readonly id: string };
export type GraphEvent =
  | { readonly type: 'select'; readonly object: GraphObject | null }
  | { readonly type: 'activate'; readonly object: GraphObject };

export type GraphRendererProps = {
  readonly view: GraphView;
  readonly onEvent: (event: GraphEvent) => void;
};

export { GraphRenderer } from './GraphRenderer';
