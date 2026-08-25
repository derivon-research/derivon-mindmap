export const DOCUMENT_SCHEMA = 'derivon.authoring/v0.1.0' as const;

export type Position = { x: number; y: number };

export type Point = {
  id: string;
  data: {
    label: string;
    definition: string;
  };
};

export type Hyperedge = {
  id: string;
  weight: number;
  tails: string[];
  head: string;
  data: {
    introduction: string;
    reasoning: string;
  };
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
    updatedAt: string;
  };
  graph: {
    points: Point[];
    hyperedges: Hyperedge[];
  };
  view: {
    positions: Record<string, Position>;
    replacements: ViewReplacement[];
  };
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

function validateCurrentDocument(value: unknown): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '文档必须是 JSON 对象' }];
  if (value.schema !== DOCUMENT_SCHEMA) issues.push({ path: 'schema', message: `必须为 ${DOCUMENT_SCHEMA}` });
  if (!isRecord(value.document)) issues.push({ path: 'document', message: '缺少文档元数据' });
  else {
    if (typeof value.document.title !== 'string') issues.push({ path: 'document.title', message: '必须是字符串' });
    if (typeof value.document.description !== 'string') issues.push({ path: 'document.description', message: '必须是字符串' });
    if (typeof value.document.updatedAt !== 'string' || Number.isNaN(Date.parse(value.document.updatedAt))) issues.push({ path: 'document.updatedAt', message: '必须是 ISO 日期字符串' });
  }
  if (!isRecord(value.graph)) return [...issues, { path: 'graph', message: '缺少图数据' }];

  reportUnknownKeys(value.graph, new Set(['points', 'hyperedges']), 'graph', issues);
  const points = value.graph.points;
  const hyperedges = value.graph.hyperedges;
  if (!Array.isArray(points)) return [...issues, { path: 'graph.points', message: '必须是数组' }];
  if (!Array.isArray(hyperedges)) return [...issues, { path: 'graph.hyperedges', message: '必须是数组' }];

  const pointIds = new Set<string>();
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
      if (typeof point.data.definition !== 'string') issues.push({ path: `${path}.data.definition`, message: '必须是字符串' });
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
    if (typeof hyperedge.weight !== 'number' || !Number.isSafeInteger(hyperedge.weight) || hyperedge.weight < 0) issues.push({ path: `${path}.weight`, message: '必须是非负安全整数' });
    if (!isRecord(hyperedge.data)) issues.push({ path: `${path}.data`, message: '必须是对象' });
    else {
      if (typeof hyperedge.data.introduction !== 'string') issues.push({ path: `${path}.data.introduction`, message: '必须是字符串' });
      if (typeof hyperedge.data.reasoning !== 'string') issues.push({ path: `${path}.data.reasoning`, message: '必须是字符串' });
    }
  });

  if (!isRecord(value.view) || !isRecord(value.view.positions)) {
    issues.push({ path: 'view.positions', message: '必须是位置映射对象' });
    return issues;
  }

  const nodeIds = new Set([...pointIds, ...hyperedgeIds]);
  for (const [id, position] of Object.entries(value.view.positions)) {
    if (!nodeIds.has(id)) issues.push({ path: `view.positions.${id}`, message: '位置引用了未知节点' });
    if (!isRecord(position) || typeof position.x !== 'number' || !Number.isFinite(position.x) || typeof position.y !== 'number' || !Number.isFinite(position.y)) {
      issues.push({ path: `view.positions.${id}`, message: '位置必须包含有限数值 x 和 y' });
    }
  }

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
    } else {
      replacementTargets.add(replacement.replaceWith);
    }
    if (!Array.isArray(replacement.points) || replacement.points.length === 0) {
      issues.push({ path: `${path}.points`, message: '点集至少需要一个点' });
    } else {
      if (new Set(replacement.points).size !== replacement.points.length) issues.push({ path: `${path}.points`, message: '点集不能包含重复 ID' });
      replacement.points.forEach((id) => {
        if (typeof id !== 'string' || !pointIds.has(id)) {
          issues.push({ path: `${path}.points`, message: `引用了未知点 ${String(id)}` });
        } else if (id === replacement.replaceWith) {
          issues.push({ path: `${path}.points`, message: '替换点不能同时位于点集中' });
        } else if (ownerByPoint.has(id)) {
          issues.push({ path: `${path}.points`, message: `${id} 已属于 ${ownerByPoint.get(id)} 的替换点集` });
        } else if (typeof replacement.replaceWith === 'string') {
          ownerByPoint.set(id, replacement.replaceWith);
        }
      });
    }
    if (replacement.show !== 'points' && replacement.show !== 'replacement') {
      issues.push({ path: `${path}.show`, message: '必须为 points 或 replacement' });
    }
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

export function parseDocument(text: string): AuthoringDocument {
  const value: unknown = JSON.parse(text);
  const issues = validateCurrentDocument(value);
  if (issues.length) throw new Error(issues.slice(0, 4).map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  return value as AuthoringDocument;
}

export function touchDocument(document: AuthoringDocument): AuthoringDocument {
  return { ...document, document: { ...document.document, updatedAt: new Date().toISOString() } };
}

export function uniqueId(prefix: 'c' | 'h', existing: Iterable<string>): string {
  const used = new Set(existing);
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
