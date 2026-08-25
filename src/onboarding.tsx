import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const ONBOARDING_STORAGE_KEY = 'derivon.onboarding/v1';

export const TOUR_FEATURES = {
  newWorkspace: { id: 'new-workspace', label: '在新文件夹创建空项目' },
  projectTitle: { id: 'project-title', label: '项目标题' },
  projectDescription: { id: 'project-description', label: '项目说明' },
  addConcept: { id: 'add-concept', label: '新建概念' },
  conceptName: { id: 'concept-name', label: '概念名称' },
  openDocument: { id: 'open-document', label: '编辑文档' },
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
  replaceWith: { id: 'replace-with', label: 'Replace with' },
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
  | 'focused-view-toggled'
  | 'replacement-started'
  | 'replacement-created'
  | 'replacement-toggled'
  | 'concept-found'
  | 'node-moved'
  | 'item-deleted'
  | 'undo-used'
  | 'redo-used'
  | 'json-opened'
  | 'json-applied';

export function tourTarget(feature: TourFeature): { 'data-tour-feature': string } {
  return { 'data-tour-feature': feature.id };
}

export function notifyTourAction(action: TourAction): void {
  window.dispatchEvent(new CustomEvent('derivon:tour-action', { detail: { action } }));
}

type TourStep = {
  id: string;
  feature: TourFeature;
  title: string;
  description: string;
  shortcut?: string;
  advanceOn?: TourAction;
  target?: string;
};

export const ONBOARDING_STEPS: readonly TourStep[] = [
  {
    id: 'workspace',
    feature: TOUR_FEATURES.newWorkspace,
    title: '新建项目文件夹',
    description: '点击高亮按钮，选择或创建一个空文件夹。项目、对象文档和 derivon-workspace Skill 会写入该目录，并在后续编辑时自动保存。请使用 Chromium 系浏览器。',
    advanceOn: 'workspace-created',
  },
  {
    id: 'title',
    feature: TOUR_FEATURES.projectTitle,
    title: '命名示例项目',
    description: '把项目标题改为“A + B → X”，然后按 Enter。标题属于工作区元数据，会与图结构一起保存。',
    shortcut: 'Enter 确认',
    advanceOn: 'project-title-edited',
  },
  {
    id: 'description',
    feature: TOUR_FEATURES.projectDescription,
    title: '补充项目说明',
    description: '在右侧填写这个项目的目标或适用范围，完成后按 Ctrl/Cmd + Enter。未选中对象时，这里显示项目级信息和统计。',
    shortcut: 'Ctrl/Cmd + Enter 确认',
    advanceOn: 'project-description-edited',
  },
  {
    id: 'add-a',
    feature: TOUR_FEATURES.addConcept,
    title: '新建第一个概念',
    description: '点击加号创建概念。应用会同时创建该概念独占的 Markdown 源文件和 HTML 访问入口。',
    advanceOn: 'concept-added',
  },
  {
    id: 'name-a',
    feature: TOUR_FEATURES.conceptName,
    title: '命名概念 A',
    description: '把“新概念”改为“A”，然后按 Enter。画布标签和对象文档标题会分别维护。',
    shortcut: 'Enter 确认',
    advanceOn: 'concept-renamed',
  },
  {
    id: 'open-concept-document',
    feature: TOUR_FEATURES.openDocument,
    title: '打开概念文档',
    description: '每个概念和推导都有自己的文档。点击“编辑文档”进入 A 的 Markdown 编辑器；双击画布节点也能直接打开。',
    shortcut: '双击节点也可打开',
    advanceOn: 'document-opened',
  },
  {
    id: 'author-document',
    feature: TOUR_FEATURES.documentBody,
    title: '编写概念定义',
    description: '修改正文，写下 A 的定义或示例。输入“# ”可立即创建标题；Markdown 会自动同步生成 index.html。',
    shortcut: 'Ctrl/Cmd + B 粗体 · Ctrl/Cmd + I 斜体',
    advanceOn: 'document-edited',
  },
  {
    id: 'format-document',
    feature: TOUR_FEATURES.documentFormat,
    title: '使用排版工具',
    description: '选择一段文字后尝试粗体、斜体、引用、列表、链接或代码。工具栏状态直接绑定 Tiptap 命令，不依赖引导实现。',
    shortcut: 'Ctrl/Cmd + B · Ctrl/Cmd + I',
    advanceOn: 'document-formatted',
  },
  {
    id: 'insert-formula',
    feature: TOUR_FEATURES.insertFormula,
    title: '插入 KaTeX 公式',
    description: '插入行内或块级公式。也可以直接输入 $E = mc^2$ 或 $$...$$；点击渲染后的公式可继续编辑 LaTeX 源码。',
    shortcut: '$...$ 行内 · $$...$$ 块级',
    advanceOn: 'formula-inserted',
  },
  {
    id: 'insert-table',
    feature: TOUR_FEATURES.insertTable,
    title: '插入结构化表格',
    description: '点击表格按钮插入 3×3 表格。它和标题、列表、分隔线都保存在同一份 Markdown 文档中。',
    advanceOn: 'table-inserted',
  },
  {
    id: 'insert-html',
    feature: TOUR_FEATURES.insertHtml,
    title: '插入交互内容',
    description: '插入 HTML 交互示例。插入后可在源码和隔离预览间切换，并自由修改 HTML、CSS 与 JavaScript。',
    advanceOn: 'html-inserted',
  },
  {
    id: 'editor-history',
    feature: TOUR_FEATURES.editorHistory,
    title: '撤回文档修改',
    description: '使用编辑器自己的撤回或重做。文档历史和画布结构历史相互独立，避免正文操作误改图。',
    shortcut: 'Ctrl/Cmd + Z · Ctrl/Cmd + Shift + Z',
    advanceOn: 'editor-history-used',
  },
  {
    id: 'return-canvas',
    feature: TOUR_FEATURES.returnCanvas,
    title: '返回图画布',
    description: '点击返回按钮继续构建关系。右侧仍会保留刚才编辑对象的上下文。',
    advanceOn: 'canvas-returned',
  },
  {
    id: 'add-b',
    feature: TOUR_FEATURES.addConcept,
    title: '新建概念 B',
    description: '再次点击加号创建第二个概念，随后在右侧把它命名为“B”并按 Enter。',
    advanceOn: 'concept-added',
  },
  {
    id: 'name-b',
    feature: TOUR_FEATURES.conceptName,
    title: '命名概念 B',
    description: '把当前概念命名为“B”，然后按 Enter。',
    shortcut: 'Enter 确认',
    advanceOn: 'concept-renamed',
  },
  {
    id: 'add-x',
    feature: TOUR_FEATURES.addConcept,
    title: '新建替换概念 X',
    description: '再创建一个概念，稍后用它表示 A 与 B 的折叠视图。',
    advanceOn: 'concept-added',
  },
  {
    id: 'name-x',
    feature: TOUR_FEATURES.conceptName,
    title: '命名概念 X',
    description: '把当前概念命名为“X”，然后按 Enter。',
    shortcut: 'Enter 确认',
    advanceOn: 'concept-renamed',
  },
  {
    id: 'layout',
    feature: TOUR_FEATURES.autoLayout,
    title: '整理画布',
    description: '点击自动布局，让新建概念获得稳定间距。你仍可以拖动单个或多个节点微调，总览位置会写入 manifest。',
    advanceOn: 'layout-applied',
  },
  {
    id: 'connect',
    feature: TOUR_FEATURES.canvas,
    title: '创建推导 A → B',
    description: '从 A 右侧连接点拖到 B 左侧连接点。概念到概念的连线会创建一条单前提推导，而不是普通边。',
    advanceOn: 'derivation-created',
  },
  {
    id: 'parallel',
    feature: TOUR_FEATURES.canvas,
    title: '创建平行推导',
    description: '再从 A 拖到 B 一次。相同前提和结论的推导保持为独立文档，并在画布上堆叠为可切换的路径组。',
    advanceOn: 'derivation-created',
  },
  {
    id: 'parallel-select',
    feature: TOUR_FEATURES.derivationAlternatives,
    title: '切换实现方式',
    description: '点击推导上的路径数量，或在右侧下拉菜单中切换实现。每种方式可有独立成本和论证文档。',
    advanceOn: 'derivation-selected',
  },
  {
    id: 'weight',
    feature: TOUR_FEATURES.derivationWeight,
    title: '设置推导成本',
    description: '修改当前推导的非负成本，可保留两位小数，然后按 Enter。较低成本的平行实现会优先显示。',
    shortcut: 'Enter 确认',
    advanceOn: 'derivation-weight-edited',
  },
  {
    id: 'more-premises',
    feature: TOUR_FEATURES.canvas,
    title: '追加前提或修改结论',
    description: '把 X 的右侧连接点拖到当前推导可追加前提；从推导拖到概念可修改结论。先完成任意一种操作。右侧标签上的 × 可移除前提。',
    advanceOn: 'derivation-updated',
  },
  {
    id: 'replace-select',
    feature: TOUR_FEATURES.replaceWith,
    title: '选择要折叠的点集',
    description: '按住 Shift 选择 A 和 B，再点击当前高亮的 Replace with。按钮会在至少选中一个概念后启用。',
    shortcut: 'Shift + 点击多选',
    advanceOn: 'replacement-started',
  },
  {
    id: 'replace-target',
    feature: TOUR_FEATURES.canvas,
    title: '选择替换概念 X',
    description: '点击 X 作为替换点。该操作只创建视图替换关系，不删除原概念、推导或文档。',
    advanceOn: 'replacement-created',
  },
  {
    id: 'toggle-replacement',
    feature: TOUR_FEATURES.replacementToggle,
    title: '切换点集与替换视图',
    description: '点击节点中的替换标签，在 A+B 点集和 X 替换点之间切换。画布只投影当前可见点诱导出的子图。',
    advanceOn: 'replacement-toggled',
  },
  {
    id: 'focus',
    feature: TOUR_FEATURES.focusedView,
    title: '查看一跳邻域',
    description: '先选中一个节点，再点击局部视图按钮；再次点击同一节点也可进入。非邻域对象会淡出，局部布局仅保留在当前会话。',
    shortcut: '连续点击同一节点两次',
    advanceOn: 'focused-view-toggled',
  },
  {
    id: 'search',
    feature: TOUR_FEATURES.search,
    title: '定位概念',
    description: '按 ID 或名称搜索概念并按 Enter。搜索会展开包含目标的替换关系，并把画布定位到结果。',
    shortcut: 'Enter 搜索',
    advanceOn: 'concept-found',
  },
  {
    id: 'move',
    feature: TOUR_FEATURES.canvas,
    title: '调整节点位置',
    description: '拖动任一节点。按住 Shift 可点选或框选多个节点后一起移动；位置只在拖动结束时保存。',
    shortcut: 'Shift + 点击/框选多选',
    advanceOn: 'node-moved',
  },
  {
    id: 'delete',
    feature: TOUR_FEATURES.deleteItem,
    title: '安全删除对象',
    description: '选中对象后点击删除并确认。删除概念会明确列出级联删除的推导，下一步可以立即撤回。',
    advanceOn: 'item-deleted',
  },
  {
    id: 'undo',
    feature: TOUR_FEATURES.history,
    title: '撤回画布修改',
    description: '点击撤回恢复刚删除的对象。画布历史最多保留 100 次结构修改。',
    shortcut: 'Ctrl/Cmd + Z',
    advanceOn: 'undo-used',
  },
  {
    id: 'redo',
    feature: TOUR_FEATURES.history,
    title: '重做画布修改',
    description: '点击重做，再次应用撤回的修改；也可以跳过此步，保留刚恢复的示例。',
    shortcut: 'Ctrl/Cmd + Shift + Z',
    advanceOn: 'redo-used',
  },
  {
    id: 'restore-after-redo',
    feature: TOUR_FEATURES.history,
    title: '恢复示例项目',
    description: '再次撤回刚才的重做，让被删除对象回到示例项目中。完成后可以继续检查底层数据。',
    shortcut: 'Ctrl/Cmd + Z',
    advanceOn: 'undo-used',
  },
  {
    id: 'zoom',
    feature: TOUR_FEATURES.zoom,
    title: '缩放和浏览全图',
    description: '左下角控件用于放大、缩小和适配视图；右下角小地图支持拖动与缩放。滚轮和触控板也可直接浏览。',
  },
  {
    id: 'json',
    feature: TOUR_FEATURES.workspaceJson,
    title: '检查底层 Manifest',
    description: '打开工作区 JSON。这里可以检查或批量编辑 point、hyperedge、位置和替换关系；应用前会执行 schema 校验。相邻上传按钮可迁移旧版 JSON。',
    advanceOn: 'json-opened',
  },
  {
    id: 'json-apply',
    feature: TOUR_FEATURES.jsonEditor,
    title: '格式化并应用 JSON',
    description: '可先格式化，再点击“检查并应用”。无效 ID、关系、权重或文档目录会被拒绝。',
    advanceOn: 'json-applied',
  },
  {
    id: 'agent',
    feature: TOUR_FEATURES.openWorkspace,
    title: '继续使用 Agent 编辑',
    description: '项目已包含 derivon-workspace Skill。现在可以让 Agent 打开项目文件夹，读取 SKILL.md 和模型参考，协助新增概念、审阅推导、编辑 Markdown、KaTeX 或 HTML。此按钮也可随时打开另一个已有工作区。',
  },
] as const;

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number };

function useTargetRect(selector: string, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    let observedElement: HTMLElement | null = null;
    const resizeObserver = new ResizeObserver(() => scheduleUpdate());
    const measure = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element !== observedElement) {
        resizeObserver.disconnect();
        observedElement = element;
        if (element) {
          element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          resizeObserver.observe(element);
        }
      }
      if (!element) {
        setRect(null);
        return;
      }
      const next = element.getBoundingClientRect();
      const measured = { top: next.top, left: next.left, right: next.right, bottom: next.bottom, width: next.width, height: next.height };
      setRect((current) => current
        && current.top === measured.top
        && current.left === measured.left
        && current.width === measured.width
        && current.height === measured.height
        ? current
        : measured);
    };
    function scheduleUpdate() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    }
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [active, selector]);

  return rect;
}

function popoverPosition(target: Rect | null, popover: DOMRect | null): CSSProperties {
  if (!target || !popover) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const gap = 14;
  const margin = 12;
  const width = popover.width;
  const height = popover.height;
  const clampX = (value: number) => Math.max(margin, Math.min(value, window.innerWidth - width - margin));
  const clampY = (value: number) => Math.max(margin, Math.min(value, window.innerHeight - height - margin));

  if (window.innerHeight - target.bottom >= height + gap) return { left: clampX(target.left + target.width / 2 - width / 2), top: target.bottom + gap };
  if (target.top >= height + gap) return { left: clampX(target.left + target.width / 2 - width / 2), top: target.top - height - gap };
  if (window.innerWidth - target.right >= width + gap) return { left: target.right + gap, top: clampY(target.top + target.height / 2 - height / 2) };
  return { left: Math.max(margin, target.left - width - gap), top: clampY(target.top + target.height / 2 - height / 2) };
}

export function GuidedTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const advancing = useRef(false);
  const step = ONBOARDING_STEPS[index];
  const selector = step.target ?? `[data-tour-feature="${step.feature.id}"]`;
  const targetRect = useTargetRect(selector, open);

  const finish = useCallback(() => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'complete');
    onClose();
  }, [onClose]);

  const next = useCallback(() => {
    if (index >= ONBOARDING_STEPS.length - 1) finish();
    else setIndex((current) => current + 1);
  }, [finish, index]);

  useEffect(() => {
    if (!open) return;
    advancing.current = false;
    const handleAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: TourAction }>).detail?.action;
      if (step.advanceOn && action === step.advanceOn && !advancing.current) {
        advancing.current = true;
        window.setTimeout(next, 80);
      }
    };
    window.addEventListener('derivon:tour-action', handleAction);
    return () => window.removeEventListener('derivon:tour-action', handleAction);
  }, [next, open, step.advanceOn]);

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;
    setPopoverRect(popoverRef.current.getBoundingClientRect());
  }, [index, open, targetRect]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (!open) return null;
  const padding = 6;
  const hole = targetRect ? {
    top: Math.max(0, targetRect.top - padding),
    left: Math.max(0, targetRect.left - padding),
    right: Math.min(window.innerWidth, targetRect.right + padding),
    bottom: Math.min(window.innerHeight, targetRect.bottom + padding),
  } : null;

  return createPortal(
    <div className="guided-tour" aria-live="polite">
      {hole ? (
        <>
          <div className="tour-mask" style={{ left: 0, top: 0, right: 0, height: hole.top }} />
          <div className="tour-mask" style={{ left: 0, top: hole.top, width: hole.left, height: hole.bottom - hole.top }} />
          <div className="tour-mask" style={{ left: hole.right, top: hole.top, right: 0, height: hole.bottom - hole.top }} />
          <div className="tour-mask" style={{ left: 0, top: hole.bottom, right: 0, bottom: 0 }} />
          <div className="tour-highlight" style={{ left: hole.left, top: hole.top, width: hole.right - hole.left, height: hole.bottom - hole.top }} />
        </>
      ) : <div className="tour-mask tour-mask-full" />}
      <section
        ref={popoverRef}
        className="tour-popover"
        role="dialog"
        aria-modal="false"
        aria-label={`操作引导：${step.title}`}
        style={popoverPosition(targetRect, popoverRect)}
      >
        <header>
          <span>{index + 1} / {ONBOARDING_STEPS.length}</span>
          <button type="button" aria-label="退出操作引导" title="退出操作引导" onClick={finish}><X size={16} /></button>
        </header>
        <strong>{step.title}</strong>
        <p>{step.description}</p>
        {step.shortcut && <kbd>{step.shortcut}</kbd>}
        <footer>
          <button type="button" className="tour-exit" onClick={finish}>跳过引导</button>
          <button type="button" className="tour-next" onClick={next}>
            {index === ONBOARDING_STEPS.length - 1 ? '完成' : '下一步'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
