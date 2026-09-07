/**
 * What an object document points at, and what effective content can honestly say about it.
 *
 * The supported reference syntax is a closed list, because a repair has to be able to
 * rewrite exactly what it reports:
 *
 * - Markdown inline links and images, `[text](dest "title")` and `![alt](dest "title")`,
 *   with an optional `<dest>` wrapper;
 * - Markdown link reference definitions, `[label]: dest "title"`;
 * - literal `href` on `<a>` and literal `src` on `<img>`, `<source>`, `<video>` and
 *   `<audio>` in embedded HTML.
 *
 * Everything else in a body is either not a reference (code spans, fenced code and HTML
 * comments are read as text) or is reported as an uncertainty. A source this module cannot
 * analyse — a script that writes markup, a templated attribute, a link destination outside
 * the grammar above — is never reported as "no reference": callers that need a complete
 * inventory must treat an uncertainty as an unknown reference.
 *
 * Existence is only claimed where effective content can prove it. An object document is
 * proven by the manifest; image bytes are proven by the accepted assets. A workspace path
 * that is neither is `unknown`, not `dangling` — a lazily read workspace holds files this
 * module has never seen.
 */
import { objectSourcePath, type ManifestGraph } from './manifest';
import type { TextResource } from './resource';

export type WorkspaceReferenceTarget =
  | { readonly kind: 'remote'; readonly url: string }
  | { readonly kind: 'anchor'; readonly fragment: string }
  | { readonly kind: 'workspace'; readonly path: string }
  | { readonly kind: 'invalid'; readonly reason: string };

/**
 * Read one written destination the way the workspace does. `subject` only names the thing
 * in the diagnostics, so an image and a link can report the same rule in their own words.
 */
export function resolveWorkspaceReference(documentPath: string, value: string, subject = '引用'): WorkspaceReferenceTarget {
  const raw = value.trim();
  if (!raw) return { kind: 'invalid', reason: `${subject}地址为空` };
  if (/^https?:\/\//i.test(raw) || /^mailto:[^\s@]+@[^\s@]+$/i.test(raw)) return { kind: 'remote', url: raw };
  if (raw.startsWith('#')) {
    return raw.length > 1 ? { kind: 'anchor', fragment: raw.slice(1) } : { kind: 'invalid', reason: `${subject}锚点为空` };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) return { kind: 'invalid', reason: `只允许 HTTP(S)、邮箱、页面锚点或工作区相对路径` };
  if (raw.startsWith('/') || raw.startsWith('\\')) return { kind: 'invalid', reason: `只允许工作区相对路径` };
  const pathOnly = raw.split(/[?#]/, 1)[0];
  const parts = documentPath.split('/').slice(0, -1).filter(Boolean);
  for (const encoded of pathOnly.split('/')) {
    let segment: string;
    try { segment = decodeURIComponent(encoded); }
    catch { return { kind: 'invalid', reason: `${subject}路径包含无效的 URL 编码` }; }
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!parts.length) return { kind: 'invalid', reason: `${subject}路径超出工作区范围` };
      parts.pop();
      continue;
    }
    if (segment.includes('/') || segment.includes('\\') || segment.includes('\0')) {
      return { kind: 'invalid', reason: `${subject}路径包含无效字符` };
    }
    parts.push(segment);
  }
  if (!parts.length) return { kind: 'invalid', reason: `${subject}路径没有指向文件` };
  return { kind: 'workspace', path: parts.join('/') };
}

/** The href one document uses to point at another object's document. */
export function objectDocumentHref(documentPath: string, targetDirectory: string): string {
  const source = documentPath.split('/').filter(Boolean).slice(0, -1);
  const target = [...targetDirectory.split('/').filter(Boolean), 'document.md'];
  let shared = 0;
  while (shared < source.length && shared < target.length && source[shared] === target[shared]) shared += 1;
  return [
    ...Array.from({ length: source.length - shared }, () => '..'),
    ...target.slice(shared).map((segment) => encodeURIComponent(segment)),
  ].join('/') || 'document.md';
}

// ------------------------------------------------------------------ scanning

export type ReferenceUse = 'link' | 'image';
export type ReferenceSyntax = 'markdown' | 'markdown-definition' | 'html';

/**
 * `object` and `asset` are proven by effective content; `dangling` and `unsupported` are
 * proven wrong; `unknown` means undecidable here, and must not be read as either.
 */
export type ReferenceStatus = 'object' | 'asset' | 'remote' | 'anchor' | 'dangling' | 'unsupported' | 'unknown';

export type SourceRange = { readonly start: number; readonly end: number };

export type DocumentReferenceItem = {
  readonly use: ReferenceUse;
  readonly syntax: ReferenceSyntax;
  /** The destination exactly as written. */
  readonly raw: string;
  readonly status: ReferenceStatus;
  /** The resolved workspace path, when the destination named one. */
  readonly path?: string;
  /** The object whose document this reference resolves to. */
  readonly objectId?: string;
  readonly message?: string;
  /** The whole construct, so a repair can rewrite or drop it. */
  readonly at: SourceRange;
  /** The destination text inside the construct. */
  readonly target: SourceRange;
  /** A Markdown link's text, or an HTML anchor's inner text. */
  readonly text?: string;
  /** An HTML anchor's closing tag. */
  readonly close?: SourceRange;
};

export type ReferenceUncertainty = {
  readonly reason: 'script' | 'dynamic-attribute' | 'unsupported-html' | 'unparsed';
  readonly detail: string;
  readonly at: SourceRange;
};

export type DocumentReferenceReport = {
  readonly documentPath: string;
  /** In document order, so a report reads the way the body does. */
  readonly references: readonly DocumentReferenceItem[];
  /** Sources of references this module could not read. Never an empty reference set. */
  readonly uncertainties: readonly ReferenceUncertainty[];
};

/** What resolution needs from effective content; `WorkspaceContent` satisfies it. */
export type ReferenceBasis = {
  readonly graph: ManifestGraph;
  readonly documents: Readonly<Record<string, TextResource>>;
  readonly assets?: Readonly<Record<string, Uint8Array>>;
};

/** Code and comments are text, not references. Masking keeps every offset intact. */
function maskLiteralText(source: string): string {
  const characters = source.split('');
  const mask = (start: number, end: number) => {
    for (let index = start; index < end && index < characters.length; index++) {
      if (characters[index] !== '\n') characters[index] = ' ';
    }
  };
  let fence: string | null = null;
  let cursor = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trimStart();
    const opener = /^(```+|~~~+)/.exec(trimmed)?.[1];
    if (fence !== null) {
      mask(cursor, cursor + line.length);
      if (opener && opener.startsWith(fence)) fence = null;
    } else if (opener) {
      fence = opener;
      mask(cursor, cursor + line.length);
    }
    cursor += line.length + 1;
  }
  const masked = characters.join('');
  const result = masked.split('');
  const blank = (start: number, end: number) => {
    for (let index = start; index < end; index++) if (result[index] !== '\n') result[index] = ' ';
  };
  for (const pattern of [/(`+)(?:(?!\1)[\s\S])*?\1/g, /<!--[\s\S]*?-->/g]) {
    for (const match of masked.matchAll(pattern)) blank(match.index, match.index + match[0].length);
  }
  // A script body is program text, not markup: the tag is reported as an uncertainty and
  // whatever markup it contains is not read as this document's references.
  for (const match of masked.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>|$)/gi)) {
    blank(match.index + match[1].length, match.index + match[1].length + match[2].length);
  }
  return result.join('');
}

const MARKDOWN_INLINE = /(!?)\[((?:[^\]\\]|\\.)*)\]\(([ \t]*)(<[^<>\n]*>|[^\s()<>]*)[ \t]*(?:"[^"]*"|'[^']*'|\([^()]*\))?[ \t]*\)/g;
const MARKDOWN_DEFINITION = /^([ \t]{0,3})\[((?:[^\]\\]|\\.)+)\]:([ \t]*)(<[^<>\n]*>|\S+)/gm;
const HTML_TAG = /<([a-z][a-z\d]*)\b([^>]*)>/gi;
const HTML_ATTRIBUTE = /(?<![-\w:])(href|src)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const DYNAMIC_VALUE = /\{\{|\$\{|\{%|<%/;
const IMAGE_TAGS = ['img', 'source', 'video', 'audio'];
const OPAQUE_TAGS = ['script', 'iframe', 'object', 'embed'];

function unwrapDestination(written: string, start: number): { raw: string; target: SourceRange } {
  return written.startsWith('<') && written.endsWith('>')
    ? { raw: written.slice(1, -1), target: { start: start + 1, end: start + written.length - 1 } }
    : { raw: written, target: { start, end: start + written.length } };
}

/**
 * Every reference in a body, resolved against effective content, plus every source of
 * references that could not be read.
 */
export function documentReferences(basis: ReferenceBasis, documentPath: string, source: string): DocumentReferenceReport {
  const masked = maskLiteralText(source);
  const references: DocumentReferenceItem[] = [];
  const uncertainties: ReferenceUncertainty[] = [];
  const consumed: SourceRange[] = [];

  const record = (item: Omit<DocumentReferenceItem, 'status' | 'path' | 'objectId' | 'message'>) => {
    references.push({ ...item, ...resolveStatus(basis, documentPath, item.raw, item.use) });
    consumed.push(item.at);
  };

  for (const match of masked.matchAll(MARKDOWN_INLINE)) {
    const [whole, bang, text, spaces, written] = match;
    const start = match.index + bang.length + 1 + text.length + 2 + spaces.length;
    record({ use: bang ? 'image' : 'link', syntax: 'markdown', text,
      at: { start: match.index, end: match.index + whole.length }, ...unwrapDestination(written, start) });
  }
  for (const match of masked.matchAll(MARKDOWN_DEFINITION)) {
    const [whole, indent, label, spaces, written] = match;
    const start = match.index + indent.length + 1 + label.length + 2 + spaces.length;
    record({ use: 'link', syntax: 'markdown-definition', text: label,
      at: { start: match.index, end: match.index + whole.length }, ...unwrapDestination(written, start) });
  }
  for (const match of masked.matchAll(HTML_TAG)) {
    const [whole, name, attributes] = match;
    const tag = name.toLowerCase();
    const at = { start: match.index, end: match.index + whole.length };
    if (OPAQUE_TAGS.includes(tag)) {
      uncertainties.push({ reason: 'script', at,
        detail: `<${tag}> 是脚本或独立取内容的元素，浏览时才决定引用什么，这里读不出来。` });
      continue;
    }
    const isImage = IMAGE_TAGS.includes(tag);
    if (tag !== 'a' && !isImage) continue;
    const attribute = HTML_ATTRIBUTE.exec(attributes);
    const written = attribute?.[3] ?? attribute?.[4] ?? attribute?.[5];
    if (attribute === null || written === undefined) {
      uncertainties.push({ reason: 'dynamic-attribute', at,
        detail: `<${tag}> 没有可直接读取的 ${tag === 'a' ? 'href' : 'src'}，它的目标可能由脚本或模板决定。` });
      continue;
    }
    if (DYNAMIC_VALUE.test(written)) {
      uncertainties.push({ reason: 'dynamic-attribute', at, detail: `<${tag}> 的地址「${written}」是模板占位，不能静态判定。` });
      continue;
    }
    if (/\bsrcset\s*=/i.test(attributes)) {
      uncertainties.push({ reason: 'unsupported-html', at, detail: `<${tag}> 的 srcset 候选列表不在受支持的引用语法内。` });
    }
    const quoted = attribute[3] !== undefined || attribute[4] !== undefined;
    const start = match.index + 1 + name.length + attribute.index + attribute[1].length + attribute[2].length + (quoted ? 1 : 0);
    const close = tag === 'a' ? findClosingAnchor(masked, at.end) : undefined;
    record({ use: isImage ? 'image' : 'link', syntax: 'html', at,
      ...(close ? { close, text: source.slice(at.end, close.start) } : {}),
      ...unwrapDestination(written, start) });
  }
  for (const match of masked.matchAll(/\]\(/g)) {
    if (!consumed.some(({ start, end }) => match.index >= start && match.index < end)) {
      uncertainties.push({ reason: 'unparsed', at: { start: match.index, end: match.index + 2 },
        detail: '这里像是一个 Markdown 链接，但它的目标不在受支持的写法内，无法判定引用了什么。' });
    }
  }
  return {
    documentPath,
    references: references.sort((left, right) => left.at.start - right.at.start),
    uncertainties: uncertainties.sort((left, right) => left.at.start - right.at.start),
  };
}

function findClosingAnchor(masked: string, from: number): SourceRange | undefined {
  const index = masked.toLowerCase().indexOf('</a>', from);
  return index < 0 ? undefined : { start: index, end: index + 4 };
}

function resolveStatus(basis: ReferenceBasis, documentPath: string, raw: string, use: ReferenceUse):
Pick<DocumentReferenceItem, 'status' | 'path' | 'objectId' | 'message'> {
  const target = resolveWorkspaceReference(documentPath, raw, use === 'image' ? '图片' : '引用');
  if (target.kind === 'remote') return { status: 'remote' };
  if (target.kind === 'anchor') return { status: 'anchor' };
  if (target.kind === 'invalid') return { status: 'unsupported', message: target.reason };
  const owner = [...basis.graph.points, ...basis.graph.hyperedges]
    .find((object) => objectSourcePath(object.data) === target.path);
  if (owner) return { status: 'object', path: target.path, objectId: owner.id };
  if (basis.assets?.[target.path]) return { status: 'asset', path: target.path };
  if (basis.documents[target.path]?.status === 'ready') return { status: 'asset', path: target.path };
  if (target.path.endsWith('/document.md')) {
    return { status: 'dangling', path: target.path, message: '没有对象拥有这个文档，链接指向的对象不存在。' };
  }
  return { status: 'unknown', path: target.path, message: '有效内容还没有读到这个工作区文件，无法确认它是否存在。' };
}

/** The statuses a caller may not silently accept into a change it is making. */
export function isBrokenReference(item: DocumentReferenceItem): boolean {
  return item.status === 'dangling' || item.status === 'unsupported';
}

/**
 * The broken references a rewrite would add. Damage already written into the body stays
 * the author's to fix; it does not veto an unrelated legal edit.
 */
export function introducedReferenceProblems(
  basis: ReferenceBasis, documentPath: string, previousSource: string, nextSource: string,
): readonly DocumentReferenceItem[] {
  const key = (item: DocumentReferenceItem) => `${item.use}:${item.status}:${item.path ?? item.raw}`;
  const existing = new Map<string, number>();
  for (const item of documentReferences(basis, documentPath, previousSource).references.filter(isBrokenReference)) {
    existing.set(key(item), (existing.get(key(item)) ?? 0) + 1);
  }
  return documentReferences(basis, documentPath, nextSource).references.filter(isBrokenReference)
    .filter((item) => {
      const remaining = existing.get(key(item)) ?? 0;
      if (remaining === 0) return true;
      existing.set(key(item), remaining - 1);
      return false;
    });
}

// ------------------------------------------------------------------ repair

/**
 * How a user chooses to repair one reference. There is no default: turning a link into
 * plain text and dropping an image are different decisions and both are stated here.
 */
export type ReferenceRepairAction = 'retarget' | 'unlink' | 'remove';

export type ReferenceRepair = {
  /** The reference to repair, identified by where it sits in the source being repaired. */
  readonly at: SourceRange;
  readonly action: ReferenceRepairAction;
  /** The destination `retarget` writes. */
  readonly href?: string;
};

/** Rewrite exactly the chosen references. Anything else in the body is left alone. */
export function applyReferenceRepairs(
  source: string, references: readonly DocumentReferenceItem[], repairs: readonly ReferenceRepair[],
): string {
  const edits: { start: number; end: number; text: string }[] = [];
  const repaired = new Set<number>();
  for (const repair of repairs) {
    const item = references.find(({ at }) => at.start === repair.at.start && at.end === repair.at.end);
    if (!item) throw new Error(`要修正的引用已经不在文档里（${repair.at.start}-${repair.at.end}），请重新检查引用。`);
    if (repaired.has(item.at.start)) throw new Error(`同一处引用只能选一种修正：「${item.raw}」。`);
    repaired.add(item.at.start);
    if (repair.action === 'retarget') {
      if (!repair.href) throw new Error('改指需要一个新的目标。');
      edits.push({ start: item.target.start, end: item.target.end, text: repair.href });
      continue;
    }
    if (repair.action === 'unlink') {
      if (item.use !== 'link') throw new Error('图片没有可以退回的文字，请选择删除引用。');
      if (item.syntax === 'markdown-definition') throw new Error('引用定义没有可以退回的文字，请改指或删除它。');
      if (item.syntax === 'html' && !item.close) throw new Error('这个 HTML 链接没有配对的结束标签，无法只退回文字。');
      edits.push(item.syntax === 'html'
        ? { start: item.at.start, end: item.close!.end, text: item.text ?? '' }
        : { start: item.at.start, end: item.at.end, text: item.text ?? '' });
      continue;
    }
    const end = item.syntax === 'markdown-definition' && source[item.at.end] === '\n' ? item.at.end + 1
      : item.close ? item.close.end : item.at.end;
    edits.push({ start: item.at.start, end, text: '' });
  }
  let result = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
