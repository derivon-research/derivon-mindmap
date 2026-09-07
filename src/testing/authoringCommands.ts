import { vi } from 'vitest';
import type { AuthoringCommands } from '../synchronization';

/**
 * A stand-in for the authoring write capability, for tests about what a surface *asks*
 * rather than what a workspace does. Every command is a spy; override the ones the test
 * is actually about.
 *
 * It exists so that adding a command to `AuthoringCommands` is one edit rather than one
 * per test file. A test that needs real content operations should open a session over a
 * memory source instead of overriding half of these.
 */
export function fakeAuthoringCommands(overrides: Partial<AuthoringCommands> = {}): AuthoringCommands {
  return {
    createConcept: vi.fn(() => ''),
    createDerivation: vi.fn(() => ''),
    updateDocument: vi.fn(),
    repairReferences: vi.fn(),
    restoreDocument: vi.fn(),
    referenceImpact: vi.fn(),
    updateObjectMetadata: vi.fn(),
    updateDerivationStructure: vi.fn(),
    updateConceptTags: vi.fn(),
    updateTagDeclarations: vi.fn(),
    updateOrientation: vi.fn(),
    protectDraft: vi.fn(),
    ...overrides,
  };
}
