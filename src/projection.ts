import type { AuthoringDocument, Derivation, ViewReplacement } from './domain';

export type ReplacementControl = {
  replaceWith: string;
  show: ViewReplacement['show'];
  label: string;
};

export type ProjectedConcept = {
  id: string;
  depth: number;
  controls: ReplacementControl[];
};

export type GraphProjection = {
  concepts: ProjectedConcept[];
  derivations: Derivation[];
  visibleIds: Set<string>;
};

export function projectDocument(document: AuthoringDocument): GraphProjection {
  const replacementByTarget = new Map(document.view.replacements.map((item) => [item.replaceWith, item]));
  const ownerByPoint = new Map<string, ViewReplacement>();
  document.view.replacements.forEach((replacement) => {
    replacement.points.forEach((id) => ownerByPoint.set(id, replacement));
  });

  const concepts: ProjectedConcept[] = [];
  const visited = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    const ownReplacement = replacementByTarget.get(id);
    if (ownReplacement?.show === 'points') {
      ownReplacement.points.forEach((point) => visit(point, depth + 1));
      return;
    }

    const controls: ReplacementControl[] = [];
    if (ownReplacement?.show === 'replacement') {
      controls.push({
        replaceWith: id,
        show: 'points',
        label: `${ownReplacement.points.length} 点`,
      });
    }
    const owner = ownerByPoint.get(id);
    if (owner?.show === 'points') {
      controls.push({
        replaceWith: owner.replaceWith,
        show: 'replacement',
        label: `→ ${owner.replaceWith}`,
      });
    }
    concepts.push({ id, depth, controls });
  };

  document.graph.concepts
    .filter((concept) => !ownerByPoint.has(concept.id))
    .forEach((concept) => visit(concept.id, 0));

  const conceptOrder = new Map(document.graph.concepts.map((concept, index) => [concept.id, index]));
  concepts.sort((left, right) => conceptOrder.get(left.id)! - conceptOrder.get(right.id)!);
  const visibleConceptIds = new Set(concepts.map((concept) => concept.id));
  const derivations = document.graph.derivations.filter((derivation) =>
    visibleConceptIds.has(derivation.conclusion)
    && derivation.premises.every((premise) => visibleConceptIds.has(premise)),
  );
  return {
    concepts,
    derivations,
    visibleIds: new Set([...visibleConceptIds, ...derivations.map((item) => item.id)]),
  };
}
