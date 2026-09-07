/**
 * `derivon.workspace/v1`: the manifest both modes read, and the only workspace protocol.
 * Naming: `docs/adr/0007-name-the-workspace-protocol-after-the-artifact.md`.
 *
 * An unrecognized schema string is a broken workspace, reported as one.
 */

export const WORKSPACE_SCHEMA = 'derivon.workspace/v1' as const;

const WEIGHT_SCALE = 10;

export function isValidWeight(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return false;
  const scaled = Math.round(value * WEIGHT_SCALE);
  return Number.isSafeInteger(scaled) && Math.abs(value - scaled / WEIGHT_SCALE) < 1e-10;
}

export type DocumentReference = {
  readonly document: string;
};

/** A one-line gloss, for pickers, search results and listings. The document is the content. */
type Described = {
  readonly description?: string;
};

/** A concept, recorded as a point: stable id, label, owned document, author tags. */
export type ConceptPoint = {
  readonly id: string;
  readonly data: DocumentReference & Described & {
    readonly label: string;
    readonly tags?: readonly string[];
  };
};

/** A product derivation, recorded as a hyperedge. Unnamed ones read from their endpoints. */
export type DerivationHyperedge = {
  readonly id: string;
  readonly weight: number;
  readonly tails: readonly string[];
  readonly head: string;
  readonly data: DocumentReference & Described & {
    readonly label?: string;
  };
};

export type TagDeclaration = {
  readonly id: string;
  readonly label: string;
};

export type ManifestGraph = {
  readonly points: readonly ConceptPoint[];
  readonly hyperedges: readonly DerivationHyperedge[];
};

export type WorkspaceManifest = {
  readonly schema: typeof WORKSPACE_SCHEMA;
  readonly document: { readonly title: string; readonly description: string };
  readonly tags: readonly TagDeclaration[];
  readonly graph: ManifestGraph;
};

export type ManifestIssue = { readonly path: string; readonly message: string };

export type ParsedManifest = {
  readonly manifest: WorkspaceManifest;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isDocumentDirectory(value: unknown): value is string {
  if (typeof value !== 'string' || value.startsWith('/') || value.endsWith('/') || value.includes('\\') || /\.(md|html)$/i.test(value)) return false;
  const parts = value.split('/');
  return parts.length > 1
    && parts[0] !== '.derivon'
    && parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function reportUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, issues: ManifestIssue[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push({ path: `${path}.${key}`, message: '不允许出现在数学模型外层，请移入 data' });
  }
}

function validateTags(value: unknown, issues: ManifestIssue[]) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ path: 'tags', message: '必须是数组' });
    return;
  }
  const declared = new Set<string>();
  value.forEach((tag, index) => {
    const path = `tags[${index}]`;
    if (!isRecord(tag)) {
      issues.push({ path, message: '必须是对象' });
      return;
    }
    reportUnknownKeys(tag, new Set(['id', 'label']), path, issues);
    if (typeof tag.id !== 'string' || !tag.id.trim()) issues.push({ path: `${path}.id`, message: '需要非空字符串' });
    else if (declared.has(tag.id)) issues.push({ path: `${path}.id`, message: '标签 ID 重复' });
    else declared.add(tag.id);
    if (typeof tag.label !== 'string' || !tag.label.trim()) issues.push({ path: `${path}.label`, message: '需要非空字符串' });
  });
}

function validateConceptTags(value: unknown, path: string, issues: ManifestIssue[]) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ path, message: '必须是字符串数组' });
    return;
  }
  const seen = new Set<string>();
  value.forEach((tag, index) => {
    if (typeof tag !== 'string' || !tag.trim()) issues.push({ path: `${path}[${index}]`, message: '标签必须是非空字符串' });
    else if (seen.has(tag)) issues.push({ path: `${path}[${index}]`, message: '标签重复' });
    else seen.add(tag);
  });
}

/** Validate a decoded manifest. */
export function validateWorkspaceManifest(value: unknown): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '文档必须是 JSON 对象' }];
  if (value.schema !== WORKSPACE_SCHEMA) issues.push({ path: 'schema', message: `必须为 ${WORKSPACE_SCHEMA}` });
  if (value.view !== undefined) issues.push({ path: 'view', message: 'v1 没有替换视图，请移除 view' });
  if (!isRecord(value.document)) issues.push({ path: 'document', message: '缺少文档元数据' });
  else {
    for (const key of Object.keys(value.document)) {
      if (key !== 'title' && key !== 'description') {
        issues.push({ path: `document.${key}`, message: '不属于共享语义元数据；时间由文件系统维护' });
      }
    }
    if (typeof value.document.title !== 'string') issues.push({ path: 'document.title', message: '必须是字符串' });
    if (typeof value.document.description !== 'string') issues.push({ path: 'document.description', message: '必须是字符串' });
  }
  validateTags(value.tags, issues);
  if (!isRecord(value.graph)) return [...issues, { path: 'graph', message: '缺少图数据' }];

  reportUnknownKeys(value.graph, new Set(['points', 'hyperedges']), 'graph', issues);
  const points = value.graph.points;
  const hyperedges = value.graph.hyperedges;
  if (!Array.isArray(points)) return [...issues, { path: 'graph.points', message: '必须是数组' }];
  if (!Array.isArray(hyperedges)) return [...issues, { path: 'graph.hyperedges', message: '必须是数组' }];

  const pointIds = new Set<string>();
  const documentOwner = new Map<string, string>();
  const validateDocumentReference = (data: Record<string, unknown>, path: string, owner: string) => {
    if (data.format !== undefined) issues.push({ path: `${path}.format`, message: '文档只有 Markdown 一种，请移除 format' });
    if (data.description !== undefined && typeof data.description !== 'string') {
      issues.push({ path: `${path}.description`, message: '必须是字符串' });
    }
    if (!isDocumentDirectory(data.document)) {
      issues.push({ path: `${path}.document`, message: '必须是工作区内的文档目录相对路径' });
      return;
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
      validateConceptTags(point.data.tags, `${path}.data.tags`, issues);
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
    else {
      if (hyperedge.data.tags !== undefined) issues.push({ path: `${path}.data.tags`, message: '标签只属于概念，推导没有标签' });
      if (hyperedge.data.label !== undefined && typeof hyperedge.data.label !== 'string') {
        issues.push({ path: `${path}.data.label`, message: '必须是字符串' });
      }
      validateDocumentReference(hyperedge.data, `${path}.data`, `超边 ${String(hyperedge.id)}`);
    }
  });

  return issues;
}

export function parseWorkspaceManifest(text: string): ParsedManifest {
  const value: unknown = JSON.parse(text);
  const issues = validateWorkspaceManifest(value);
  if (issues.length) throw new Error(issues.slice(0, 4).map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  const decoded = value as {
    document: WorkspaceManifest['document'];
    tags?: readonly TagDeclaration[];
    graph: ManifestGraph;
  };
  return {
    manifest: {
      schema: WORKSPACE_SCHEMA,
      document: decoded.document,
      tags: decoded.tags ?? [],
      graph: decoded.graph,
    },
  };
}

/** Canonical manifest text. Empty optional collections are left out. */
export function serializeWorkspaceManifest(manifest: WorkspaceManifest): string {
  return `${JSON.stringify({
    schema: WORKSPACE_SCHEMA,
    document: manifest.document,
    ...(manifest.tags.length ? { tags: manifest.tags } : {}),
    graph: {
      points: manifest.graph.points.map((point) => ({
        id: point.id,
        data: { ...point.data, tags: point.data.tags?.length ? [...point.data.tags] : undefined },
      })),
      hyperedges: manifest.graph.hyperedges.map((edge) => ({ ...edge, data: { ...edge.data } })),
    },
  }, null, 2)}\n`;
}

/** Markdown is the only persisted object document, and it lives here. */
export function objectSourcePath(reference: DocumentReference): string {
  return `${reference.document}/document.md`;
}

export function conceptTags(point: ConceptPoint): readonly string[] {
  return point.data.tags ?? [];
}

export function conceptsWithTag(graph: ManifestGraph, tag: string): readonly ConceptPoint[] {
  return graph.points.filter((point) => conceptTags(point).includes(tag));
}

/**
 * The generated-id shape, documented in the README so the app and the authoring skills can
 * each implement it. Digits and letters that survive being read aloud or copied by hand:
 * no `0 1 i l o u`. The protocol itself accepts any ASCII id, so a hand-written graph keeps
 * names like `svd`.
 */
const ID_ALPHABET = '23456789abcdefghjkmnpqrstvwxyz';
const ID_LENGTH = 6;

/** Random rather than counted: a counter's high-water mark cannot survive a deletion. */
export function generateObjectId(prefix: 'c' | 'h', existing: Iterable<string>): string {
  const used = new Set(existing);
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
    const id = `${prefix}-${[...bytes].map((byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('')}`;
    if (!used.has(id)) return id;
  }
}
