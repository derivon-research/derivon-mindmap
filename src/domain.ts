export const DOCUMENT_SCHEMA = 'derivon.authoring/v0.3.0' as const;
export const PREVIOUS_DOCUMENT_SCHEMA = 'derivon.authoring/v0.2.0' as const;
export const WEIGHT_DECIMAL_PLACES = 1;
const WEIGHT_SCALE = 10 ** WEIGHT_DECIMAL_PLACES;

export function normalizeWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((Math.max(0, value) + Number.EPSILON) * WEIGHT_SCALE) / WEIGHT_SCALE;
}

export function formatWeight(value: number): string {
  return value.toFixed(WEIGHT_DECIMAL_PLACES);
}

export function isValidWeight(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false;
  const scaled = Math.round(value * WEIGHT_SCALE);
  return Number.isSafeInteger(scaled) && Math.abs(value - scaled / WEIGHT_SCALE) < 1e-10;
}

export type Position = { x: number; y: number };

export type DocumentFormat = 'markdown' | 'html';

export type DocumentReference = {
  document: string;
  format: DocumentFormat;
};

export type Point = {
  id: string;
  data: DocumentReference & {
    label: string;
  };
};

export type Hyperedge = {
  id: string;
  weight: number;
  tails: string[];
  head: string;
  data: DocumentReference;
};

export type ViewReplacement = {
  points: string[];
  replaceWith: string;
  show: 'points' | 'replacement';
};

export type AuthoringDocument = {
  schema: typeof DOCUMENT_SCHEMA;
  document: {
    title: string;
    description: string;
  };
  graph: {
    points: Point[];
    hyperedges: Hyperedge[];
  };
  view: {
    replacements: ViewReplacement[];
  };
};

export type ParsedDocument = {
  document: AuthoringDocument;
};

export type DocumentIssue = { path: string; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function reportUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: DocumentIssue[],
) {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) issues.push({ path: `${path}.${key}`, message: '不允许出现在数学模型外层，请移入 data' });
  });
}

export function isDocumentDirectory(value: unknown): value is string {
  if (typeof value !== 'string' || value.startsWith('/') || value.endsWith('/') || value.includes('\\') || /\.(md|html)$/i.test(value)) return false;
  const parts = value.split('/');
  return parts.length > 1
    && parts[0] !== '.derivon'
    && parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function validateCurrentDocument(value: unknown): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '文档必须是 JSON 对象' }];
  if (value.schema !== DOCUMENT_SCHEMA) issues.push({ path: 'schema', message: `必须为 ${DOCUMENT_SCHEMA}` });
  if (!isRecord(value.document)) issues.push({ path: 'document', message: '缺少文档元数据' });
  else {
    Object.keys(value.document).forEach((key) => {
      if (key !== 'title' && key !== 'description') {
        issues.push({ path: `document.${key}`, message: '不属于共享语义元数据；时间由文件系统维护' });
      }
    });
    if (typeof value.document.title !== 'string') issues.push({ path: 'document.title', message: '必须是字符串' });
    if (typeof value.document.description !== 'string') issues.push({ path: 'document.description', message: '必须是字符串' });
  }
  if (!isRecord(value.graph)) return [...issues, { path: 'graph', message: '缺少图数据' }];

  reportUnknownKeys(value.graph, new Set(['points', 'hyperedges']), 'graph', issues);
  const points = value.graph.points;
  const hyperedges = value.graph.hyperedges;
  if (!Array.isArray(points)) return [...issues, { path: 'graph.points', message: '必须是数组' }];
  if (!Array.isArray(hyperedges)) return [...issues, { path: 'graph.hyperedges', message: '必须是数组' }];

  const pointIds = new Set<string>();
  const documentOwner = new Map<string, string>();
  const validateDocumentReference = (data: Record<string, unknown>, path: string, owner: string) => {
    if (!isDocumentDirectory(data.document)) {
      issues.push({ path: `${path}.document`, message: '必须是工作区内的文档目录相对路径' });
      return;
    }
    if (data.format !== 'markdown' && data.format !== 'html') {
      issues.push({ path: `${path}.format`, message: '必须为 markdown 或 html' });
    }
    const existingOwner = documentOwner.get(data.document);
    if (existingOwner) issues.push({ path: `${path}.document`, message: `${data.document} 已由 ${existingOwner} 拥有` });
    else documentOwner.set(data.document, owner);
  };

  points.forEach((point, index) => {
    const path = `graph.points[${index}]`;
    if (!isRecord(point)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }
    reportUnknownKeys(point, new Set(['id', 'data']), path, issues);
    if (typeof point.id !== 'string' || !point.id.trim()) issues.push({ path: `${path}.id`, message: '需要非空字符串' });
    else if (pointIds.has(point.id)) issues.push({ path: `${path}.id`, message: '点 ID 重复' });
    else pointIds.add(point.id);
    if (!isRecord(point.data)) issues.push({ path: `${path}.data`, message: '必须是对象' });
    else {
      if (typeof point.data.label !== 'string') issues.push({ path: `${path}.data.label`, message: '必须是字符串' });
      validateDocumentReference(point.data, `${path}.data`, `点 ${String(point.id)}`);
    }
  });

  const hyperedgeIds = new Set<string>();
  hyperedges.forEach((hyperedge, index) => {
    const path = `graph.hyperedges[${index}]`;
    if (!isRecord(hyperedge)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }
    reportUnknownKeys(hyperedge, new Set(['id', 'weight', 'tails', 'head', 'data']), path, issues);
    if (typeof hyperedge.id !== 'string' || !hyperedge.id.trim()) issues.push({ path: `${path}.id`, message: '需要非空字符串' });
    else if (pointIds.has(hyperedge.id)) issues.push({ path: `${path}.id`, message: '超边 ID 不能与点 ID 相同' });
    else if (hyperedgeIds.has(hyperedge.id)) issues.push({ path: `${path}.id`, message: '超边 ID 重复' });
    else hyperedgeIds.add(hyperedge.id);
    if (!Array.isArray(hyperedge.tails)) issues.push({ path: `${path}.tails`, message: '必须是数组' });
    else {
      if (new Set(hyperedge.tails).size !== hyperedge.tails.length) issues.push({ path: `${path}.tails`, message: '尾部不能重复' });
      hyperedge.tails.forEach((id) => {
        if (typeof id !== 'string' || !pointIds.has(id)) issues.push({ path: `${path}.tails`, message: `引用了未知点 ${String(id)}` });
      });
    }
    if (typeof hyperedge.head !== 'string' || !pointIds.has(hyperedge.head)) issues.push({ path: `${path}.head`, message: '头部必须引用已有点' });
    if (!isValidWeight(hyperedge.weight)) issues.push({ path: `${path}.weight`, message: '必须是非负且最多保留一位小数的有限数值' });
    if (!isRecord(hyperedge.data)) issues.push({ path: `${path}.data`, message: '必须是对象' });
    else validateDocumentReference(hyperedge.data, `${path}.data`, `超边 ${String(hyperedge.id)}`);
  });

  if (!isRecord(value.view)) {
    issues.push({ path: 'view', message: '缺少共享视图数据' });
    return issues;
  }
  Object.keys(value.view).forEach((key) => {
    if (key !== 'replacements') {
      issues.push({ path: `view.${key}`, message: '不属于共享视图；坐标由运行时自动布局计算，不应写入 JSON' });
    }
  });

  if (!Array.isArray(value.view.replacements)) {
    issues.push({ path: 'view.replacements', message: '必须是数组' });
    return issues;
  }

  const replacementTargets = new Set<string>();
  const ownerByPoint = new Map<string, string>();
  value.view.replacements.forEach((replacement, index) => {
    const path = `view.replacements[${index}]`;
    if (!isRecord(replacement)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }
    if (typeof replacement.replaceWith !== 'string' || !pointIds.has(replacement.replaceWith)) {
      issues.push({ path: `${path}.replaceWith`, message: '替换点必须引用已有点' });
    } else if (replacementTargets.has(replacement.replaceWith)) {
      issues.push({ path: `${path}.replaceWith`, message: '一个点只能作为一条替换关系的结果' });
    } else replacementTargets.add(replacement.replaceWith);
    if (!Array.isArray(replacement.points) || replacement.points.length === 0) {
      issues.push({ path: `${path}.points`, message: '点集至少需要一个点' });
    } else {
      if (new Set(replacement.points).size !== replacement.points.length) issues.push({ path: `${path}.points`, message: '点集不能包含重复 ID' });
      replacement.points.forEach((id) => {
        if (typeof id !== 'string' || !pointIds.has(id)) issues.push({ path: `${path}.points`, message: `引用了未知点 ${String(id)}` });
        else if (id === replacement.replaceWith) issues.push({ path: `${path}.points`, message: '替换点不能同时位于点集中' });
        else if (ownerByPoint.has(id)) issues.push({ path: `${path}.points`, message: `${id} 已属于 ${ownerByPoint.get(id)} 的替换点集` });
        else if (typeof replacement.replaceWith === 'string') ownerByPoint.set(id, replacement.replaceWith);
      });
    }
    if (replacement.show !== 'points' && replacement.show !== 'replacement') issues.push({ path: `${path}.show`, message: '必须为 points 或 replacement' });
  });

  for (const target of replacementTargets) {
    let cursor: string | undefined = target;
    const visited = new Set<string>();
    while (cursor && ownerByPoint.has(cursor)) {
      if (visited.has(cursor)) {
        issues.push({ path: 'view.replacements', message: `替换关系在 ${cursor} 处形成循环` });
        break;
      }
      visited.add(cursor);
      cursor = ownerByPoint.get(cursor);
    }
  }
  return issues;
}

export function validateDocument(value: unknown): DocumentIssue[] {
  return validateCurrentDocument(value);
}

function migratePreviousDocument(value: Record<string, unknown>): {
  value: Record<string, unknown>;
  issues: DocumentIssue[];
} {
  const issues: DocumentIssue[] = [];
  const metadata = isRecord(value.document) ? value.document : {};
  const view = isRecord(value.view) ? value.view : {};
  const rawPositions = view.positions;
  const nodeIds = new Set<string>();
  if (isRecord(value.graph)) {
    if (Array.isArray(value.graph.points)) {
      value.graph.points.forEach((point) => {
        if (isRecord(point) && typeof point.id === 'string') nodeIds.add(point.id);
      });
    }
    if (Array.isArray(value.graph.hyperedges)) {
      value.graph.hyperedges.forEach((edge) => {
        if (isRecord(edge) && typeof edge.id === 'string') nodeIds.add(edge.id);
      });
    }
  }
  if (!isRecord(rawPositions)) {
    issues.push({ path: 'view.positions', message: 'v0.2 文档必须包含位置映射对象' });
  } else {
    for (const [id, position] of Object.entries(rawPositions)) {
      if (!nodeIds.has(id)) issues.push({ path: `view.positions.${id}`, message: '位置引用了未知节点' });
      if (!isRecord(position) || typeof position.x !== 'number' || !Number.isFinite(position.x) || typeof position.y !== 'number' || !Number.isFinite(position.y)) {
        issues.push({ path: `view.positions.${id}`, message: '位置必须包含有限数值 x 和 y' });
      }
    }
  }
  return {
    value: {
      ...value,
      schema: DOCUMENT_SCHEMA,
      document: { title: metadata.title, description: metadata.description },
      view: { replacements: view.replacements },
    },
    issues,
  };
}

export function parseDocumentWithMigration(text: string): ParsedDocument {
  const parsed: unknown = JSON.parse(text);
  const migrated = isRecord(parsed) && parsed.schema === PREVIOUS_DOCUMENT_SCHEMA
    ? migratePreviousDocument(parsed)
    : { value: parsed, issues: [] };
  const issues = [...migrated.issues, ...validateCurrentDocument(migrated.value)];
  if (issues.length) throw new Error(issues.slice(0, 4).map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  return { document: migrated.value as AuthoringDocument };
}

export function parseDocument(text: string): AuthoringDocument {
  return parseDocumentWithMigration(text).document;
}

export function uniqueId(prefix: 'c' | 'h', existing: Iterable<string>): string {
  const used = new Set(existing);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
