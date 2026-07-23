export interface AuthenticatedUser {
  userId: string;
  enterpriseIdentityKey: string;
  username: string;
  displayName: string;
  email?: string;
  defaultSiteId?: string;
  defaultRigId?: string;
  defaultDepartmentId?: string;
  roles: string[];
  permissions: string[];
  permissionOverrides: PermissionOverride[];
  dataScopes: DataScope[];
  authentication: {
    mode: 'development' | 'oidc';
    sessionExpiresAt?: string;
  };
}

export interface PermissionOverride {
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
}

export interface DataScope {
  scopeType: 'SITE' | 'RIG' | 'DEPARTMENT';
  siteId: string;
  rigId?: string;
  departmentId?: string;
  canView: boolean;
  canAct: boolean;
}

export interface SessionState {
  status: 'authenticated';
  user: AuthenticatedUser;
}

export interface DependencyCheck {
  status: 'up' | 'down';
  durationMs?: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  timestamp: string;
  checks: { application: DependencyCheck; oracle?: DependencyCheck };
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details: unknown[] };
  correlationId: string;
}

export type ReferenceScopeType = 'GLOBAL' | 'SITE' | 'RIG' | 'DEPARTMENT';

export interface ReferenceScope {
  scopeType: ReferenceScopeType;
  siteId?: string;
  rigId?: string;
  departmentId?: string;
}

export interface MasterDataRecord extends ReferenceScope {
  id: string;
  kind: MasterDataKind;
  code: string;
  name: string;
  description?: string;
  displayOrder: number;
  active: boolean;
  rowVersion: string;
  attributes: Record<string, string | number | boolean | null>;
}

export type MasterDataKind =
  | 'job-types'
  | 'hazard-prompts'
  | 'positions'
  | 'tool-categories'
  | 'tools'
  | 'languages'
  | 'procedure-references'
  | 'system-parameters';

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface OrganizationOption {
  id: string;
  code: string;
  name: string;
  siteId?: string;
  rigId?: string;
}

export interface RiskMatrixSummary {
  id: string;
  code: string;
  name: string;
  dimension: 3 | 5;
  description?: string;
  active: boolean;
  rowVersion: string;
  versionCount: number;
}

export interface RiskAxisLevel {
  id: string;
  code: string;
  label: string;
  numericValue: number | null;
  displayOrder: number;
  definition: string;
  peopleDefinition?: string;
  assetDefinition?: string;
  environmentDefinition?: string;
  active: boolean;
  rowVersion: string;
}

export interface RiskResultDefinition {
  id: string;
  code: string;
  name: string;
  description?: string;
  semanticCategory?: string;
  displayOrder: number;
  displayColor?: string;
  guidanceText?: string;
  prohibited: boolean;
  active: boolean;
  rowVersion: string;
}

export interface RiskMatrixCell {
  id: string;
  likelihoodId: string;
  severityId: string;
  ratingCode: string | null;
  ratingValue: number | null;
  riskResultId: string;
  riskResultCode: string;
  riskResultName: string;
  displayColor?: string;
  guidanceText?: string;
  active: boolean;
  rowVersion: string;
}

export interface MatrixValidationIssue {
  code: string;
  message: string;
}

export interface MissingMatrixCell {
  likelihoodId: string;
  likelihoodCode: string;
  severityId: string;
  severityCode: string;
}

export interface MatrixCompletenessResult {
  complete: boolean;
  expectedCellCount: number;
  actualCellCount: number;
  missingCells: MissingMatrixCell[];
  errors: MatrixValidationIssue[];
}

export interface RiskMatrixVersionDetail {
  id: string;
  matrixId: string;
  matrixCode: string;
  matrixName: string;
  dimension: 3 | 5;
  versionCode: string;
  description?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  active: boolean;
  immutable: boolean;
  rowVersion: string;
  likelihoods: RiskAxisLevel[];
  severities: RiskAxisLevel[];
  results: RiskResultDefinition[];
  cells: RiskMatrixCell[];
  completeness: MatrixCompletenessResult;
}

export interface RiskMatrixVersionOption {
  id: string;
  matrixId: string;
  matrixCode: string;
  versionCode: string;
  dimension: 3 | 5;
  complete: boolean;
  active: boolean;
  immutable: boolean;
}

export interface RigMatrixAssignment {
  id: string;
  siteId: string;
  rigId: string;
  rigCode: string;
  matrixVersionId: string;
  matrixCode: string;
  versionCode: string;
  dimension: 3 | 5;
  effectiveFrom: string;
  effectiveTo?: string;
  reason: string;
  active: boolean;
  rowVersion: string;
}

export type JsaDraftCapability = 'view' | 'create' | 'edit' | 'cancel';
export interface JsaDraftCapabilities {
  view: boolean;
  create: boolean;
  edit: boolean;
  cancel: boolean;
  configured: boolean;
  unavailableReason?: string;
}
export interface JsaDraftHeader {
  jsaId: string;
  versionId: string;
  jsaNumber: string;
  lifecycleStatus: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  versionStatus: JsaVersionStatus;
  ownerSiteId: string;
  rigId: string;
  departmentId: string;
  jobTypeId: string;
  matrixVersionId: string;
  languageId?: string;
  jobTitle?: string;
  jobDescription?: string;
  location?: string;
  personnel?: string;
  ptwRequired: boolean;
  ptwReference?: string;
  creatorUserId: string;
  rowVersion: string;
  versionRowVersion: string;
}
export interface JsaDraftPrompt {
  id: string;
  logicalKey: string;
  promptId: string;
  code: string;
  label: string;
  selected: boolean;
  responseNote?: string;
  rowVersion: string;
}
export interface JsaDraftControl {
  id: string;
  logicalKey: string;
  text: string;
  displayOrder: number;
  rowVersion: string;
}
export interface JsaRiskSelection {
  likelihoodId?: string;
  severityId?: string;
  cellId?: string;
  ratingCode?: string;
  resultCode?: string;
  resultName?: string;
  prohibited?: boolean;
}
export interface JsaDraftHazard {
  id: string;
  logicalKey: string;
  text: string;
  displayOrder: number;
  initialRisk: JsaRiskSelection;
  residualRisk: JsaRiskSelection;
  controls: JsaDraftControl[];
  rowVersion: string;
}
export interface JsaDraftTask {
  id: string;
  logicalKey: string;
  parentTaskId?: string;
  number?: string;
  title: string;
  description?: string;
  displayOrder: number;
  hazards: JsaDraftHazard[];
  rowVersion: string;
}
export interface JsaPositionSnapshot {
  id: string;
  logicalKey: string;
  positionId: string;
  code: string;
  name: string;
  displayOrder: number;
  rowVersion: string;
}
export interface JsaToolSnapshot {
  id: string;
  logicalKey: string;
  toolId: string;
  code: string;
  name: string;
  displayOrder: number;
  rowVersion: string;
}
export interface JsaDraftBasicStep {
  id: string;
  logicalKey: string;
  taskId?: string;
  number?: string;
  text: string;
  displayOrder: number;
  noToolRequired: boolean;
  performers: JsaPositionSnapshot[];
  supervisors: JsaPositionSnapshot[];
  tools: JsaToolSnapshot[];
  rowVersion: string;
}
export interface JsaDraftProcedureReference {
  id: string;
  logicalKey: string;
  procedureReferenceId?: string;
  code: string;
  title: string;
  revision?: string;
  uri?: string;
  notes?: string;
  displayOrder: number;
  rowVersion: string;
}
export interface JsaDraftAttachment {
  id: string;
  logicalKey: string;
  fileName: string;
  contentType?: string;
  fileSize?: string;
  storageKey?: string;
  status: 'METADATA_ONLY' | 'STORED' | 'FAILED' | 'REMOVED';
  description?: string;
  rowVersion: string;
}
export interface JsaPromptCoverage {
  id: string;
  logicalKey: string;
  promptId: string;
  hazardId: string;
  controlId?: string;
  note?: string;
  rowVersion: string;
}
export interface JsaDraftDetail extends JsaDraftHeader {
  prompts: JsaDraftPrompt[];
  tasks: JsaDraftTask[];
  basicSteps: JsaDraftBasicStep[];
  promptCoverage: JsaPromptCoverage[];
  procedureReferences: JsaDraftProcedureReference[];
  attachments: JsaDraftAttachment[];
  matrix: RiskMatrixVersionDetail;
  editable: boolean;
}
export interface JsaValidationIssue {
  code: string;
  section: 'GENERAL' | 'PROMPTS' | 'RISK' | 'BASIC_STEPS' | 'REFERENCES' | 'SYSTEM';
  entityType?: string;
  entityId?: string;
  field?: string;
  message: string;
}
export interface JsaValidationResult {
  valid: boolean;
  errors: JsaValidationIssue[];
  warnings: JsaValidationIssue[];
  generatedAt: string;
}
export type JsaVersionStatus =
  | 'DRAFT'
  | 'DEPARTMENT_HEAD_REVIEW'
  | 'STC_REVIEW'
  | 'OIM_REVIEW'
  | 'RIG_MANAGER_REVIEW'
  | 'RETURNED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'CANCELLED';
export type WorkflowActionCode =
  'SUBMIT' | 'RESUBMIT' | 'APPROVE' | 'RETURN' | 'REJECT' | 'COMMENT' | 'PUBLISH';
export interface WorkflowStepPreview {
  stepId: string;
  stepOrder: number;
  stepCode: string;
  stepName: string;
  versionStatus: JsaVersionStatus;
  workflowRoleCode: string;
  assigneeUserId: string;
  assigneeName: string;
}
export interface WorkflowPreview {
  configured: boolean;
  definitionId?: string;
  definitionCode?: string;
  definitionVersion?: number;
  bindingId?: string;
  steps: WorkflowStepPreview[];
  errors: string[];
}
export interface WorkflowActionHistory {
  id: string;
  action: WorkflowActionCode;
  actorUserId: string;
  actorUsername: string;
  fromStatus?: string;
  toStatus?: string;
  comment?: string;
  actionAt: string;
  cycleNumber: number;
}
export interface WorkflowInstanceDetail {
  instanceId: string;
  jsaId: string;
  versionId: string;
  jsaNumber: string;
  jobTitle?: string;
  ownerSiteId: string;
  rigId: string;
  departmentId: string;
  creatorUserId: string;
  status: 'ACTIVE' | 'RETURNED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  versionStatus: JsaVersionStatus;
  currentStepOrder?: number;
  cycleNumber: number;
  currentTaskId?: string;
  currentAssigneeUserId?: string;
  currentStepName?: string;
  actions: WorkflowActionHistory[];
}
export interface WorkflowQueueItem {
  instanceId: string;
  jsaId: string;
  jsaNumber: string;
  jobTitle?: string;
  versionStatus: JsaVersionStatus;
  currentStepName?: string;
  assignedAt?: string;
  updatedAt: string;
}
export interface WorkflowDefinitionSummary {
  id: string;
  code: string;
  versionNumber: number;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  effectiveFrom?: string;
  effectiveTo?: string;
  rowVersion: string;
  stepCount: number;
  bindingCount: number;
}
export interface WorkflowRoleAssignment {
  id: string;
  workflowRoleCode: string;
  userId: string;
  userName: string;
  siteId: string;
  rigId?: string;
  departmentId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
  rowVersion: string;
}
export interface NotificationItem {
  id: string;
  type: string;
  subject: string;
  body: string;
  targetType: string;
  targetId: string;
  read: boolean;
  createdAt: string;
}
