import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BookOpen, BrainCircuit, Compass, FileText, GitBranch, Route, X } from 'lucide-react';
import { EVENTS, Joyride, type EventData, type Placement, type Step, type TooltipRenderProps } from 'react-joyride';

export const ONBOARDING_STORAGE_KEY = 'derivon.onboarding/v2';
const ONBOARDING_VERSION = 2;

export const TOUR_FEATURES = {
  newWorkspace: { id: 'new-workspace', label: '在新文件夹创建空项目' },
  projectTitle: { id: 'project-title', label: '项目标题' },
  projectDescription: { id: 'project-description', label: '项目说明' },
  addConcept: { id: 'add-concept', label: '新建概念' },
  newDerivation: { id: 'new-derivation', label: '新建推导' },
  conceptName: { id: 'concept-name', label: '概念名称' },
  openDocument: { id: 'open-document', label: '编辑文档' },
  documentWorkspace: { id: 'document-workspace', label: '文档编辑区' },
  documentBody: { id: 'document-body', label: 'Markdown 正文' },
  documentFormat: { id: 'document-format', label: '文档格式工具栏' },
  insertFormula: { id: 'insert-formula', label: '插入公式' },
  insertTable: { id: 'insert-table', label: '插入表格' },
  insertHtml: { id: 'insert-html', label: '插入 HTML 交互示例' },
  editorHistory: { id: 'editor-history', label: '编辑历史' },
  returnCanvas: { id: 'return-canvas', label: '返回画布' },
  autoLayout: { id: 'auto-layout', label: '自动布局' },
  canvas: { id: 'canvas', label: '图画布' },
  derivationAlternatives: { id: 'derivation-alternatives', label: '平行推导' },
  derivationWeight: { id: 'derivation-weight', label: '成本权重' },
  focusedView: { id: 'focused-view', label: '局部视图' },
  routeMode: { id: 'route-mode', label: '路线模式' },
  routeStart: { id: 'route-start', label: '已经掌握的概念' },
  routeTarget: { id: 'route-target', label: '路线目标概念' },
  routeSolve: { id: 'route-solve', label: '开始求解路线' },
  routeResult: { id: 'route-result', label: '路线结果' },
  replaceWith: { id: 'replace-with', label: '替换' },
  replacementToggle: { id: 'replacement-toggle', label: '替换视图' },
  search: { id: 'search', label: '搜索概念' },
  deleteItem: { id: 'delete-item', label: '删除对象' },
  history: { id: 'history', label: '画布历史' },
  zoom: { id: 'zoom', label: '缩放与小地图' },
  workspaceJson: { id: 'workspace-json', label: '编辑工作区 JSON' },
  jsonEditor: { id: 'json-editor', label: '工作区 JSON 编辑器' },
  openWorkspace: { id: 'open-workspace', label: '连接工作区文件夹' },
  help: { id: 'help', label: '操作引导' },
} as const;

type TourFeature = (typeof TOUR_FEATURES)[keyof typeof TOUR_FEATURES];

export type TourAction =
  | 'workspace-created'
  | 'project-title-edited'
  | 'project-description-edited'
  | 'concept-added'
  | 'concept-renamed'
  | 'document-opened'
  | 'document-edited'
  | 'document-formatted'
  | 'formula-inserted'
  | 'table-inserted'
  | 'html-inserted'
  | 'editor-history-used'
  | 'canvas-returned'
  | 'layout-applied'
  | 'derivation-created'
  | 'derivation-selected'
  | 'derivation-weight-edited'
  | 'derivation-updated'
  | 'tutorial-invertible-created'
  | 'tutorial-invertible-premise-added'
  | 'tutorial-surjective-parallel-created'
  | 'tutorial-surjective-original-selected'
  | 'tutorial-null-space-premise-added'
  | 'focused-view-toggled'
  | 'route-mode-opened'
  | 'route-start-selected'
  | 'route-target-selected'
  | 'route-solved'
  | 'multiple-concepts-selected'
  | 'replacement-started'
  | 'replacement-created'
  | 'replacement-toggled'
  | 'replacement-compared'
  | 'concept-found'
  | 'node-moved'
  | 'item-deleted'
  | 'undo-used'
  | 'redo-used'
  | 'json-opened'
  | 'json-applied';

export type TourPreparation =
  | 'open-selected-document'
  | 'open-selected-derivation-document'
  | 'open-graph-example'
  | 'open-graph-example-and-select-concept'
  | 'open-graph-example-and-open-concept-document'
  | 'open-graph-example-and-select-derivation'
  | 'open-graph-example-and-open-derivation-document'
  | 'open-graph-example-and-select-parallel-derivation'
  | 'open-graph-example-and-select-replacement-points'
  | 'open-graph-example-and-prepare-replacement'
  | 'open-graph-example-with-replacement'
  | 'open-graph-example-stage-base'
  | 'open-graph-example-stage-invertible-single'
  | 'open-graph-example-stage-invertible-complete'
  | 'open-graph-example-stage-surjective-parallel'
  | 'open-graph-example-stage-null-space-updated'
  | 'show-canvas'
  | 'show-project-overview'
  | 'select-concept'
  | 'select-derivation'
  | 'select-parallel-derivation'
  | 'open-navigation-example'
  | 'open-navigation-example-and-select-concept'
  | 'open-route-example'
  | 'open-route-example-and-open-panel'
  | 'open-route-example-with-start'
  | 'open-route-example-with-start-and-target'
  | 'open-route-example-with-result';

export function tourTarget(feature: TourFeature): { 'data-tour-feature': string } {
  return { 'data-tour-feature': feature.id };
}

type TourActionListener = (action: TourAction) => void;
const tourActionListeners = new Set<TourActionListener>();

export function notifyTourAction(action: TourAction): void {
  tourActionListeners.forEach((listener) => listener(action));
}

function subscribeTourActions(listener: TourActionListener): () => void {
  tourActionListeners.add(listener);
  return () => tourActionListeners.delete(listener);
}

type TourStepDefinition = {
  id: string;
  feature?: TourFeature;
  target?: string;
  title: string;
  description: string;
  link?: { href: string; label: string };
  shortcut?: string;
  requires?: TourAction;
  autoAdvance?: boolean;
  prepare?: TourPreparation;
  placement?: Placement | 'auto' | 'center';
  surface?: 'control' | 'editor' | 'canvas' | 'dialog';
};

type TourDefinition = {
  id: TourId;
  title: string;
  summary: string;
  icon: typeof BookOpen;
  steps: readonly TourStepDefinition[];
};

export type TourId = 'basics' | 'documents' | 'graph' | 'navigation' | 'routes' | 'agent';
export type TourStepId = string;
export type TourCurrentSurface = 'canvas' | 'editor';

function expectedSurface(step: TourStepDefinition): TourCurrentSurface | null {
  if (step.surface === 'canvas') return 'canvas';
  if (step.surface === 'editor' || step.feature === TOUR_FEATURES.returnCanvas) return 'editor';

  switch (step.prepare) {
    case 'open-selected-document':
    case 'open-selected-derivation-document':
    case 'open-graph-example-and-open-concept-document':
    case 'open-graph-example-and-open-derivation-document':
      return 'editor';
    case 'open-graph-example':
    case 'open-graph-example-and-select-concept':
    case 'open-graph-example-and-select-derivation':
    case 'open-graph-example-and-select-parallel-derivation':
    case 'open-graph-example-and-select-replacement-points':
    case 'open-graph-example-and-prepare-replacement':
    case 'open-graph-example-with-replacement':
    case 'open-graph-example-stage-base':
    case 'open-graph-example-stage-invertible-single':
    case 'open-graph-example-stage-invertible-complete':
    case 'open-graph-example-stage-surjective-parallel':
    case 'open-graph-example-stage-null-space-updated':
    case 'show-canvas':
    case 'show-project-overview':
    case 'select-concept':
    case 'select-derivation':
    case 'select-parallel-derivation':
    case 'open-navigation-example':
    case 'open-navigation-example-and-select-concept':
    case 'open-route-example':
    case 'open-route-example-and-open-panel':
    case 'open-route-example-with-start':
    case 'open-route-example-with-start-and-target':
    case 'open-route-example-with-result':
      return 'canvas';
    default:
      return null;
  }
}

function recoveryStep(currentSurface: TourCurrentSurface): TourStepDefinition {
  if (currentSurface === 'editor') {
    return {
      id: 'recover-canvas',
      feature: TOUR_FEATURES.returnCanvas,
      title: '返回知识图继续',
      description: '当前步骤需要在知识图中完成。点击返回按钮，回到刚才的操作区域。',
      placement: 'bottom',
    };
  }

  return {
    id: 'recover-editor',
    feature: TOUR_FEATURES.openDocument,
    title: '返回文档继续',
    description: '当前步骤需要在文档编辑区完成。点击“编辑文档”，回到刚才的操作区域。',
    placement: 'right',
  };
}

function completedStepFallback(step: TourStepDefinition): TourStepDefinition {
  return {
    ...step,
    target: 'body',
    feature: undefined,
    description: `${step.description} 这一步已经完成，可以直接返回后续内容。`,
    prepare: undefined,
    placement: 'center',
    surface: 'dialog',
  };
}

const BASICS_STEPS: readonly TourStepDefinition[] = [
  {
    id: 'workspace',
    feature: TOUR_FEATURES.newWorkspace,
    title: '创建第一个项目',
    description: '点击文件夹加号，选择或创建一个空文件夹。Derivon 会在其中建立项目所需的目录和文件。',
    prepare: 'show-canvas',
    requires: 'workspace-created',
    autoAdvance: true,
  },
  {
    id: 'title',
    feature: TOUR_FEATURES.projectTitle,
    title: '给项目起一个名字',
    description: '输入一个容易辨认的项目标题，例如“A、B 与 X”。标题用于概括整个知识图的主题。',
    requires: 'project-title-edited',
    placement: 'bottom-start',
  },
  {
    id: 'description',
    feature: TOUR_FEATURES.projectDescription,
    title: '说明这个项目研究什么',
    description: '在右侧写下这个项目的目标、范围或使用场景。',
    prepare: 'show-project-overview',
    requires: 'project-description-edited',
    placement: 'left',
  },
  {
    id: 'add-a',
    feature: TOUR_FEATURES.addConcept,
    title: '新建一个概念',
    description: '概念是知识图里的基本对象。点击加号后，Derivon 会同时创建节点、Markdown 源文件和 HTML 访问入口。',
    prepare: 'show-canvas',
    requires: 'concept-added',
    autoAdvance: true,
  },
  {
    id: 'name-a',
    feature: TOUR_FEATURES.conceptName,
    title: '命名概念 A',
    description: '把“新概念”改成“A”。概念名称用于画布识别；它的定义、范围和例子写在独立文档中。',
    prepare: 'select-concept',
    shortcut: 'Enter 确认输入',
    requires: 'concept-renamed',
    placement: 'left',
  },
  {
    id: 'concept-document',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '概念拥有独立文档',
    description: '概念文档用于记录精确定义、适用范围、例子和必要背景；Markdown 会同步生成可直接访问的 HTML。',
    prepare: 'open-selected-document',
    placement: 'right',
    surface: 'editor',
  },
  {
    id: 'author-document',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '写下 A 的定义',
    description: '在正文中写下 A 的定义，并补充它的适用范围或一个简单例子。',
    prepare: 'open-selected-document',
    shortcut: 'Ctrl/Cmd + B 粗体 · Ctrl/Cmd + I 斜体',
    requires: 'document-edited',
    placement: 'right',
    surface: 'editor',
  },
  {
    id: 'return-canvas',
    feature: TOUR_FEATURES.returnCanvas,
    title: '返回知识图',
    description: '点击返回按钮，回到知识图。',
    prepare: 'open-selected-document',
    requires: 'canvas-returned',
    autoAdvance: true,
  },
] as const;

const DOCUMENT_STEPS: readonly TourStepDefinition[] = [
  {
    id: 'document-tools-intro',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '文档编辑区',
    description: '概念和推导都拥有独立文档。这里可以编写正文、公式、表格和交互内容。',
    prepare: 'open-selected-document',
    placement: 'right',
    surface: 'editor',
  },
  {
    id: 'format-document',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '体验排版工具',
    description: '选择一段文字，尝试粗体、斜体、引用、列表、链接或代码等排版功能。',
    prepare: 'open-selected-document',
    shortcut: 'Ctrl/Cmd + B · Ctrl/Cmd + I',
    requires: 'document-formatted',
    placement: 'right',
    surface: 'editor',
  },
  {
    id: 'insert-formula',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '插入 KaTeX 公式',
    description: '把光标放到期望位置，再插入行内或块级公式。插入后可以点击公式继续修改 LaTeX 源码。',
    prepare: 'open-selected-document',
    shortcut: '$...$ 行内 · $$...$$ 块级',
    requires: 'formula-inserted',
    placement: 'right',
    surface: 'editor',
  },
  {
    id: 'insert-table',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '插入结构化表格',
    description: '插入 3×3 表格并编辑几个单元格。表格与普通 Markdown 内容保存在同一份文档中。',
    prepare: 'open-selected-document',
    requires: 'table-inserted',
    placement: 'right',
    surface: 'editor',
  },
  {
    id: 'insert-html',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '插入 HTML 交互内容',
    description: '插入一个 HTML 交互示例，并在源码编辑与隔离预览之间切换。',
    prepare: 'open-selected-document',
    requires: 'html-inserted',
    placement: 'right',
    surface: 'editor',
  },
  {
    id: 'editor-history',
    feature: TOUR_FEATURES.documentWorkspace,
    title: '撤回一段临时输入',
    description: '在正文中做一次临时修改，再撤回这次修改。文档历史和画布结构历史彼此独立。',
    prepare: 'open-selected-document',
    shortcut: 'Ctrl/Cmd + Z · Ctrl/Cmd + Shift + Z',
    requires: 'editor-history-used',
    placement: 'right',
    surface: 'editor',
  },
] as const;

const GRAPH_STEPS: readonly TourStepDefinition[] = [
  {
    id: 'graph-intro',
    target: 'body',
    title: '进入线性代数案例',
    description: '接下来用“线性映射、零空间与可逆性”这组真实概念，理解 Derivon 如何组织概念、推导和不同的学习路径。',
    prepare: 'open-graph-example',
    placement: 'center',
    surface: 'dialog',
  },
  { id: 'concepts', feature: TOUR_FEATURES.canvas, title: '概念是需要理解的对象', description: '案例中的每个矩形都是一个概念，例如“线性映射”“零空间”“单射”和“满射”。概念节点负责回答“要理解什么”。', prepare: 'open-graph-example', placement: 'right', surface: 'canvas' },
  { id: 'select-linear-map', feature: TOUR_FEATURES.canvas, title: '查看线性映射', description: '画布已经选中“线性映射”，右侧会显示它的名称和文档入口。概念的定义与例子保存在独立文档中。', prepare: 'open-graph-example-and-select-concept', placement: 'right', surface: 'canvas' },
  { id: 'open-linear-map-document', feature: TOUR_FEATURES.openDocument, title: '打开概念文档', description: '点击“编辑文档”，查看线性映射的定义。', prepare: 'open-graph-example-and-select-concept', requires: 'document-opened', autoAdvance: true, placement: 'left' },
  { id: 'understand-concept-document', feature: TOUR_FEATURES.documentWorkspace, title: '概念文档回答“它是什么”', description: '这里记录概念的精确定义、适用范围和例子。知识图保持简洁，详细内容留在文档中。', prepare: 'open-graph-example-and-open-concept-document', placement: 'right', surface: 'editor' },
  { id: 'return-from-concept', feature: TOUR_FEATURES.returnCanvas, title: '返回知识图', description: '点击返回按钮，继续观察概念之间的关系。', prepare: 'open-graph-example-and-open-concept-document', requires: 'canvas-returned', autoAdvance: true },
  { id: 'derivation-model', feature: TOUR_FEATURES.canvas, title: '推导说明概念之间为什么相关', description: '菱形表示一条推导：掌握“线性映射”后，可以由定义理解“零空间”。推导本身也是独立对象，而不只是一条连线。', prepare: 'open-graph-example-and-select-derivation', placement: 'right', surface: 'canvas' },
  { id: 'premise-and-conclusion', feature: TOUR_FEATURES.canvas, title: '蓝线连接前提，红线指向结论', description: '左侧蓝线表示这条推导需要先掌握“线性映射”；右侧红线指向推导得到的“零空间”。一条推导也可以同时拥有多个前提。', prepare: 'open-graph-example-and-select-derivation', placement: 'right', surface: 'canvas' },
  { id: 'create-derivation-drag', feature: TOUR_FEATURES.canvas, title: '拖拽概念创建推导', description: '把“单射”右侧的蓝色连接点拖到“可逆线性映射”左侧的红色连接点，创建一条新的推导。', prepare: 'open-graph-example-stage-base', requires: 'tutorial-invertible-created', autoAdvance: true, placement: 'right', surface: 'canvas' },
  { id: 'create-derivation-form', feature: TOUR_FEATURES.newDerivation, title: '从右上角创建推导', description: '当然，你也可以在这里创建推导', prepare: 'open-graph-example-stage-invertible-single', placement: 'bottom' },
  { id: 'open-derivation-document', feature: TOUR_FEATURES.openDocument, title: '打开推导文档', description: '点击“编辑文档”，查看这条推导具体如何从线性映射得到零空间。', prepare: 'open-graph-example-stage-invertible-single', requires: 'document-opened', autoAdvance: true, placement: 'left' },
  { id: 'understand-derivation-document', feature: TOUR_FEATURES.documentWorkspace, title: '推导文档回答“为什么”', description: '概念文档写“它是什么”，推导文档则记录推导过程、依据和限制。两类文档共同构成可阅读的知识网络。', prepare: 'open-graph-example-stage-invertible-single', placement: 'right', surface: 'editor' },
  { id: 'return-from-derivation', feature: TOUR_FEATURES.returnCanvas, title: '返回画布继续构造推导', description: '点击返回按钮，继续为刚才创建的推导补充前提。', prepare: 'open-graph-example-stage-invertible-single', requires: 'canvas-returned', autoAdvance: true },
  { id: 'complete-invertible-premises', feature: TOUR_FEATURES.canvas, title: '为推导追加满射前提', description: '把“满射”右侧的蓝色连接点拖到“单射 → 可逆线性映射”推导菱形左侧，得到“满射，单射 → 可逆线性映射”。', prepare: 'open-graph-example-stage-invertible-single', requires: 'tutorial-invertible-premise-added', autoAdvance: true, placement: 'right', surface: 'canvas' },
  { id: 'create-surjective-parallel', feature: TOUR_FEATURES.canvas, title: '亲手创建一条重叠推导', description: '把“线性映射”拖到“满射”，再创建一条相同前提和结论的推导。', prepare: 'open-graph-example-stage-invertible-complete', requires: 'tutorial-surjective-parallel-created', autoAdvance: true, placement: 'right', surface: 'canvas' },
  { id: 'parallel', target: '.derivation-alternatives', title: '同一关系可以有多种推导', description: '你刚创建的推导与原有推导拥有相同前提和结论，因此叠放为一组；每个方案的文档和学习成本仍然独立。', prepare: 'open-graph-example-stage-surjective-parallel', placement: 'left' },
  { id: 'parallel-select', target: '.derivation-alternatives', title: '切换当前推导方案', description: '在右侧选择原有的 surjective-def。下方推导 ID、文档和成本会随当前方案切换。', prepare: 'open-graph-example-stage-surjective-parallel', requires: 'tutorial-surjective-original-selected', autoAdvance: true, placement: 'left' },
  { id: 'weight', feature: TOUR_FEATURES.derivationWeight, title: '调整当前实现的学习成本', description: '这个权重数字代表：掌握所有前提后，完成当前推导还需要多少学习投入。权重越大，学习成本越高。多个推导拥有相同前提和结论时，会按权重从低到高排列，成本最低的默认置顶。', prepare: 'open-graph-example-stage-surjective-parallel', requires: 'derivation-weight-edited', placement: 'left' },
  { id: 'more-premises', feature: TOUR_FEATURES.canvas, title: '只修改当前置顶的推导', description: '把“子空间”的右侧连接点拖到“线性映射 → 零空间”推导菱形左侧。这个操作只会给当前置顶方案追加前提。', prepare: 'open-graph-example-stage-surjective-parallel', requires: 'tutorial-null-space-premise-added', autoAdvance: true, placement: 'right', surface: 'canvas' },
  { id: 'active-member-result', feature: TOUR_FEATURES.canvas, title: '其他推导方案保持不变', description: '当前方案已经变成“线性映射，子空间 → 零空间”；另一种零空间推导仍只需要“线性映射”。端点编辑只作用于当前方案。', prepare: 'open-graph-example-stage-null-space-updated', placement: 'right', surface: 'canvas' },
  { id: 'replacement-intro', feature: TOUR_FEATURES.canvas, title: '在整体和细分视图间切换', description: '“单射”和“满射”共同刻画可逆线性映射。替换功能可以在两个细分条件与“可逆线性映射”这个整体概念之间切换，而不会删除任何内容。', prepare: 'open-graph-example-stage-null-space-updated', placement: 'right', surface: 'canvas' },
  { id: 'select-replacement-points', feature: TOUR_FEATURES.canvas, title: '选择单射和满射', description: '先点击“单射”，再按住 Shift 点击“满射”，把它们选为一组细分条件。', prepare: 'open-graph-example-stage-null-space-updated', shortcut: 'Shift + 点击多选', requires: 'multiple-concepts-selected', autoAdvance: true, placement: 'right', surface: 'canvas' },
  { id: 'replace-select', feature: TOUR_FEATURES.replaceWith, title: '开始建立替换', description: '两个概念已经选中。点击“替换”，然后选择能够代表它们的整体概念。', prepare: 'open-graph-example-and-select-replacement-points', requires: 'replacement-started', autoAdvance: true },
  { id: 'replace-target', feature: TOUR_FEATURES.canvas, title: '选择整体概念', description: '在画布中点击“可逆线性映射”，把它定义为“单射 + 满射”的整体表示。', prepare: 'open-graph-example-and-prepare-replacement', requires: 'replacement-created', placement: 'right', surface: 'canvas' },
  { id: 'toggle-replacement', target: '.replacement-segment', title: '对照整体与细分概念', description: '选择“对照”，同时查看“单射 + 满射”和“可逆线性映射”。所有概念、推导和文档始终保留，只改变当前展示方式。', prepare: 'open-graph-example-with-replacement', requires: 'replacement-compared', placement: 'left' },
] as const;

const NAVIGATION_STEPS: readonly TourStepDefinition[] = [
  {
    id: 'navigation-intro',
    target: 'body',
    title: '进入大型示例项目',
    description: '这个大型 derivon 实例项目是 math-reforged，它依据《线性代数应该这样学（第四版）》，整理成一张非线性的知识图。\n\n接下来，用它体验大型知识图中的搜索、局部查看、移动和缩放。',
    link: {
      href: 'https://github.com/derivon-research/math-reforged',
      label: '查看 Math Reforged 的 GitHub 仓库',
    },
    prepare: 'open-navigation-example',
    placement: 'center',
    surface: 'dialog',
  },
  { id: 'zoom', feature: TOUR_FEATURES.canvas, title: '缩放和浏览大型知识图', description: '使用鼠标滚轮缩放，或在 MacBook 触控板上双指缩放；拖动画布可以浏览不同区域。也可以使用左下角的按钮缩放或适配全图。', prepare: 'open-navigation-example', placement: 'right', surface: 'canvas' },
  { id: 'focus', feature: TOUR_FEATURES.canvas, title: '打开概念或推导的关联视图', description: '概念和推导都可以打开关联视图。连续点击同一个概念或推导两次，就能只看与它关联的概念和推导。选中对象后，也可以使用顶部的局部视图按钮切换。', prepare: 'open-navigation-example', requires: 'focused-view-toggled', placement: 'right', surface: 'canvas' },
  { id: 'search', feature: TOUR_FEATURES.search, title: '按名称定位概念', description: '试试只输入“Hamilton”，再从候选结果中选择“Cayley-Hamilton 定理”。画布会定位到对应概念。', prepare: 'open-navigation-example', shortcut: '↑ ↓ 选择 · Enter 打开', requires: 'concept-found', placement: 'bottom-start' },
  { id: 'move', feature: TOUR_FEATURES.canvas, title: '微调节点位置', description: '拖动任一节点。按住 Shift 可以多选后一起移动；位置只在拖动结束时保存。', prepare: 'open-navigation-example', shortcut: 'Shift + 点击或框选', requires: 'node-moved', placement: 'right', surface: 'canvas' },
  { id: 'delete', feature: TOUR_FEATURES.deleteItem, title: '安全删除对象', description: '选中一个对象并点击删除。阅读确认框中的级联影响，然后确认删除。', prepare: 'open-navigation-example-and-select-concept', requires: 'item-deleted', autoAdvance: true, placement: 'left' },
  { id: 'undo', feature: TOUR_FEATURES.history, title: '撤回画布修改', description: '点击撤回恢复刚删除的对象，并观察它重新出现在图中。', prepare: 'open-navigation-example', shortcut: 'Ctrl/Cmd + Z', requires: 'undo-used' },
  { id: 'redo', feature: TOUR_FEATURES.history, title: '重做画布修改', description: '点击重做再次应用修改。撤回和重做属于画布结构历史，与文档历史相互独立。', prepare: 'open-navigation-example', shortcut: 'Ctrl/Cmd + Shift + Z', requires: 'redo-used' },
] as const;

const WEB_ROUTE_STEPS: readonly TourStepDefinition[] = [
  {
    id: 'download-desktop',
    target: 'body',
    title: '下载 Derivon 本地版',
    description: '路线推导只在本地应用中提供。请下载最新版本继续使用。',
    link: {
      href: 'https://github.com/derivon-research/derivon-mindmap/releases/latest',
      label: '下载最新本地版',
    },
    placement: 'center',
    surface: 'dialog',
  },
] as const;

const NATIVE_ROUTE_STEPS: readonly TourStepDefinition[] = [
  {
    id: 'route-intro',
    target: 'body',
    title: '从已知概念推导学习路线',
    description: '路线功能把你已经掌握的概念作为起点，把想学习的概念作为目标，再根据图中的推导关系和成本寻找合适的学习顺序。接下来使用 Math Reforged 中的真实关系完成一次求解。',
    prepare: 'open-route-example',
    placement: 'center',
    surface: 'dialog',
  },
  {
    id: 'open-route-panel',
    feature: TOUR_FEATURES.routeMode,
    title: '打开路线模式',
    description: '点击路线按钮，打开起点、目标和求解结果面板。',
    prepare: 'open-route-example',
    requires: 'route-mode-opened',
    autoAdvance: true,
  },
  {
    id: 'select-route-start',
    feature: TOUR_FEATURES.routeStart,
    title: '选择已经掌握的概念',
    description: '搜索“线性映射”，在候选结果中勾选它。路线会把这里选择的概念视为你的已有知识。',
    prepare: 'open-route-example-and-open-panel',
    requires: 'route-start-selected',
    placement: 'left',
  },
  {
    id: 'select-route-target',
    feature: TOUR_FEATURES.routeTarget,
    title: '选择想学习的目标',
    description: '搜索“可逆线性映射”，在候选结果中勾选它。路线可以同时计算多个目标，这里先完成一个目标。',
    prepare: 'open-route-example-with-start',
    requires: 'route-target-selected',
    placement: 'left',
  },
  {
    id: 'solve-route',
    feature: TOUR_FEATURES.routeSolve,
    title: '计算学习路线',
    description: '点击“开始求解”。Derivon 会比较可执行的推导组合，并优先寻找总学习成本更低的路线。',
    prepare: 'open-route-example-with-start-and-target',
    requires: 'route-solved',
    placement: 'left',
  },
  {
    id: 'read-route-result',
    feature: TOUR_FEATURES.routeResult,
    title: '阅读推导顺序和总成本',
    description: '画布高亮了本次路线，右侧按执行顺序列出每一步推导。顶部数字是整条路线的总学习成本；修改推导权重后，路线选择也可能随之变化。',
    prepare: 'open-route-example-with-result',
    placement: 'left',
  },
] as const;

const AGENT_STEPS: readonly TourStepDefinition[] = [
  { id: 'agent', target: 'body', title: '安装独立 Agent Skills', description: '在终端运行 npx skills add derivon-research/skills --all -g，即可安装 CLI、Mindmap、教材导入、理解拷打、知识探索和专家建图六类 Skills。应用不会再向项目目录写入或更新 Agent 文件；旧内测项目中的生成文件请确认无个人修改后手动删除。仓库：https://github.com/derivon-research/skills', placement: 'center', surface: 'dialog' },
] as const;

export function createOnboardingTours(nativeRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window): Record<TourId, TourDefinition> {
  return {
    basics: { id: 'basics', title: '第一次创建项目', summary: '项目、概念与概念文档', icon: BookOpen, steps: BASICS_STEPS },
    documents: { id: 'documents', title: '文档工具', summary: '排版、公式、表格、HTML 与历史', icon: FileText, steps: DOCUMENT_STEPS },
    graph: { id: 'graph', title: '理解 Derivon 的基本图模型', summary: '概念、推导、成本与整体/细分视图', icon: GitBranch, steps: GRAPH_STEPS },
    navigation: { id: 'navigation', title: '大型项目导航', summary: '相邻内容、搜索、移动、删除与缩放', icon: Compass, steps: NAVIGATION_STEPS },
    routes: nativeRuntime
      ? { id: 'routes', title: '推导学习路线', summary: '从已有知识到目标概念', icon: Route, steps: NATIVE_ROUTE_STEPS }
      : { id: 'routes', title: '下载 Derivon 本地版', summary: '路线推导仅在本地应用中提供', icon: Route, steps: WEB_ROUTE_STEPS },
    agent: { id: 'agent', title: 'Agent Skills', summary: '从独立仓库安装六类协作能力', icon: BrainCircuit, steps: AGENT_STEPS },
  };
}

export const ONBOARDING_TOURS = createOnboardingTours();

type StoredOnboarding = {
  version: number;
  completedTours: TourId[];
  progress: Partial<Record<TourId, number>>;
};

function readStoredOnboarding(): StoredOnboarding {
  try {
    const value = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) ?? 'null') as Partial<StoredOnboarding> | null;
    if (value?.version === ONBOARDING_VERSION) {
      return {
        version: ONBOARDING_VERSION,
        completedTours: Array.isArray(value.completedTours) ? value.completedTours.filter((id): id is TourId => id in ONBOARDING_TOURS) : [],
        progress: value.progress ?? {},
      };
    }
  } catch {
    // Invalid or old onboarding state starts fresh.
  }
  return { version: ONBOARDING_VERSION, completedTours: [], progress: {} };
}

function writeStoredOnboarding(value: StoredOnboarding): void {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(value));
}

type TooltipContextValue = {
  canContinue: boolean;
  isAutoAdvance: boolean;
  isRecovering: boolean;
  onBack: () => void;
  onContinue: () => void;
  onExit: () => void;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

function TourTooltip({ index, isLastStep, size, step, tooltipProps }: TooltipRenderProps) {
  const context = useContext(TooltipContext);
  if (!context) return null;
  const definition = step.data as TourStepDefinition;

  return (
    <section {...tooltipProps} className="tour-popover" aria-modal="false" aria-label={`操作引导：${definition.title}`} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <span>{index + 1} / {size}</span>
        <button type="button" aria-label="退出当前教程" title="退出当前教程" onClick={context.onExit}><X size={16} /></button>
      </header>
      <div className="tour-content">
        <strong>{definition.title}</strong>
        <p>{definition.description}</p>
        {definition.link && <a className="tour-link" href={definition.link.href} target="_blank" rel="noreferrer">{definition.link.label}</a>}
        {definition.shortcut && <kbd>{definition.shortcut}</kbd>}
      </div>
      <footer>
        <button type="button" className="tour-back" disabled={index === 0} onClick={context.onBack}>上一步</button>
        <button type="button" className="tour-exit" onClick={context.onExit}>退出并保留进度</button>
        <button type="button" className="tour-next" disabled={!context.canContinue} onClick={context.onContinue}>
          {context.isRecovering ? '请返回教学区域' : context.isAutoAdvance && !context.canContinue ? '请完成当前操作' : !context.canContinue ? '完成操作后继续' : isLastStep ? '完成教程' : '下一步'}
        </button>
      </footer>
    </section>
  );
}

function TourMenu({ completedTours, onClose, onSelect }: { completedTours: readonly TourId[]; onClose: () => void; onSelect: (id: TourId) => void }) {
  return (
    <div className="onboarding-menu-backdrop" role="presentation">
      <section className="onboarding-menu" role="dialog" aria-modal="true" aria-labelledby="onboarding-menu-title">
        <header>
          <div><span className="eyebrow">Derivon Guide</span><strong id="onboarding-menu-title">选择一个小教程</strong></div>
          <button type="button" title="关闭操作引导" aria-label="关闭操作引导" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="onboarding-tour-list">
          {(Object.values(ONBOARDING_TOURS) as TourDefinition[]).map((tour) => {
            const Icon = tour.icon;
            const complete = completedTours.includes(tour.id);
            return (
              <button type="button" key={tour.id} onClick={() => onSelect(tour.id)}>
                <Icon size={18} />
                <span><strong>{tour.title}</strong><small>{tour.summary}</small></span>
                <em>{complete ? '已完成' : `${tour.steps.length} 步`}</em>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function GuidedTour({ open, startTour, currentSurface, onClose, onTourStart, onTourEnd, onStepComplete, onPrepareStep }: {
  open: boolean;
  startTour: TourId | null;
  currentSurface: TourCurrentSurface;
  onClose: () => void;
  onTourStart?: (tourId: TourId) => void;
  onTourEnd?: (tourId: TourId) => void;
  onStepComplete?: (tourId: TourId, stepId: TourStepId) => void;
  onPrepareStep?: (preparation: TourPreparation, stepId: TourStepId) => void | Promise<void>;
}) {
  const [stored, setStored] = useState(readStoredOnboarding);
  const [activeTourId, setActiveTourId] = useState<TourId | null>(null);
  const [index, setIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [actionSatisfied, setActionSatisfied] = useState(false);
  const [targetMissing, setTargetMissing] = useState(false);
  const [completedTargetFallback, setCompletedTargetFallback] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [preparedStepKey, setPreparedStepKey] = useState<string | null>(null);
  const startedTour = useRef<TourId | null>(null);
  const completedActionStep = useRef<string | null>(null);
  const autoAdvanceTimer = useRef<number | null>(null);
  const activeTour = activeTourId ? ONBOARDING_TOURS[activeTourId] : null;
  const definition = activeTour?.steps[index] ?? null;
  const stepAlreadyCompleted = index < furthestIndex;
  const currentStepKey = activeTourId && definition ? `${activeTourId}:${definition.id}` : null;
  const stepExpectedSurface = definition ? expectedSurface(definition) : null;
  const isRecovering = !!(
    currentStepKey
    && preparedStepKey === currentStepKey
    && stepExpectedSurface
    && stepExpectedSurface !== currentSurface
    && !stepAlreadyCompleted
    && !(definition?.autoAdvance && actionSatisfied)
  );

  const saveProgress = useCallback((tourId: TourId, nextIndex: number, complete = false) => {
    setStored((current) => {
      const next: StoredOnboarding = {
        ...current,
        completedTours: complete && !current.completedTours.includes(tourId) ? [...current.completedTours, tourId] : current.completedTours,
        progress: { ...current.progress, [tourId]: complete ? 0 : nextIndex },
      };
      writeStoredOnboarding(next);
      return next;
    });
  }, []);

  const beginTour = useCallback((tourId: TourId) => {
    const complete = stored.completedTours.includes(tourId);
    const savedIndex = complete ? 0 : stored.progress[tourId] ?? 0;
    const maxIndex = ONBOARDING_TOURS[tourId].steps.length - 1;
    const initialIndex = Math.max(0, Math.min(savedIndex, maxIndex));
    setIndex(initialIndex);
    setFurthestIndex(initialIndex);
    setActionSatisfied(false);
    setTargetMissing(false);
    setCompletedTargetFallback(false);
    setPreparedStepKey(null);
    setActiveTourId(tourId);
  }, [stored.completedTours, stored.progress]);

  useEffect(() => {
    if (!open) {
      setActiveTourId(null);
      startedTour.current = null;
      return;
    }
    if (startTour) beginTour(startTour);
  }, [beginTour, open, startTour]);

  useEffect(() => {
    if (!activeTourId || startedTour.current === activeTourId) return;
    startedTour.current = activeTourId;
    onTourStart?.(activeTourId);
  }, [activeTourId, onTourStart]);

  useEffect(() => {
    completedActionStep.current = null;
    setActionSatisfied(stepAlreadyCompleted || !definition?.requires);
    setTargetMissing(false);
    setCompletedTargetFallback(false);
  }, [activeTourId, definition?.id, definition?.requires, index, stepAlreadyCompleted]);

  const finishTour = useCallback(() => {
    if (!activeTourId) return;
    saveProgress(activeTourId, 0, true);
    onTourEnd?.(activeTourId);
    startedTour.current = null;
    setActiveTourId(null);
    setIndex(0);
  }, [activeTourId, onTourEnd, saveProgress]);

  const advance = useCallback(() => {
    if (!activeTour || !activeTourId) return;
    if (index >= activeTour.steps.length - 1) {
      finishTour();
      return;
    }
    const nextIndex = index + 1;
    saveProgress(activeTourId, nextIndex);
    setFurthestIndex((current) => Math.max(current, nextIndex));
    setIndex(nextIndex);
  }, [activeTour, activeTourId, finishTour, index, saveProgress]);

  const continueStep = useCallback(() => {
    if (autoAdvanceTimer.current !== null) {
      window.clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    advance();
  }, [advance]);

  useEffect(() => () => {
    if (autoAdvanceTimer.current !== null) {
      window.clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }, [activeTourId, index]);

  const back = useCallback(() => {
    if (!activeTourId || index === 0) return;
    const nextIndex = index - 1;
    saveProgress(activeTourId, nextIndex);
    setIndex(nextIndex);
  }, [activeTourId, index, saveProgress]);

  const exitTour = useCallback(() => {
    if (!activeTourId) return;
    saveProgress(activeTourId, index);
    onTourEnd?.(activeTourId);
    startedTour.current = null;
    setActiveTourId(null);
  }, [activeTourId, index, onTourEnd, saveProgress]);

  const closeAll = useCallback(() => {
    if (activeTourId) {
      saveProgress(activeTourId, index);
      onTourEnd?.(activeTourId);
    }
    startedTour.current = null;
    setActiveTourId(null);
    onClose();
  }, [activeTourId, index, onClose, onTourEnd, saveProgress]);

  useEffect(() => subscribeTourActions((action) => {
    if (isRecovering) return;
    if (!activeTourId || !definition?.requires || definition.requires !== action) return;
    setActionSatisfied(true);
    if (completedActionStep.current !== currentStepKey) {
      completedActionStep.current = currentStepKey;
      onStepComplete?.(activeTourId, definition.id);
    }
    if (definition.autoAdvance) {
      if (autoAdvanceTimer.current !== null) window.clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = window.setTimeout(() => {
        autoAdvanceTimer.current = null;
        advance();
      }, 350);
    }
  }), [activeTourId, advance, currentStepKey, definition, isRecovering, onStepComplete]);

  const joyrideSteps = useMemo<Step[]>(() => activeTour?.steps.map((stepDefinition) => {
    const stepKey = `${activeTour.id}:${stepDefinition.id}`;
    const renderedDefinition = stepKey === currentStepKey
      ? completedTargetFallback
        ? completedStepFallback(stepDefinition)
        : isRecovering
          ? recoveryStep(currentSurface)
          : stepDefinition
      : stepDefinition;
    const target = renderedDefinition.target ?? `[data-tour-feature="${renderedDefinition.feature?.id}"]`;
    const isDialog = renderedDefinition.surface === 'dialog';
    return {
      id: renderedDefinition.id,
      target,
      spotlightTarget: isDialog ? () => null : undefined,
      title: renderedDefinition.title,
      content: renderedDefinition.description,
      data: renderedDefinition,
      placement: renderedDefinition.placement ?? 'bottom',
      skipBeacon: true,
      blockTargetInteraction: false,
      disableFocusTrap: true,
      dismissKeyAction: false,
      overlayClickAction: false,
      spotlightPadding: renderedDefinition.surface === 'canvas' || renderedDefinition.surface === 'editor' ? 0 : 6,
      spotlightRadius: 3,
      targetWaitTimeout: 1500,
      beforeTimeout: 3000,
      before: renderedDefinition.prepare ? async () => {
        await onPrepareStep?.(renderedDefinition.prepare!, renderedDefinition.id);
        setPreparedStepKey(stepKey);
      } : undefined,
    };
  }) ?? [], [activeTour, completedTargetFallback, currentStepKey, currentSurface, isRecovering, onPrepareStep]);

  const handleJoyrideEvent = useCallback((event: EventData) => {
    if (event.type !== EVENTS.TARGET_NOT_FOUND) return;
    if (stepAlreadyCompleted || actionSatisfied) {
      setCompletedTargetFallback(true);
      setTargetMissing(false);
      return;
    }
    setTargetMissing(true);
  }, [actionSatisfied, stepAlreadyCompleted]);

  if (!open) return null;
  if (!activeTour || !definition) return <TourMenu completedTours={stored.completedTours} onClose={closeAll} onSelect={beginTour} />;

  const tooltipContext: TooltipContextValue = {
    canContinue: !isRecovering && (stepAlreadyCompleted || !definition.requires || actionSatisfied),
    isAutoAdvance: !isRecovering && !!definition.autoAdvance,
    isRecovering,
    onBack: back,
    onContinue: continueStep,
    onExit: exitTour,
  };

  return (
    <TooltipContext.Provider value={tooltipContext}>
      <Joyride
        key={`${activeTourId}:${index}:${completedTargetFallback ? 'completed' : isRecovering ? currentSurface : 'step'}:${retryKey}`}
        run
        continuous
        stepIndex={index}
        steps={joyrideSteps}
        tooltipComponent={TourTooltip}
        onEvent={handleJoyrideEvent}
        floatingOptions={{
          strategy: 'fixed',
          flipOptions: { boundary: document.documentElement, rootBoundary: 'viewport', crossAxis: true, padding: 12 },
          shiftOptions: { boundary: document.documentElement, rootBoundary: 'viewport', crossAxis: true, padding: 12 },
        }}
        options={{ zIndex: 90, overlayColor: 'rgba(29, 34, 31, 0.58)', primaryColor: '#2f6d4f', scrollDuration: 240, scrollOffset: 16, width: 320 }}
        styles={{
          floater: { maxWidth: 'calc(100vw - 24px)', userSelect: 'none' },
          tooltip: { width: 'min(320px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', padding: 0, backgroundColor: 'transparent', boxShadow: 'none' },
        }}
      />
      {targetMissing && (
        <section className="onboarding-target-error" role="alert">
          <strong>当前界面没有找到教学目标</strong>
          <p>可以重试当前步骤，或跳过它继续教程。你的进度已经保存。</p>
          <div>
            <button type="button" onClick={exitTour}>返回教程列表</button>
            <button type="button" onClick={() => { setTargetMissing(false); setRetryKey((value) => value + 1); }}>重试</button>
            <button type="button" onClick={advance}>跳过此步</button>
          </div>
        </section>
      )}
    </TooltipContext.Provider>
  );
}
