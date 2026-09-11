import { act, lazy, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import type { ConversationProvider } from '../ports/ConversationProvider';
import type { WorkspaceContent } from '../workspace/index';
import { createConcept, createWorkspace } from '../workspace/index';
import type { WorkspaceCommit, WritableWorkspaceSource } from '../ports/WorkspaceSource';
import { ConversationPane } from '../modes/shared/ConversationPane';
import type { AuthoringModeProps, LearningModeProps, WorkspaceHandle } from './host';
import { initialAppState } from './appState';
import { MarkdownPreview } from './DocumentPreview';
import { useObjectDocument } from './useObjectDocument';
import WorkspaceSurface, { type WorkspaceSurfaceProps } from './WorkspaceSurface';

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
});

function fixture() {
  const content = createConcept(createWorkspace({ id: 'test-workspace', title: 'Test' }).content, { label: 'A' }).content;
  const changedContent = createConcept(createWorkspace({ id: 'test-workspace', title: 'Changed' }).content, { label: 'B' }).content;
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

async function render(workspace: WorkspaceHandle, mode: 'authoring' | 'learning', options: {
  modes?: WorkspaceSurfaceProps['modes'];
  conversationProviders?: WorkspaceSurfaceProps['conversationProviders'];
} = {}) {
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  const state = initialAppState({ hostId: 'desktop', modes: [mode], workspace });
  await act(async () => root!.render(<WorkspaceSurface workspace={workspace} state={state} modes={options.modes ?? modes}
    conversationProviders={options.conversationProviders}
    onSelectConcept={vi.fn()} onChangeTargets={vi.fn()} onChangeKnown={vi.fn()}
    onEnterLearningView={vi.fn()} onConfirmRoute={vi.fn()} onRouteInvalidated={vi.fn()}
    onProtectionChange={vi.fn()} />));
}

/**
 * A workspace whose disk the commit actually changes, so "what the Agent read" and "what the
 * user had accepted" are two things a test can tell apart.
 */
function turnFixture() {
  const content = createConcept(createWorkspace({ id: 'test-workspace', title: 'Turn' }).content, { label: 'A' }).content;
  let disk = content.graphText;
  let revision = 'r1';
  let refuse = false;
  let writes = 0;
  const commit = vi.fn(async (changes: WorkspaceCommit) => {
    if (refuse) throw new Error('磁盘已满');
    if (changes.graph !== undefined) disk = changes.graph;
    return revision = `write-${++writes}`;
  });
  const source: WritableWorkspaceSource = {
    readGraph: async () => disk,
    readDocument: async () => '',
    readCompanionMetadata: async () => null,
    readAsset: async () => new Uint8Array(),
    revision: async () => revision,
    listOwnedFiles: async () => [],
    commit,
  };
  return {
    initialGraphText: content.graphText,
    commit,
    source,
    workspace: { id: 'test', name: 'Test', source, authoringSource: source } as WorkspaceHandle,
    refuseCommits() { refuse = true; },
  };
}

class TurnProvider implements ConversationProvider {
  readonly send = vi.fn(async () => { await this.onSend(); });
  readonly abort = vi.fn(async () => {});
  readonly newConversation = vi.fn(async () => {});
  readonly setWorkspace = vi.fn(async () => {});
  readonly setModel = vi.fn(async () => {});
  readonly listModels = vi.fn(async () => ({ models: [] }));
  constructor(private readonly onSend: () => Promise<void>) {}
  subscribe() { return () => {}; }
}

/** What the mode actually rendered, and every save state it was told about. */
type TurnObservation = { content?: WorkspaceContent; saveStates: string[] };

/**
 * An authoring mode with the smallest thing that accepts a change — one queued write — and a
 * real conversation pane, so the drain travels the whole composition path it travels in the app.
 */
function turnModes(observation: TurnObservation): WorkspaceSurfaceProps['modes'] {
  return {
    learning: lazy(async () => ({ default: function TurnLearning() { return null; } })),
    authoring: lazy(async () => ({ default: function TurnAuthoring({ content, authoring, conversation, drainPendingChanges, syncStatus }: AuthoringModeProps) {
      observation.content = content;
      if (syncStatus) observation.saveStates.push(syncStatus.state);
      return <>
        <button type="button" onClick={() => { authoring!.createConcept({ label: 'B' }); }}>接受变更</button>
        <ConversationPane mode="authoring" provider={conversation} placeholder="描述你想完成的修改…"
          fallbackMessage="未连接模型，未修改工作区。" drainPendingChanges={drainPendingChanges} />
      </>;
    } })),
  };
}

async function sendTurn(prompt: string) {
  await page.getByRole('textbox', { name: 'Agent 消息' }).fill(prompt);
  await page.getByRole('button', { name: '发送消息' }).click();
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

it('writes the accepted change to disk before the turn reaches the Agent', async () => {
  const fixed = turnFixture();
  const observation: TurnObservation = { saveStates: [] };
  const readAtSend: string[] = [];
  // No waiting for the autosave timer: the send is what has to make the write land.
  const provider = new TurnProvider(async () => { readAtSend.push(await fixed.source.readGraph()); });
  await render(fixed.workspace, 'authoring', { modes: turnModes(observation), conversationProviders: { authoring: provider } });

  await page.getByRole('button', { name: '接受变更' }).click();
  expect(observation.content!.graphText).not.toBe(fixed.initialGraphText);
  await sendTurn('现在的工作区里有什么？');

  await expect.poll(() => provider.send.mock.calls.length).toBe(1);
  // The first thing the Agent read is what the user had accepted, not the version they replaced.
  expect(readAtSend[0]).toBe(observation.content!.graphText);
});

it('keeps autosaving and accepting edits while a turn is still in flight', async () => {
  const fixed = turnFixture();
  const observation: TurnObservation = { saveStates: [] };
  let settled = false;
  let settleTurn!: () => void;
  const provider = new TurnProvider(() => new Promise<void>((resolve) => { settleTurn = () => { settled = true; resolve(); }; }));
  await render(fixed.workspace, 'authoring', { modes: turnModes(observation), conversationProviders: { authoring: provider } });

  await sendTurn('先读一遍工作区');
  await expect.poll(() => provider.send.mock.calls.length).toBe(1);

  // Nothing was suspended: an edit made during the turn is accepted, queued, and written.
  await page.getByRole('button', { name: '接受变更' }).click();
  expect(observation.content!.graph.points).toHaveLength(2);
  expect(observation.saveStates.at(-1)).toBe('pending');
  await expect.poll(() => fixed.commit.mock.calls.length, { timeout: 3_000 }).toBeGreaterThan(0);
  await expect.poll(() => observation.saveStates.at(-1), { timeout: 3_000 }).toBe('saved');
  // ...and the save landed while the turn itself was still running, not after it.
  expect(settled).toBe(false);

  settleTurn();
});

it('starts the turn even when the drain cannot save', async () => {
  const fixed = turnFixture();
  const observation: TurnObservation = { saveStates: [] };
  const readAtSend: string[] = [];
  const provider = new TurnProvider(async () => { readAtSend.push(await fixed.source.readGraph()); });
  await render(fixed.workspace, 'authoring', { modes: turnModes(observation), conversationProviders: { authoring: provider } });

  fixed.refuseCommits();
  await page.getByRole('button', { name: '接受变更' }).click();
  await sendTurn('磁盘写不进去也照样开始');

  await expect.poll(() => provider.send.mock.calls.length).toBe(1);
  expect(fixed.commit).toHaveBeenCalled();
  // The failed save is the banner's story; the turn was never refused because of it.
  expect(readAtSend[0]).toBe(fixed.initialGraphText);
});
