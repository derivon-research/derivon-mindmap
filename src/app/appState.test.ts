import { describe, expect, it } from 'vitest';
import {
  canEnterMode,
  enterMode,
  initialAppState,
  openWorkspace,
  selectConcept,
  setLearningTargets,
  type AppState,
} from './appState';
import type { WorkspaceHandle } from './host';

const workspace: WorkspaceHandle = {
  id: '/home/author/math-reforged',
  name: 'math-reforged',
  source: {
    readGraph: async () => '{}',
    readDocument: async () => '',
    readAsset: async () => new Uint8Array(),
    readCompanionMetadata: async () => null,
  },
};

function desktopState(): AppState {
  return openWorkspace(
    initialAppState({ hostId: 'desktop', modes: ['authoring', 'learning'] }),
    workspace,
  );
}

function webState(): AppState {
  return openWorkspace(
    initialAppState({ hostId: 'web', modes: ['learning'], workspace }),
    workspace,
  );
}

describe('initialAppState', () => {
  it('starts the desktop host in authoring without a workspace', () => {
    const state = initialAppState({ hostId: 'desktop', modes: ['authoring', 'learning'] });
    expect(state.workspace).toBeNull();
    expect(state.mode).toBe('authoring');
    expect(state.visitedModes).toEqual([]);
  });

  it('starts the web host in learning with the workspace it was handed', () => {
    const state = initialAppState({ hostId: 'web', modes: ['learning'], workspace });
    expect(state.mode).toBe('learning');
    expect(state.workspace).toBe(workspace);
    expect(state.visitedModes).toEqual(['learning']);
  });

  it('refuses a host that offers no modes', () => {
    expect(() => initialAppState({ hostId: 'web', modes: [] })).toThrow(/at least one mode/);
  });
});

describe('mode availability', () => {
  it('reports authoring as unavailable on a web build', () => {
    const state = webState();
    expect(canEnterMode(state, 'authoring')).toBe(false);
    expect(canEnterMode(state, 'learning')).toBe(true);
  });

  it('rejects entering a mode the build does not contain', () => {
    expect(() => enterMode(webState(), 'authoring')).toThrow(/not available on the web host/);
  });

  it('rejects entering a mode before a workspace is open', () => {
    const state = initialAppState({ hostId: 'desktop', modes: ['authoring', 'learning'] });
    expect(() => enterMode(state, 'learning')).toThrow(/no workspace/);
  });
});

describe('opening a workspace', () => {
  it('lands in the first mode the host offers and records it as visited', () => {
    const state = desktopState();
    expect(state.workspace).toBe(workspace);
    expect(state.mode).toBe('authoring');
    expect(state.visitedModes).toEqual(['authoring']);
  });
});

describe('entering learning from authoring', () => {
  it('carries the concept selected in authoring as the learning target', () => {
    const state = enterMode(selectConcept(desktopState(), 'svd'), 'learning');
    expect(state.mode).toBe('learning');
    expect(state.learningTargetIds).toEqual(['svd']);
  });

  it('leaves the target empty when nothing is selected, so orientation can ask', () => {
    const state = enterMode(desktopState(), 'learning');
    expect(state.learningTargetIds).toEqual([]);
  });

  it('mounts each visited mode once so returning does not rebuild it', () => {
    const state = enterMode(enterMode(desktopState(), 'learning'), 'authoring');
    expect(state.visitedModes).toEqual(['authoring', 'learning']);
  });
});

describe('returning to authoring', () => {
  it('keeps the authoring selection', () => {
    const learning = enterMode(selectConcept(desktopState(), 'svd'), 'learning');
    const authoring = enterMode(learning, 'authoring');
    expect(authoring.mode).toBe('authoring');
    expect(authoring.selectedConceptId).toBe('svd');
  });

  it('keeps targets the learner changed inside learning when the selection has not moved', () => {
    const learning = setLearningTargets(
      enterMode(selectConcept(desktopState(), 'svd'), 'learning'),
      ['eigen', 'spectral-theorem'],
    );
    const backAndForth = enterMode(enterMode(learning, 'authoring'), 'learning');
    expect(backAndForth.learningTargetIds).toEqual(['eigen', 'spectral-theorem']);
  });

  it('carries a newly selected concept the next time learning is entered', () => {
    const learning = setLearningTargets(
      enterMode(selectConcept(desktopState(), 'svd'), 'learning'),
      ['eigen'],
    );
    const reselected = selectConcept(enterMode(learning, 'authoring'), 'schur-decomposition');
    expect(enterMode(reselected, 'learning').learningTargetIds).toEqual(['schur-decomposition']);
  });
});
