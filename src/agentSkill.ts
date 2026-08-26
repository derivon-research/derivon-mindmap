import skill from './workspaceAssets/derivon-workspace/SKILL.md?raw';
import renderDocumentsScript from './workspaceAssets/derivon-workspace/scripts/render-documents.mjs?raw';
import learningGraphSkill from './workspaceAssets/derivon-learning-graph/SKILL.md?raw';
import sourceImportReference from './workspaceAssets/derivon-learning-graph/references/source-import.md?raw';
import weightCalibrationReference from './workspaceAssets/derivon-learning-graph/references/weight-calibration.md?raw';
import auditLearningGraphScript from './workspaceAssets/derivon-learning-graph/scripts/audit-learning-graph.mjs?raw';
import documentAuthoringSkill from './workspaceAssets/derivon-document-authoring/SKILL.md?raw';
import largeScaleDocumentAuthoring from './workspaceAssets/derivon-document-authoring/references/large-scale-authoring.md?raw';
import auditDocumentPagesScript from './workspaceAssets/derivon-document-authoring/scripts/audit-document-pages.mjs?raw';
import mathAuthoringSkill from './workspaceAssets/derivon-math-authoring/SKILL.md?raw';
import model from './workspaceAssets/references/model.md?raw';
import referenceIndex from './workspaceAssets/references/README.md?raw';
import paper from './workspaceAssets/references/derivon-paper.md?raw';
import blog from './workspaceAssets/references/learning-route-hypergraph.md?raw';
import validator from './workspaceAssets/validate-workspace.mjs?raw';

export const WORKSPACE_AGENT_REFERENCE_SET = 'provisional-2026-08-27-layered-skills';

export const WORKSPACE_AGENT_FILES: Readonly<Record<string, string>> = Object.freeze({
  '.agents/skills/derivon-workspace/SKILL.md': skill,
  '.agents/skills/derivon-workspace/scripts/render-documents.mjs': renderDocumentsScript,
  '.claude/skills/derivon-workspace/SKILL.md': skill,
  '.claude/skills/derivon-workspace/scripts/render-documents.mjs': renderDocumentsScript,
  '.github/skills/derivon-workspace/SKILL.md': skill,
  '.github/skills/derivon-workspace/scripts/render-documents.mjs': renderDocumentsScript,
  '.agents/skills/derivon-learning-graph/SKILL.md': learningGraphSkill,
  '.agents/skills/derivon-learning-graph/references/source-import.md': sourceImportReference,
  '.agents/skills/derivon-learning-graph/references/weight-calibration.md': weightCalibrationReference,
  '.agents/skills/derivon-learning-graph/scripts/audit-learning-graph.mjs': auditLearningGraphScript,
  '.claude/skills/derivon-learning-graph/SKILL.md': learningGraphSkill,
  '.claude/skills/derivon-learning-graph/references/source-import.md': sourceImportReference,
  '.claude/skills/derivon-learning-graph/references/weight-calibration.md': weightCalibrationReference,
  '.claude/skills/derivon-learning-graph/scripts/audit-learning-graph.mjs': auditLearningGraphScript,
  '.github/skills/derivon-learning-graph/SKILL.md': learningGraphSkill,
  '.github/skills/derivon-learning-graph/references/source-import.md': sourceImportReference,
  '.github/skills/derivon-learning-graph/references/weight-calibration.md': weightCalibrationReference,
  '.github/skills/derivon-learning-graph/scripts/audit-learning-graph.mjs': auditLearningGraphScript,
  '.agents/skills/derivon-document-authoring/SKILL.md': documentAuthoringSkill,
  '.agents/skills/derivon-document-authoring/references/large-scale-authoring.md': largeScaleDocumentAuthoring,
  '.agents/skills/derivon-document-authoring/scripts/audit-document-pages.mjs': auditDocumentPagesScript,
  '.claude/skills/derivon-document-authoring/SKILL.md': documentAuthoringSkill,
  '.claude/skills/derivon-document-authoring/references/large-scale-authoring.md': largeScaleDocumentAuthoring,
  '.claude/skills/derivon-document-authoring/scripts/audit-document-pages.mjs': auditDocumentPagesScript,
  '.github/skills/derivon-document-authoring/SKILL.md': documentAuthoringSkill,
  '.github/skills/derivon-document-authoring/references/large-scale-authoring.md': largeScaleDocumentAuthoring,
  '.github/skills/derivon-document-authoring/scripts/audit-document-pages.mjs': auditDocumentPagesScript,
  '.agents/skills/derivon-math-authoring/SKILL.md': mathAuthoringSkill,
  '.claude/skills/derivon-math-authoring/SKILL.md': mathAuthoringSkill,
  '.github/skills/derivon-math-authoring/SKILL.md': mathAuthoringSkill,
  '.derivon/agent/references/README.md': referenceIndex,
  '.derivon/agent/references/model.md': model,
  '.derivon/agent/references/derivon-paper.md': paper,
  '.derivon/agent/references/learning-route-hypergraph.md': blog,
  '.derivon/agent/validate-workspace.mjs': validator,
});
