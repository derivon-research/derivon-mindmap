import { act, lazy, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { createConcept, createWorkspace } from '../workspace/index';
import type { WritableWorkspaceSource } from '../ports/WorkspaceSource';
import type { AuthoringModeProps, LearningModeProps, WorkspaceHandle } from './host';
import { initialAppState } from './appState';
import { MarkdownPreview } from './DocumentPreview';
import { useObjectDocument } from './useObjectDocument';
import WorkspaceSurface from './WorkspaceSurface';

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
});

function fixture() {
  const content = createConcept(createWorkspace({ title: 'Test' }).content, { label: 'A' }).content;
  const changedContent = createConcept(createWorkspace({ title: 'Changed' }).content, { label: 'B' }).content;
  const documentPath = `${content.graph.points[0].data.document}/document.md`;
  let revision = 'initial';
  let bytes = new Uint8Array([1]);
  let graphText = content.graphText;
  const commit = vi.fn(async () => revision);
  const source: WritableWorkspaceSource = {
    readGraph: async () => graphText,
    readDocument: async () => '<img src="assets/image.png">',
    readCompanionMetadata: async () => null,
    readAsset: async () => bytes,
    revision: async () => revision,
    listOwnedFiles: async () => [],
    commit,
  };
  const workspace: WorkspaceHandle = { id: 'test', name: 'Test', source, authoringSource: source };
  return {
    workspace, commit, documentPath, changedGraphText: changedContent.graphText,
    update(nextGraphText = content.graphText) {
      revision = 'external';
      graphText = nextGraphText;
      bytes = new Uint8Array([2]);
    },
  };
}

let documentPath = '';
const modes = {
  learning: lazy(async () => ({ default: function Learning({ content, readAsset, readDocuments }: LearningModeProps) {
    const resource = useObjectDocument(documentPath, content.documents[documentPath], readDocuments);
    return <>
      <p>{content.title}</p>
      {resource?.status === 'ready'
        ? <MarkdownPreview title={content.title} markdown={resource.text}
          documentPath={documentPath} readAsset={readAsset} />
        : <p role="status">Loading</p>}
    </>;
  } })),
  authoring: lazy(async () => ({ default: function Draft({ authoring }: AuthoringModeProps) {
    const [draft, setDraft] = useState('');
    return <input aria-label="Draft" value={draft} onChange={(event) => {
      setDraft(event.target.value); authoring!.protectDraft('test-draft', Boolean(event.target.value));
    }} />;
  } })),
};

async function render(workspace: WorkspaceHandle, mode: 'authoring' | 'learning') {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  const state = initialAppState({ hostId: 'desktop', modes: [mode], workspace });
  await act(async () => root!.render(<WorkspaceSurface workspace={workspace} state={state} modes={modes}
    onSelectConcept={vi.fn()} onChangeTargets={vi.fn()} onChangeKnown={vi.fn()}
    onEnterLearningView={vi.fn()} onConfirmRoute={vi.fn()} onRouteInvalidated={vi.fn()}
    onProtectionChange={vi.fn()} />));
}

it('passes an external graph change to learning without writing', async () => {
  const fixed = fixture();
  documentPath = fixed.documentPath;
  await render(fixed.workspace, 'learning');
  await expect.poll(() => container.textContent).toContain('Test');
  fixed.update(fixed.changedGraphText);
  await expect.poll(() => container.textContent).toContain('Changed');
  expect(fixed.commit).not.toHaveBeenCalled();
});

it('refreshes unchanged document markup when only its external image changes', async () => {
  const fixed = fixture();
  const { workspace, update, commit } = fixed;
  documentPath = fixed.documentPath;
  await render(workspace, 'learning');
  await expect.poll(() => container.querySelector('iframe')?.srcdoc).toContain('base64,AQ==');
  update();
  await expect.poll(() => container.querySelector('iframe')?.srcdoc).toContain('base64,Ag==');
  expect(commit).not.toHaveBeenCalled();
});

it('keeps a draft behind a conflict until confirmation, then resets its editor without writing', async () => {
  const { workspace, update, commit } = fixture();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await render(workspace, 'authoring');
  await page.getByLabelText('Draft').fill('Protected draft');
  update();
  const discard = page.getByRole('button', { name: '放弃本地更改并载入' });
  await expect.element(discard).toBeVisible();
  await discard.click();
  await expect.element(page.getByLabelText('Draft')).toHaveValue('Protected draft');
  confirm.mockReturnValue(true);
  await discard.click();
  await expect.element(page.getByLabelText('Draft')).toHaveValue('');
  await expect.element(discard).not.toBeInTheDocument();
  expect(commit).not.toHaveBeenCalled();
});
