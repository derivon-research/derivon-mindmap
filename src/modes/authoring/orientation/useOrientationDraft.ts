import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthoringCommands } from '../../../synchronization';
import {
  emptyOrientationConfig, serializeOrientationConfig, validateOrientationConfig,
  type OrientationConfig, type OrientationDiagnostic, type WorkspaceContent,
} from '../../../workspace/index';

export type OrientationSelection =
  | { readonly kind: 'seed' }
  | { readonly kind: 'question'; readonly questionId: string }
  | { readonly kind: 'option'; readonly questionId: string; readonly optionId: string };

export type OrientationDraft = {
  readonly draft: OrientationConfig | null;
  readonly saved: OrientationConfig | null;
  /** Unfinished editing. It is not effective content and it is never auto-saved. */
  readonly dirty: boolean;
  readonly diagnostics: readonly OrientationDiagnostic[];
  readonly blocking: readonly OrientationDiagnostic[];
  readonly failure: string;
  readonly selection: OrientationSelection;
  readonly entryOptionId: string | null;
  select(selection: OrientationSelection): void;
  chooseEntry(optionId: string | null): void;
  edit(change: (config: OrientationConfig) => OrientationConfig): void;
  create(): void;
  discard(): void;
  save(): void;
  remove(): void;
};

/**
 * The author's working copy of the orientation configuration.
 *
 * Editing happens here, in a draft: an unfinished question is not workspace content, so it
 * neither reaches the learner's flow nor the autosave queue. Accepting it is a single
 * content operation through the shared session, which is also what makes the draft
 * protected against an external update while it is unfinished.
 */
export function useOrientationDraft(
  content: WorkspaceContent,
  authoring: AuthoringCommands | undefined,
  workspaceId: string,
): OrientationDraft {
  const saved = content.orientation.status === 'absent' ? null : content.orientation.config;
  const savedText = useMemo(() => (saved ? serializeOrientationConfig(saved) : null), [saved]);
  const [draft, setDraft] = useState<OrientationConfig | null>(saved);
  const [selection, setSelection] = useState<OrientationSelection>({ kind: 'seed' });
  const [entryOptionId, setEntryOptionId] = useState<string | null>(null);
  const [failure, setFailure] = useState('');
  const draftText = useMemo(() => (draft ? serializeOrientationConfig(draft) : null), [draft]);
  const dirty = draftText !== savedText;
  const draftKey = `${workspaceId}:orientation`;

  // Accepted content wins whenever there is nothing unfinished to protect.
  useEffect(() => { if (!dirty) setDraft(saved); }, [savedText]);
  useEffect(() => { authoring?.protectDraft(draftKey, dirty); }, [authoring, dirty, draftKey]);
  useEffect(() => () => authoring?.protectDraft(draftKey, false), [authoring, draftKey]);

  const diagnostics = useMemo(() => (draft ? validateOrientationConfig(draft, content.graph, content.tags) : []),
    [content.graph, content.tags, draft]);

  const run = useCallback((action: () => void) => {
    setFailure('');
    try { action(); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  }, []);

  return {
    draft,
    saved,
    dirty,
    diagnostics,
    blocking: diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    failure,
    selection,
    entryOptionId,
    select: setSelection,
    chooseEntry: setEntryOptionId,
    edit(change) { run(() => setDraft((current) => (current ? change(current) : current))); },
    create() { setFailure(''); setDraft(emptyOrientationConfig()); setSelection({ kind: 'seed' }); },
    discard() { setFailure(''); setDraft(saved); },
    save() {
      run(() => {
        if (!authoring) throw new Error('当前工作区不可创作');
        if (!draft) throw new Error('没有可保存的开局配置');
        authoring.updateOrientation(draft);
      });
    },
    remove() {
      run(() => {
        if (!authoring) throw new Error('当前工作区不可创作');
        authoring.updateOrientation(null);
        setDraft(null);
      });
    },
  };
}
