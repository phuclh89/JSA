import type {
  JsaCopyMatrixSummary,
  JsaCopyOrganizationSummary,
  JsaCopyReferenceMapping,
  JsaCopyResult,
  JsaCopySourceSummary,
  JsaRiskCopyMode,
} from '@jsams/shared-types';

export interface CopySourceRecord extends JsaCopySourceSummary {
  lifecycleStatus: string;
  versionStatus?: string;
  currentVersionId?: string;
  currentVersionPointer?: string;
  matrix?: JsaCopyMatrixSummary;
}

export interface CopyDestinationResolution {
  destination?: JsaCopyOrganizationSummary;
  matrix?: JsaCopyMatrixSummary;
  matrixComplete: boolean;
  languageId?: string;
  englishCount: number;
  promptCandidates: CopyReferenceCandidate[];
  positionCandidates: CopyReferenceCandidate[];
  toolCandidates: CopyReferenceCandidate[];
}

export interface CopyReferenceCandidate {
  id: string;
  code: string;
  name: string;
}

export interface CopyPromptRow {
  id: string;
  code: string;
  name: string;
  responseNote?: string;
}
export interface CopyTaskRow {
  id: string;
  parentId?: string;
  number?: string;
  title: string;
  description?: string;
  displayOrder: number;
}
export interface CopyHazardRow {
  id: string;
  taskId: string;
  text: string;
  displayOrder: number;
  initialLikelihoodId?: string;
  initialSeverityId?: string;
  initialCellId?: string;
  initialRatingCode?: string;
  initialResultCode?: string;
  initialResultName?: string;
  initialProhibited?: boolean;
  residualLikelihoodId?: string;
  residualSeverityId?: string;
  residualCellId?: string;
  residualRatingCode?: string;
  residualResultCode?: string;
  residualResultName?: string;
  residualProhibited?: boolean;
}
export interface CopyControlRow {
  id: string;
  hazardId: string;
  text: string;
  displayOrder: number;
}
export interface CopyBasicStepRow {
  id: string;
  taskId?: string;
  number?: string;
  text: string;
  displayOrder: number;
  noToolRequired: boolean;
}
export interface CopyPositionAssignmentRow {
  id: string;
  stepId: string;
  code: string;
  name: string;
  displayOrder: number;
}
export interface CopyToolAssignmentRow extends CopyPositionAssignmentRow {
  noToolRequired: boolean;
}
export interface CopyAggregate {
  prompts: CopyPromptRow[];
  tasks: CopyTaskRow[];
  hazards: CopyHazardRow[];
  controls: CopyControlRow[];
  steps: CopyBasicStepRow[];
  performers: CopyPositionAssignmentRow[];
  supervisors: CopyPositionAssignmentRow[];
  tools: CopyToolAssignmentRow[];
  attachmentNames: string[];
  promptCoverageCount: number;
  procedureReferenceCount: number;
  legacyHeaderPresent: boolean;
  invalidRiskReferenceCount: number;
}

export interface CopyMappingPlan {
  prompts: JsaCopyReferenceMapping[];
  performers: JsaCopyReferenceMapping[];
  supervisors: JsaCopyReferenceMapping[];
  tools: JsaCopyReferenceMapping[];
}

export interface CopyExecutionPlan {
  source: CopySourceRecord;
  destination: JsaCopyOrganizationSummary;
  sourceMatrix: JsaCopyMatrixSummary;
  destinationMatrix: JsaCopyMatrixSummary;
  languageId: string;
  aggregate: CopyAggregate;
  mappings: CopyMappingPlan;
  riskCopyMode: JsaRiskCopyMode;
}

export interface CopyRequestIdentity {
  requestKey: string;
  requestHash: string;
  reason: string;
}

export interface ExistingCopyRequest {
  requestHash: string;
  result: JsaCopyResult;
}
