import skill from './workspaceAssets/derivon-workspace/SKILL.md?raw';
import renderDocumentsScript from './workspaceAssets/derivon-workspace/scripts/render-documents.mjs?raw';
import mathAuthoringSkill from './workspaceAssets/derivon-math-authoring/SKILL.md?raw';
import auditMathPagesScript from './workspaceAssets/derivon-math-authoring/scripts/audit-math-pages.mjs?raw';
import model from './workspaceAssets/references/model.md?raw';
import referenceIndex from './workspaceAssets/references/README.md?raw';
import paper from './workspaceAssets/references/derivon-paper.md?raw';
import blog from './workspaceAssets/references/learning-route-hypergraph.md?raw';
import validator from './workspaceAssets/validate-workspace.mjs?raw';

export const WORKSPACE_AGENT_REFERENCE_SET = 'provisional-2026-08-26-skill-scripts';

export const WORKSPACE_AGENT_FILES: Readonly<Record<string, string>> = Object.freeze({
  '.agents/skills/derivon-workspace/SKILL.md': skill,
  '.agents/skills/derivon-workspace/scripts/render-documents.mjs': renderDocumentsScript,
  '.claude/skills/derivon-workspace/SKILL.md': skill,
  '.claude/skills/derivon-workspace/scripts/render-documents.mjs': renderDocumentsScript,
  '.github/skills/derivon-workspace/SKILL.md': skill,
  '.github/skills/derivon-workspace/scripts/render-documents.mjs': renderDocumentsScript,
  '.agents/skills/derivon-math-authoring/SKILL.md': mathAuthoringSkill,
  '.agents/skills/derivon-math-authoring/scripts/audit-math-pages.mjs': auditMathPagesScript,
  '.claude/skills/derivon-math-authoring/SKILL.md': mathAuthoringSkill,
  '.claude/skills/derivon-math-authoring/scripts/audit-math-pages.mjs': auditMathPagesScript,
  '.github/skills/derivon-math-authoring/SKILL.md': mathAuthoringSkill,
  '.github/skills/derivon-math-authoring/scripts/audit-math-pages.mjs': auditMathPagesScript,
  '.derivon/agent/references/README.md': referenceIndex,
  '.derivon/agent/references/model.md': model,
  '.derivon/agent/references/derivon-paper.md': paper,
  '.derivon/agent/references/learning-route-hypergraph.md': blog,
  '.derivon/agent/validate-workspace.mjs': validator,
});
