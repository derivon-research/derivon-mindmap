import type { AuthoringModeProps } from '../../app/host';

/**
 * Authoring side, still empty, and desktop-only by construction: only the desktop host
 * imports this module. Creating a workspace and a first concept (#51), graph editing
 * (#52) and object document editing (#53) land inside this boundary.
 */
export function AuthoringMode({ workspace, selectedConceptId }: AuthoringModeProps) {
  return (
    <section
      className="mode-surface"
      data-derivon-mode="authoring"
      data-selected-concept={selectedConceptId ?? ''}
      aria-label="创作侧"
    >
      <p className="mode-surface-title">创作侧</p>
      <p className="mode-surface-note">
        工作区 <code>{workspace.name}</code> ·{' '}
        {selectedConceptId ? `选中 ${selectedConceptId}` : '还没有选中概念'}
      </p>
    </section>
  );
}
