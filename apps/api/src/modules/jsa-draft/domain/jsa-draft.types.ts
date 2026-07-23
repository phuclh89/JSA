export interface CreateDraftInput {
  ownerSiteId: string;
  rigId: string;
  departmentId: string;
  jobTypeId: string;
  languageId?: string;
}
export interface UpdateDraftHeaderInput {
  rowVersion: string;
  versionRowVersion: string;
  jobTitle?: string;
  jobDescription?: string;
  location?: string;
  personnel?: string;
  ptwRequired?: boolean;
  ptwReference?: string;
  jobTypeId: string;
  languageId?: string;
}
export interface RiskInput {
  likelihoodId?: string;
  severityId?: string;
}
export interface ControlInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  text: string;
  displayOrder: number;
}
export interface HazardInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  text: string;
  displayOrder: number;
  initialRisk: RiskInput;
  residualRisk: RiskInput;
  controls: ControlInput[];
}
export interface TaskInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  parentRef?: string;
  number?: string;
  title: string;
  description?: string;
  displayOrder: number;
  hazards: HazardInput[];
}
export interface PromptInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  promptId: string;
  selected: boolean;
  responseNote?: string;
}
export interface CoverageInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  promptRef: string;
  hazardRef: string;
  controlRef?: string;
  note?: string;
}
export interface PositionInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  positionId: string;
  displayOrder: number;
}
export interface ToolInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  toolId: string;
  displayOrder: number;
}
export interface BasicStepInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  taskRef?: string;
  number?: string;
  text: string;
  displayOrder: number;
  noToolRequired: boolean;
  performers: PositionInput[];
  supervisors: PositionInput[];
  tools: ToolInput[];
}
export interface ProcedureInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  procedureReferenceId?: string;
  code?: string;
  title?: string;
  revision?: string;
  uri?: string;
  notes?: string;
  displayOrder: number;
}
export interface AttachmentInput {
  ref: string;
  id?: string;
  rowVersion?: string;
  fileName: string;
  contentType?: string;
  fileSize?: string;
  description?: string;
}
export interface SaveDraftContentInput {
  versionRowVersion: string;
  prompts: PromptInput[];
  tasks: TaskInput[];
  coverage: CoverageInput[];
  basicSteps: BasicStepInput[];
  procedureReferences: ProcedureInput[];
  attachments: AttachmentInput[];
}
export interface DraftAccessRecord {
  jsaId: string;
  versionId: string;
  siteId: string;
  rigId: string;
  departmentId: string;
  creatorUserId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  versionStatus: string;
  rowVersion: string;
  versionRowVersion: string;
}
export interface RiskSnapshot {
  likelihoodId: string;
  severityId: string;
  cellId: string;
  ratingCode?: string;
  resultCode: string;
  resultName: string;
  prohibited: boolean;
}
