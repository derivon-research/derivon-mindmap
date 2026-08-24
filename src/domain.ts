export const DOCUMENT_SCHEMA = 'derivon.authoring/v1' as const;

export type Position = { x: number; y: number };

export type Concept = {
  id: string;
  label: string;
  definition: string;
};

export type Derivation = {
  id: string;
  premises: string[];
  conclusion: string;
  introduction: string;
  reasoning: string;
  weight: number;
};

export type AuthoringDocument = {
  schema: typeof DOCUMENT_SCHEMA;
  document: {
    title: string;
    description: string;
    updatedAt: string;
  };
  graph: {
    concepts: Concept[];
    derivations: Derivation[];
  };
  view: {
    positions: Record<string, Position>;
  };
};

export type DocumentIssue = { path: string; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateDocument(value: unknown): DocumentIssue[] {
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

  const concepts = value.graph.concepts;
  const derivations = value.graph.derivations;
  if (!Array.isArray(concepts)) return [...issues, { path: 'graph.concepts', message: '必须是数组' }];
  if (!Array.isArray(derivations)) return [...issues, { path: 'graph.derivations', message: '必须是数组' }];

  const conceptIds = new Set<string>();
  concepts.forEach((concept, index) => {
    const path = `graph.concepts[${index}]`;
    if (!isRecord(concept)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }
    if (typeof concept.id !== 'string' || !concept.id.trim()) issues.push({ path: `${path}.id`, message: '需要非空字符串' });
    else if (conceptIds.has(concept.id)) issues.push({ path: `${path}.id`, message: '概念 ID 重复' });
    else conceptIds.add(concept.id);
    if (typeof concept.label !== 'string') issues.push({ path: `${path}.label`, message: '必须是字符串' });
    if (typeof concept.definition !== 'string') issues.push({ path: `${path}.definition`, message: '必须是字符串' });
  });

  const derivationIds = new Set<string>();
  derivations.forEach((derivation, index) => {
    const path = `graph.derivations[${index}]`;
    if (!isRecord(derivation)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }
    if (typeof derivation.id !== 'string' || !derivation.id.trim()) issues.push({ path: `${path}.id`, message: '需要非空字符串' });
    else if (conceptIds.has(derivation.id)) issues.push({ path: `${path}.id`, message: '推导 ID 不能与概念 ID 相同' });
    else if (derivationIds.has(derivation.id)) issues.push({ path: `${path}.id`, message: '推导 ID 重复' });
    else derivationIds.add(derivation.id);
    if (!Array.isArray(derivation.premises)) issues.push({ path: `${path}.premises`, message: '必须是数组' });
    else {
      if (new Set(derivation.premises).size !== derivation.premises.length) issues.push({ path: `${path}.premises`, message: '前提不能重复' });
      derivation.premises.forEach((id) => {
        if (typeof id !== 'string' || !conceptIds.has(id)) issues.push({ path: `${path}.premises`, message: `未知概念 ${String(id)}` });
      });
    }
    if (typeof derivation.conclusion !== 'string' || !conceptIds.has(derivation.conclusion)) issues.push({ path: `${path}.conclusion`, message: '结论必须引用已有概念' });
    if (typeof derivation.introduction !== 'string') issues.push({ path: `${path}.introduction`, message: '必须是字符串' });
    if (typeof derivation.reasoning !== 'string') issues.push({ path: `${path}.reasoning`, message: '必须是字符串' });
    if (typeof derivation.weight !== 'number' || !Number.isSafeInteger(derivation.weight) || derivation.weight < 0) issues.push({ path: `${path}.weight`, message: '必须是非负安全整数' });
  });

  if (!isRecord(value.view) || !isRecord(value.view.positions)) {
    issues.push({ path: 'view.positions', message: '必须是位置映射对象' });
  } else {
    const nodeIds = new Set([...conceptIds, ...derivationIds]);
    for (const [id, position] of Object.entries(value.view.positions)) {
      if (!nodeIds.has(id)) issues.push({ path: `view.positions.${id}`, message: '位置引用了未知节点' });
      if (!isRecord(position) || typeof position.x !== 'number' || !Number.isFinite(position.x) || typeof position.y !== 'number' || !Number.isFinite(position.y)) {
        issues.push({ path: `view.positions.${id}`, message: '位置必须包含有限数值 x 和 y' });
      }
    }
  }
  return issues;
}

export function parseDocument(text: string): AuthoringDocument {
  const value: unknown = JSON.parse(text);
  const issues = validateDocument(value);
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
