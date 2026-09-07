import { FileText } from 'lucide-react';
import { MarkdownPreview } from '../../app/DocumentPreview';
import type { LearningModeProps } from '../../app/host';
import { useObjectDocument } from '../../app/useObjectDocument';
import { objectDocumentSource, type WorkspaceContent } from '../../workspace/index';

export type ObjectDocumentProps = {
  readonly title: string;
  readonly content: WorkspaceContent;
  /** The concept or derivation whose document to read. */
  readonly object: { readonly data: { readonly document: string } } | undefined;
  readonly active: boolean;
  readonly readAsset?: LearningModeProps['readAsset'];
  readonly readDocuments?: LearningModeProps['readDocuments'];
};

/**
 * One object document, read through the session and rendered as the learner's reading
 * surface. A missing or unreadable document is reported where it is, because the rest of
 * the route is still worth walking.
 *
 * It grows to its content rather than filling a box: what follows a document on the
 * learning side — the next step, or what to do with the concept — belongs at the end of
 * the text, and a document in its own scroller has no end to put anything at.
 */
export function ObjectDocument({ title, content, object, active, readAsset, readDocuments }: ObjectDocumentProps) {
  const documentPath = object ? `${object.data.document}/document.md` : '';
  const current = useObjectDocument(documentPath, object ? objectDocumentSource(content, object.data) : undefined,
    readDocuments, active && Boolean(object));
  if (!object) return <p className="learning-document-empty">这个对象不在图里。</p>;
  if (!current) return <p role="status">正在载入文档…</p>;
  return current.status === 'ready'
    ? <MarkdownPreview title={`${title} 文档`} markdown={current.text} documentPath={documentPath}
      readAsset={readAsset} autoHeight />
    : <div className="learning-document-error" role="alert"><FileText aria-hidden="true" />
      <div><strong>无法读取对象文档</strong><p>{current.message}</p></div></div>;
}
