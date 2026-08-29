import { describe, expect, it } from 'vitest';
import { groupHyperedges } from './hyperedgeGroups';
import { createOnboardingTours, ONBOARDING_TOURS, TOUR_FEATURES } from './onboarding';
import {
  graphTutorialWorkspace,
  graphTutorialWorkspaceForStage,
  graphTutorialWorkspaceWithReplacement,
} from './sample';

describe('onboarding tour definitions', () => {
  it('keeps first-run onboarding short and splits advanced topics into modules', () => {
    expect(Object.keys(ONBOARDING_TOURS)).toEqual([
      'basics',
      'documents',
      'graph',
      'navigation',
      'routes',
      'agent',
    ]);
    expect(ONBOARDING_TOURS.basics.steps).toHaveLength(8);
    expect(ONBOARDING_TOURS.graph.title).toBe('理解 Derivon 的基本图模型');
    expect(ONBOARDING_TOURS.graph.steps).toHaveLength(25);
    expect(ONBOARDING_TOURS.graph.steps.slice(6, 20).map((step) => step.id)).toEqual([
      'derivation-model',
      'premise-and-conclusion',
      'create-derivation-drag',
      'create-derivation-form',
      'open-derivation-document',
      'understand-derivation-document',
      'return-from-derivation',
      'complete-invertible-premises',
      'create-surjective-parallel',
      'parallel',
      'parallel-select',
      'weight',
      'more-premises',
      'active-member-result',
    ]);
    const createDerivationStep = ONBOARDING_TOURS.graph.steps.find((step) => step.id === 'create-derivation-form');
    expect(createDerivationStep?.description).toBe('当然，你也可以在这里创建推导');
    expect(createDerivationStep?.requires).toBeUndefined();
    expect(ONBOARDING_TOURS.graph.steps.slice(-5).map((step) => step.id)).toEqual([
      'replacement-intro',
      'select-replacement-points',
      'replace-select',
      'replace-target',
      'toggle-replacement',
    ]);
    expect(ONBOARDING_TOURS.graph.steps.filter((step) => step.autoAdvance).map((step) => step.id)).toEqual(expect.arrayContaining([
      'select-replacement-points',
      'replace-select',
    ]));
    expect(ONBOARDING_TOURS.routes.steps.map((step) => step.id)).toEqual(['download-desktop']);
    expect(ONBOARDING_TOURS.routes.steps[0]?.link?.href).toBe(
      'https://github.com/derivon-research/derivon-mindmap/releases/latest',
    );
  });

  it('shows the route tutorial only in the local application', () => {
    const browserTour = createOnboardingTours(false).routes;
    const nativeTour = createOnboardingTours(true).routes;

    expect(browserTour.steps.map((step) => step.id)).toEqual(['download-desktop']);
    expect(nativeTour.title).toBe('推导学习路线');
    expect(nativeTour.steps.map((step) => step.id)).toEqual([
      'route-intro',
      'open-route-panel',
      'select-route-start',
      'select-route-target',
      'solve-route',
      'read-route-result',
    ]);
    expect(nativeTour.steps.find((step) => step.id === 'solve-route')?.autoAdvance).not.toBe(true);
  });

  it('does not teach raw JSON in beginner tours', () => {
    const copy = Object.values(ONBOARDING_TOURS)
      .flatMap((tour) => tour.steps)
      .map((step) => `${step.id} ${step.title} ${step.description}`)
      .join('\n');
    expect(copy).not.toMatch(/JSON/i);
    expect(copy).not.toMatch(/Replace With/i);
  });

  it('connects parallel derivation selection with learning-cost ordering', () => {
    const parallelStep = ONBOARDING_TOURS.graph.steps.find((step) => step.id === 'parallel-select');
    const weightStep = ONBOARDING_TOURS.graph.steps.find((step) => step.id === 'weight');

    expect(parallelStep?.description).toContain('下方推导 ID、文档和成本会随当前方案切换');
    expect(weightStep?.description).toContain('权重越大，学习成本越高');
    expect(weightStep?.description).toContain('成本最低的默认置顶');
  });

  it('introduces math-reforged and teaches the direct large-graph workflows', () => {
    const introStep = ONBOARDING_TOURS.navigation.steps.find((step) => step.id === 'navigation-intro');
    const zoomStep = ONBOARDING_TOURS.navigation.steps.find((step) => step.id === 'zoom');
    const focusStep = ONBOARDING_TOURS.navigation.steps.find((step) => step.id === 'focus');
    const searchStep = ONBOARDING_TOURS.navigation.steps.find((step) => step.id === 'search');

    expect(introStep?.description).toContain('这个大型 derivon 实例项目是 math-reforged');
    expect(introStep?.description).toContain('《线性代数应该这样学（第四版）》');
    expect(introStep?.link).toEqual({
      href: 'https://github.com/derivon-research/math-reforged',
      label: '查看 Math Reforged 的 GitHub 仓库',
    });
    expect(ONBOARDING_TOURS.navigation.steps[1]?.id).toBe('zoom');
    expect(zoomStep?.feature).toBe(TOUR_FEATURES.canvas);
    expect(zoomStep?.description).toContain('鼠标滚轮缩放');
    expect(zoomStep?.description).toContain('MacBook 触控板上双指缩放');
    expect(zoomStep?.description).toContain('左下角的按钮');
    expect(focusStep?.feature).toBe(TOUR_FEATURES.canvas);
    expect(focusStep?.description).toContain('概念和推导都可以打开关联视图');
    expect(focusStep?.description).toContain('连续点击同一个概念或推导两次');
    expect(focusStep?.description).toContain('也可以使用顶部的局部视图按钮');
    expect(searchStep?.description).toContain('只输入“Hamilton”');
    expect(searchStep?.description).toContain('“Cayley-Hamilton 定理”');
    expect(searchStep?.description).toContain('从候选结果中选择');
  });

  it('bundles a self-contained linear algebra graph example', () => {
    const labels = graphTutorialWorkspace.manifest.graph.points.map((point) => point.data.label);
    const parallel = groupHyperedges(graphTutorialWorkspace.manifest.graph.hyperedges)
      .find((group) => group.members.length === 2);

    expect(labels).toEqual(expect.arrayContaining(['线性映射', '零空间', '单射', '满射', '可逆线性映射']));
    expect(parallel?.members.map((member) => member.id)).toEqual(['null-space-def', 'null-space-equations']);
    expect(graphTutorialWorkspace.manifest.graph.hyperedges.some((edge) => edge.head === 'invertible')).toBe(false);

    const single = graphTutorialWorkspaceForStage('invertible-single').manifest;
    expect(single.graph.hyperedges.some((edge) =>
      edge.head === 'invertible' && edge.tails.join(',') === 'injective-surjective',
    )).toBe(true);
    const complete = graphTutorialWorkspaceForStage('invertible-complete').manifest;
    expect(complete.graph.hyperedges.some((edge) =>
      edge.head === 'invertible'
      && edge.tails.includes('injective-surjective')
      && edge.tails.includes('surjective'),
    )).toBe(true);
    const stagedParallel = groupHyperedges(graphTutorialWorkspaceForStage('surjective-parallel').manifest.graph.hyperedges)
      .find((group) => group.members.some((edge) => edge.head === 'surjective'));
    expect(stagedParallel?.members).toHaveLength(2);
    expect(graphTutorialWorkspaceForStage('null-space-updated').manifest.graph.hyperedges
      .find((edge) => edge.id === 'null-space-def')?.tails).toEqual(['linear-map', 'subspace']);

    expect(graphTutorialWorkspaceWithReplacement.manifest.view.replacements).toEqual([{
      points: ['injective-surjective', 'surjective'],
      replaceWith: 'invertible',
      show: 'points',
    }]);
  });

  it('keeps implementation constraints out of user-facing step copy', () => {
    const copy = Object.values(ONBOARDING_TOURS)
      .flatMap((tour) => tour.steps.map((step) => step.description))
      .join('\n');
    expect(copy).not.toMatch(/强行跳转|自动跳(?:转|走)|自动进入|不会.*(?:跳转|挡住)|蒙版|高亮的|本步骤才会|旧目标|引导层上方|退出时会恢复|下一步.*启用|教程会留下时间|教程已经打开/);
    expect(copy).not.toContain('QWERTY');
  });

  it('limits automatic progression to direct action handoffs', () => {
    const automaticSteps = Object.values(ONBOARDING_TOURS)
      .flatMap((tour) => tour.steps.map((step) => `${tour.id}:${step.id}`))
      .filter((key) => {
        const [tourId, stepId] = key.split(':') as [keyof typeof ONBOARDING_TOURS, string];
        return ONBOARDING_TOURS[tourId].steps.find((step) => step.id === stepId)?.autoAdvance;
      });

    expect(automaticSteps).toEqual([
      'basics:workspace',
      'basics:add-a',
      'basics:return-canvas',
      'graph:open-linear-map-document',
      'graph:return-from-concept',
      'graph:create-derivation-drag',
      'graph:open-derivation-document',
      'graph:return-from-derivation',
      'graph:complete-invertible-premises',
      'graph:create-surjective-parallel',
      'graph:parallel-select',
      'graph:more-premises',
      'graph:select-replacement-points',
      'graph:replace-select',
      'navigation:delete',
    ]);
  });
});
