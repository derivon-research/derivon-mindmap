import { describe, expect, it } from 'vitest';
import type { ManifestGraph } from './manifest';
import {
  ROUTE_SCHEMA,
  addStep, copyAsPersonal, decodeRoute, draftFromSolution, isRouteFileName, isRouteId, moveStep, newRoute,
  parallelDerivations, readRoute, removeStep, routeObjectIds, serializeRoute, stepCandidates, swapStep,
  returnToComputedOrder, routeFileStem, routeIdOfFileName, sameRoute, workspaceRoutePath,
  type Route, type RouteDiagnosticCode, type RoutePlace,
} from './route';

const point = (id: string, label = id.toUpperCase()) => ({
  id, data: { label, document: `docs/${id}`, format: 'markdown' as const },
});
const derivation = (id: string, tails: string[], head: string, weight = 1) => ({
  id, weight, tails, head, data: { document: `docs/${id}`, format: 'markdown' as const },
});

/**
 * field → space → subspace → theorem, with a parallel way to space and a detour to `extra`.
 * `loose` and `orphan` only conclude each other.
 */
const graph: ManifestGraph = {
  points: [
    point('field', '域'), point('space', '向量空间'), point('subspace', '子空间'), point('theorem', '谱定理'),
    point('extra'), point('orphan', '孤儿'), point('loose'), point('nowhere', '无源'),
  ],
  hyperedges: [
    derivation('h-space', ['field'], 'space', 1.1),
    derivation('h-space-alt', ['field'], 'space', 2),
    derivation('h-sub', ['space'], 'subspace', 1.1),
    derivation('h-thm', ['subspace'], 'theorem', 1.1),
    derivation('h-extra', ['field'], 'extra'),
    derivation('h-loose', ['orphan'], 'loose'),
    derivation('h-orphan', ['loose'], 'orphan'),
    derivation('h-stuck', ['nowhere'], 'extra'),
  ],
};

const route = (patch: Partial<Route> = {}): Route => ({
  id: 'r-k7f3q2', label: '走到谱定理', known: ['field'], targets: ['theorem'],
  steps: ['h-space', 'h-sub', 'h-thm'], ordered: false, ...patch,
});

const codes = (value: Route, place?: RoutePlace): RouteDiagnosticCode[] =>
  readRoute(graph, value, place).diagnostics.map((item) => item.code);

const file = (patch: Record<string, unknown> = {}) => JSON.stringify({
  schema: ROUTE_SCHEMA, id: 'r-k7f3q2', label: '走到谱定理', known: ['field'], targets: ['theorem'],
  steps: ['h-space', 'h-sub', 'h-thm'], ordered: true, ...patch,
});
const issueCodes = (text: string) => decodeRoute(text).issues.map((issue) => [issue.code, issue.key]);
const basis = 'c'.repeat(64);
const workspace: RoutePlace = { location: 'workspace', fileName: 'r-k7f3q2.json' };
const personal: RoutePlace = { location: 'personal', fileName: 'r-k7f3q2.json' };

describe('derivon.route/v1 files', () => {
  it('round-trips a route through its canonical text in either location', () => {
    const text = serializeRoute(route({ description: '按教材讲法', ordered: true }), 'workspace');
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(JSON.parse(file({ description: '按教材讲法' })));
    expect(Object.keys(JSON.parse(text))).toEqual(['schema', 'id', 'label', 'description', 'known', 'targets', 'steps', 'ordered']);
    expect(decodeRoute(text)).toEqual({ route: route({ description: '按教材讲法', ordered: true }), issues: [] });

    const mine = route({ basedOn: 'r-sv4d2m', basis });
    expect(decodeRoute(serializeRoute(mine, 'personal')).route).toEqual(mine);
  });

  it('leaves an empty description out of the file', () => {
    expect(JSON.parse(serializeRoute(route({ description: '' }), 'workspace'))).not.toHaveProperty('description');
  });

  it('reports every reason a file is unreadable, keyed by the protocol codes', () => {
    expect(issueCodes('{')).toEqual([['unreadable', undefined]]);
    expect(issueCodes('[]')).toEqual([['unreadable', undefined]]);
    expect(issueCodes(file({ schema: 'derivon.routes/v1' }))).toEqual([['wrong-schema', 'schema']]);
    expect(issueCodes(file({ cost: 3, conceptIds: [] }))).toEqual([['unknown-key', 'cost'], ['unknown-key', 'conceptIds']]);
    expect(issueCodes(file({ ordered: undefined, steps: undefined }))).toEqual([['missing-field', 'steps'], ['missing-field', 'ordered']]);
    expect(issueCodes(file({ id: 'route-1', steps: [1], basis: 'ABC', basedOn: 'x', label: 3 }))).toEqual([
      ['invalid-field', 'id'], ['invalid-field', 'label'], ['invalid-field', 'steps'],
      ['invalid-field', 'basedOn'], ['invalid-field', 'basis'],
    ]);
    expect(decodeRoute(file({ id: 'route-1' })).route).toBeNull();
  });

  it('decodes basis and basedOn wherever they appear; the location decides in validation', () => {
    const decoded = decodeRoute(file({ basis, basedOn: 'r-sv4d2m' })).route!;
    expect(codes(decoded, workspace)).toEqual(['forbidden-field', 'forbidden-field']);
    expect(codes(decoded, personal)).toEqual([]);
    expect(codes(route(), personal)).toEqual(['missing-basis']);
    expect(codes(route())).toEqual([]);
  });

  it('reports the shape errors against the file name and in the route itself', () => {
    expect(codes(route(), { location: 'workspace', fileName: 'r-sv4d2m.json' })).toEqual(['id-mismatch']);
    expect(codes(route({ label: ' ', targets: [], steps: [] }))).toEqual(['empty-label', 'empty-targets']);
    expect(readRoute(graph, route({ steps: ['h-space', 'h-sub', 'h-sub', 'h-thm', 'h-sub'] })).diagnostics)
      .toEqual([expect.objectContaining({ code: 'duplicate-step', derivationId: 'h-sub' })]);
  });

  it('refuses to write what it would refuse to read or what has a shape error there', () => {
    expect(() => serializeRoute(route({ basis }), 'workspace')).toThrow(/basis/);
    expect(() => serializeRoute(route(), 'personal')).toThrow(/basis/);
    expect(() => serializeRoute(route({ targets: [] }), 'workspace')).toThrow(/目标/);
    expect(() => serializeRoute(route({ id: 'route-1' }), 'workspace')).toThrow(/id/);
  });

  it('names route files by id and ignores anything else in the directory', () => {
    expect(workspaceRoutePath('r-k7f3q2')).toBe('.derivon/routes/r-k7f3q2.json');
    expect(isRouteFileName('r-k7f3q2.json')).toBe(true);
    expect(isRouteFileName('r-k7f3q2.json.tmp-1')).toBe(false);
    expect(isRouteId('r-k7f3q2')).toBe(true);
    expect(isRouteId('r-k7f3q0')).toBe(false);
    expect(isRouteId('c-k7f3q2')).toBe(false);
    expect(routeIdOfFileName('r-k7f3q2.json')).toBe('r-k7f3q2');
    expect(routeIdOfFileName('notes.json')).toBeNull();
    expect(routeFileStem('notes.json')).toBe('notes');
  });

  it('counts two routes as the same document exactly when their canonical texts agree', () => {
    expect(sameRoute(route({ description: '' }), route())).toBe(true);
    expect(sameRoute(route({ label: '' }), route({ label: '' }))).toBe(true);
    expect(sameRoute(route(), route({ steps: ['h-sub', 'h-space', 'h-thm'] }))).toBe(false);
    expect(sameRoute(route(), null)).toBe(false);
  });
});

describe('reading a route on the graph', () => {
  it('reads a sound route with its computed order, concepts and cost', () => {
    expect(readRoute(graph, route({ steps: ['h-thm', 'h-sub', 'h-space'] }))).toEqual({
      order: ['h-space', 'h-sub', 'h-thm'], orderSource: 'computed', cost: 3.3,
      conceptIds: ['field', 'space', 'subspace', 'theorem'], diagnostics: [], gaps: [], errors: 0, warnings: 0, blocked: 0,
    });
  });

  it('shows a computed order as the execution order followed by the steps that never fire', () => {
    const reading = readRoute(graph, route({ steps: ['h-stuck', 'h-thm', 'h-sub', 'h-space'] }));
    expect(reading.order).toEqual(['h-space', 'h-sub', 'h-thm', 'h-stuck']);
    expect(reading.cost).toBe(4.3);
  });

  it('keeps a written order as the display order, including steps that never fire', () => {
    const reading = readRoute(graph, route({ steps: ['h-stuck', 'h-space', 'h-sub', 'h-thm'], ordered: true }));
    expect(reading).toMatchObject({ orderSource: 'written', order: ['h-stuck', 'h-space', 'h-sub', 'h-thm'] });
  });

  it('reports dangling concepts and derivations as errors', () => {
    expect(codes(route({ known: ['field', 'ghost'], targets: ['theorem', 'gone'], steps: ['h-space', 'h-sub', 'h-thm', 'h-gone'] })))
      .toEqual(['dangling-concept', 'dangling-concept', 'dangling-derivation']);
  });

  it('locates the gap of an unreached target and offers every derivation that fills it', () => {
    const reading = readRoute(graph, route({ steps: ['h-sub', 'h-thm'] }));
    const gap = { conceptId: 'space', wantedBy: 'h-sub', candidates: ['h-space', 'h-space-alt'] };
    expect(reading.diagnostics[0]).toMatchObject({
      code: 'target-unreached', targetId: 'theorem', gaps: [gap], message: '目标「谱定理」到不了：缺「向量空间」。',
    });
    expect(reading.gaps).toEqual([gap]);
    expect(readRoute(graph, route({ steps: [] })).gaps).toEqual([
      { conceptId: 'theorem', wantedBy: 'theorem', candidates: ['h-thm'] },
    ]);
  });

  it('reports an unreached target with no gap when only a cycle leads to it, and names the cycle\'s first step', () => {
    const reading = readRoute(graph, route({ targets: ['loose'], steps: ['h-loose', 'h-orphan'] }));
    expect(reading.diagnostics).toEqual([
      expect.objectContaining({ code: 'target-unreached', gaps: [] }),
      expect.objectContaining({ code: 'never-fires', derivationId: 'h-loose', position: 1, missing: ['orphan'] }),
    ]);
    expect(reading.blocked).toBe(1);
  });

  it('reports a root cause for a cycle of steps that only wait on each other, even when every target is reached', () => {
    const reading = readRoute(graph, route({ steps: ['h-space', 'h-sub', 'h-thm', 'h-orphan', 'h-loose'] }));
    expect(reading.errors).toBe(0);
    expect(reading.diagnostics).toEqual([
      expect.objectContaining({ code: 'never-fires', derivationId: 'h-orphan', position: 4, missing: ['loose'] }),
    ]);
    expect(reading.blocked).toBe(1);
  });

  it('counts a step waiting on a cycle as blocked, and puts the root on the cycle itself', () => {
    const cyclic: ManifestGraph = { ...graph, hyperedges: [...graph.hyperedges, derivation('h-after', ['loose'], 'extra')] };
    const reading = readRoute(cyclic, route({ steps: ['h-space', 'h-sub', 'h-thm', 'h-after', 'h-orphan', 'h-loose'] }));
    expect(reading.diagnostics.filter((item) => item.code === 'never-fires'))
      .toEqual([expect.objectContaining({ derivationId: 'h-orphan' })]);
    expect(reading.blocked).toBe(2);
  });

  it('warns at the root step and only counts the steps that fall with it', () => {
    const reading = readRoute(graph, route({ steps: ['h-sub', 'h-thm'] }));
    expect(reading.blocked).toBe(1);
    expect(reading.diagnostics.map((item) => item.code)).toEqual(['target-unreached', 'never-fires']);
    expect(reading.diagnostics[1]).toMatchObject({ derivationId: 'h-sub', position: 1, missing: ['space'] });
  });

  it('flags a detour as idle, but not while a target is unreached', () => {
    expect(readRoute(graph, route({ steps: ['h-space', 'h-sub', 'h-thm', 'h-extra'] })).diagnostics)
      .toEqual([expect.objectContaining({ code: 'idle', derivationId: 'h-extra', position: 4 })]);
    expect(codes(route({ steps: ['h-sub', 'h-thm', 'h-extra'] }))).not.toContain('idle');
  });

  it('accepts parallel derivations and reports the second one only as a repeated conclusion', () => {
    const reading = readRoute(graph, route({ steps: ['h-space', 'h-space-alt', 'h-sub', 'h-thm'], ordered: true }));
    expect(reading.errors).toBe(0);
    expect(reading.diagnostics).toEqual([expect.objectContaining({
      code: 'duplicate-head', derivationId: 'h-space-alt', position: 2, conceptId: 'space',
      earlierDerivationId: 'h-space', earlierPosition: 1,
    })]);
  });

  it('says which step of a written order needs what, and where it arrives', () => {
    const reading = readRoute(graph, route({ steps: ['h-sub', 'h-space', 'h-thm'], ordered: true }));
    expect(reading.diagnostics).toEqual([expect.objectContaining({
      code: 'order-not-executable', derivationId: 'h-sub', position: 1, needs: [{ conceptId: 'space', producedAt: 2 }],
      message: '第 1 步「子空间」要用「向量空间」，它在第 2 步才得到。',
    })]);
    expect(codes(route({ steps: ['h-sub', 'h-space', 'h-thm'], ordered: false }))).toEqual([]);
  });
});

describe('editing a route', () => {
  it('swaps a step for a parallel derivation in place', () => {
    expect(parallelDerivations(graph, 'h-space')).toEqual(['h-space-alt']);
    const swapped = swapStep(route({ ordered: true }), 'h-space', 'h-space-alt');
    expect(swapped).toEqual(route({ ordered: true, steps: ['h-space-alt', 'h-sub', 'h-thm'] }));
    expect(readRoute(graph, swapped).errors).toBe(0);
  });

  it('swaps in place even when the parallel is already a step, leaving the duplicate for the author to see', () => {
    const both = route({ steps: ['h-space', 'h-space-alt', 'h-sub', 'h-thm'], ordered: true });
    const swapped = swapStep(both, 'h-space', 'h-space-alt');
    expect(swapped.steps).toEqual(['h-space-alt', 'h-space-alt', 'h-sub', 'h-thm']);
    expect(codes(swapped)).toContain('duplicate-step');
  });

  it('removes a step', () => {
    expect(removeStep(route(), 'h-sub').steps).toEqual(['h-space', 'h-thm']);
  });

  it('adds into a computed order as a member and into a written order where it can first fire', () => {
    expect(addStep(graph, route({ steps: ['h-sub', 'h-thm'] }), 'h-space').steps).toEqual(['h-sub', 'h-thm', 'h-space']);
    const filled = addStep(graph, route({ steps: ['h-sub', 'h-thm'], ordered: true }), 'h-space');
    expect(filled.steps).toEqual(['h-space', 'h-sub', 'h-thm']);
    expect(readRoute(graph, filled).errors).toBe(0);
    expect(addStep(graph, route(), 'h-sub')).toEqual(route());
  });

  it('fills a gap in one step from its candidates', () => {
    const broken = route({ steps: ['h-sub', 'h-thm'], ordered: true });
    const [gap] = readRoute(graph, broken).gaps;
    expect(readRoute(graph, addStep(graph, broken, gap.candidates[0])).errors).toBe(0);
  });

  it('writes the order down when a step moves, and returns to computed on request', () => {
    const moved = moveStep(graph, route({ steps: ['h-extra', 'h-space', 'h-sub', 'h-thm'] }), 'h-extra', 3);
    expect(moved).toMatchObject({ ordered: true, steps: ['h-space', 'h-sub', 'h-thm', 'h-extra'] });
    expect(readRoute(graph, moved).orderSource).toBe('written');
    const computed = returnToComputedOrder(moved);
    expect(computed).toEqual({ ...moved, ordered: false });
    expect(readRoute(graph, computed).orderSource).toBe('computed');
  });

  it('can move a step into an order error, which then blocks saving', () => {
    const moved = moveStep(graph, route(), 'h-thm', 0);
    expect(moved.steps).toEqual(['h-thm', 'h-space', 'h-sub']);
    expect(codes(moved)).toEqual(['order-not-executable']);
  });

  it('never drops a dangling or repeated entry when a step moves', () => {
    const broken = route({ steps: ['h-gone', 'h-space', 'h-sub', 'h-space', 'h-thm'] });
    const moved = moveStep(graph, broken, 'h-thm', 0);
    expect(moved.steps).toEqual(['h-thm', 'h-space', 'h-sub', 'h-gone', 'h-space']);
    expect(codes(moved)).toEqual(expect.arrayContaining(['duplicate-step', 'dangling-derivation']));
    expect(readRoute(graph, moved).order).toEqual(['h-thm', 'h-space', 'h-sub']);
  });

  it('keeps a step that never fires when another one moves', () => {
    const moved = moveStep(graph, route({ steps: ['h-stuck', 'h-space', 'h-sub', 'h-thm'] }), 'h-thm', 0);
    expect(moved.steps).toEqual(['h-thm', 'h-space', 'h-sub', 'h-stuck']);
  });

  it('starts empty, and a solver draft replaces the steps with a computed order', () => {
    const empty = newRoute('r-sv4d2m', { label: '新路线', known: ['field'], targets: ['theorem'] });
    expect(empty).toEqual({ id: 'r-sv4d2m', label: '新路线', known: ['field'], targets: ['theorem'], steps: [], ordered: false });
    const drafted = draftFromSolution({ ...empty, ordered: true, steps: ['h-extra'] },
      { order: ['h-space', 'h-sub', 'h-thm'], derivationIds: ['h-thm', 'h-sub', 'h-space'] });
    expect(drafted).toMatchObject({ steps: ['h-space', 'h-sub', 'h-thm'], ordered: false });
  });

  it('saves a copy as mine under a new id that records where it came from', () => {
    const mine = copyAsPersonal(route({ ordered: true }), 'r-sv4d2m');
    expect(mine).toEqual(route({ id: 'r-sv4d2m', ordered: true, basedOn: 'r-k7f3q2' }));
    expect(copyAsPersonal(route({ basis }), 'r-sv4d2m')).not.toHaveProperty('basis');
    expect(codes({ ...mine, basis }, { location: 'personal', fileName: 'r-sv4d2m.json' })).toEqual([]);
  });

  it('offers steps to add by conclusion, ready ones first, never ones already in the route', () => {
    expect(stepCandidates(graph, route({ steps: ['h-sub'] }), '空间')).toEqual([
      { derivationId: 'h-space', ready: true }, { derivationId: 'h-space-alt', ready: true },
    ]);
    expect(stepCandidates(graph, route({ steps: [] }), 'sp')).toEqual([
      { derivationId: 'h-space', ready: true }, { derivationId: 'h-space-alt', ready: true },
      { derivationId: 'h-sub', ready: false },
    ]);
    expect(stepCandidates(graph, route(), ' ')).toEqual([]);
  });
});

describe('what a personal route basis covers', () => {
  it('is known, targets, steps and every endpoint of the steps the graph has', () => {
    expect([...routeObjectIds(graph, route({ known: [], steps: ['h-sub', 'h-gone'] }))].sort())
      .toEqual(['h-gone', 'h-sub', 'space', 'subspace', 'theorem']);
  });
});
