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
    mode: 'development' | 'ldap';
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

export type OrganizationKind = 'rigs' | 'departments';

export interface OrganizationRecord {
  id: string;
  kind: OrganizationKind;
  code: string;
  name: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  rigId?: string;
  rigCode?: string;
  rigName?: string;
  active: boolean;
  rowVersion: string;
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
  versionNumber?: number;
  jsaNumber: string;
  lifecycleStatus: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  versionStatus: JsaVersionStatus;
  ownerSiteId: string;
  ownerSiteCode: string;
  ownerSiteName: string;
  rigId: string;
  rigCode: string;
  rigName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  jobTypeId?: string;
  matrixVersionId: string;
  languageId: string;
  languageCode?: string;
  languageName?: string;
  publishedAt?: string;
  jobTitle?: string;
  jobDescription?: string;
  ptwRequired: boolean;
  ptwReference?: string;
  creatorUserId: string;
  currentVersionId?: string;
  workingVersionId?: string;
  workingVersionStatus?: JsaVersionStatus;
  baseVersionId?: string;
  checkedOutByUserId?: string;
  checkedOutByUsername?: string;
  checkedOutByDisplayName?: string;
  checkedOutAt?: string;
  rowVersion: string;
  versionRowVersion: string;
}
export interface JsaDraftListItem {
  jsaId: string;
  versionId: string;
  jsaNumber: string;
  jobTitle?: string;
  versionStatus: 'DRAFT' | 'RETURNED';
  ownerSiteCode: string;
  ownerSiteName: string;
  rigCode: string;
  rigName: string;
  departmentCode: string;
  departmentName: string;
  updatedAt: string;
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
  libraryAssetVersionId?: string;
  fileName: string;
  contentType?: string;
  fileSize?: string;
  storageKey?: string;
  status: 'METADATA_ONLY' | 'STORED' | 'FAILED' | 'REMOVED';
  description?: string;
  rowVersion: string;
}

export interface AttachmentLibraryFolder {
  id: string;
  siteId: string;
  rigId: string;
  departmentId: string;
  parentFolderId?: string;
  name: string;
  active: boolean;
  rowVersion: string;
}

export interface AttachmentLibraryAsset {
  id: string;
  folderId: string;
  name: string;
  description?: string;
  currentVersionId: string;
  versionNumber: number;
  originalFileName: string;
  contentType: string;
  fileSize: string;
  sha256: string;
  active: boolean;
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
  | 'SUPERSEDED'
  | 'CANCELLED';

export type JsaVersioningCapability = 'update' | 'compare' | 'undoCheckout';
export interface JsaVersioningCapabilities {
  update: boolean;
  compare: boolean;
  undoCheckout: boolean;
  configured: boolean;
  unavailableReason?: string;
}
export type JsaChangeType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'MOVED' | 'UNCHANGED';
export interface JsaFieldChange {
  field: string;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
}
export interface JsaVersionChange {
  entityType: string;
  logicalKey: string;
  changeType: JsaChangeType;
  label: string;
  fields: JsaFieldChange[];
  oldPosition?: string;
  newPosition?: string;
}
export interface JsaVersionCompare {
  jsaId: string;
  baseVersionId: string;
  workingVersionId: string;
  summary: Record<JsaChangeType, number>;
  changes: JsaVersionChange[];
}
export interface JsaVersionHistoryItem {
  versionId: string;
  versionNumber: number;
  versionLabel?: string;
  baseVersionId?: string;
  status: JsaVersionStatus;
  matrixVersionId: string;
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
  publishedByUsername?: string;
}
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
  baseVersionId?: string;
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
  ownerSiteCode: string;
  ownerSiteName: string;
  rigCode: string;
  rigName: string;
  departmentCode: string;
  departmentName: string;
  versionStatus: JsaVersionStatus;
  currentStepName?: string;
  assignedAt?: string;
  publishedAt?: string;
  publishedByUsername?: string;
  updatedAt: string;
}
export interface WorkflowNavigationCounts {
  drafts: number;
  approvals: number;
  pending: number;
  rejected: number;
  published: number;
  favorites?: number;
  all?: number;
}

export type JsaBrowseKind =
  'published' | 'favorites' | 'all' | 'drafts' | 'approvals' | 'pending' | 'rejected';
export type JsaSearchField =
  | 'ALL'
  | 'JSA_NUMBER'
  | 'JOB_TITLE'
  | 'TASK'
  | 'HAZARD'
  | 'CONTROL'
  | 'PROMPT'
  | 'CREATOR'
  | 'APPROVER';
export type JsaRiskStage = 'INITIAL' | 'RESIDUAL' | 'EITHER';
export interface JsaBrowseItem {
  jsaId: string;
  versionId: string;
  jsaNumber: string;
  jobTitle?: string;
  ownerSiteId: string;
  ownerSiteCode: string;
  ownerSiteName: string;
  rigId: string;
  rigCode: string;
  rigName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  currentStatus?: JsaVersionStatus;
  workingStatus?: JsaVersionStatus;
  displayStatus: JsaVersionStatus;
  matrixVersionId: string;
  creatorUsername: string;
  publishedByUsername?: string;
  currentStepName?: string;
  createdAt: string;
  publishedAt?: string;
  updatedAt: string;
  favorite: boolean;
  publishedTranslationCount: number;
  matchedFields: JsaSearchField[];
  matchedVersionKinds: Array<'CURRENT' | 'WORKING'>;
}
export interface JsaBrowseResult {
  items: JsaBrowseItem[];
  page: number;
  pageSize: number;
  total: number;
}
export interface JsaBrowseFacets {
  sites: Array<{ id: string; code: string; name: string }>;
  departments: Array<{ id: string; code: string; name: string }>;
  matrixVersions: Array<{ id: string; code: string; name: string }>;
}
export interface JsaBrowseCapabilities {
  view: boolean;
  favorite: boolean;
  favoriteConfigured: boolean;
  unavailableReason?: string;
}

export type JsaRiskCopyMode = 'PRESERVED' | 'CLEARED';
export type JsaCopyMappingStatus = 'MAPPED' | 'MISSING' | 'AMBIGUOUS';
export interface JsaCopyIssue {
  code: string;
  message: string;
  context?: Record<string, string | number | boolean>;
}
export interface JsaCopyOrganizationSummary {
  siteId: string;
  siteCode: string;
  siteName: string;
  rigId: string;
  rigCode: string;
  rigName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
}
export interface JsaCopyMatrixSummary {
  id: string;
  code: string;
  name: string;
  versionCode: string;
  dimension: number;
}
export interface JsaCopySourceSummary extends JsaCopyOrganizationSummary {
  jsaId: string;
  versionId: string;
  jsaNumber: string;
  jobTitle?: string;
  versionNumber: number;
  versionLabel?: string;
}
export interface JsaCopyReferenceMapping {
  sourceCode: string;
  sourceName: string;
  status: JsaCopyMappingStatus;
  occurrenceCount: number;
  destinationId?: string;
  destinationCode?: string;
  destinationName?: string;
}
export interface JsaCopyContentCounts {
  prompts: number;
  tasks: number;
  hazards: number;
  controls: number;
  basicSteps: number;
  performers: number;
  supervisors: number;
  tools: number;
}
export interface JsaCopyPreflight {
  source: JsaCopySourceSummary;
  destination: JsaCopyOrganizationSummary;
  sourceMatrix?: JsaCopyMatrixSummary;
  destinationMatrix?: JsaCopyMatrixSummary;
  riskCopyMode: JsaRiskCopyMode;
  matrixReassessmentRequired: boolean;
  counts: JsaCopyContentCounts;
  promptMappings: JsaCopyReferenceMapping[];
  performerMappings: JsaCopyReferenceMapping[];
  supervisorMappings: JsaCopyReferenceMapping[];
  toolMappings: JsaCopyReferenceMapping[];
  excludedAttachments: { count: number; names: string[] };
  intentionallyNotCopied: string[];
  blockers: JsaCopyIssue[];
  warnings: JsaCopyIssue[];
  canCopy: boolean;
}
export interface JsaCopyDestinationOptions {
  localSite: { id: string; code: string; name: string };
  rigs: Array<{ id: string; code: string; name: string; siteId: string }>;
  departments: Array<{
    id: string;
    code: string;
    name: string;
    siteId: string;
    rigId: string;
  }>;
}
export interface JsaCopyCapabilities {
  view: boolean;
  create: boolean;
  copy: boolean;
  configured: boolean;
  unavailableReason?: string;
}
export interface JsaCopyResult {
  destinationJsaId: string;
  destinationWorkingVersionId: string;
  temporaryJsaNumber: string;
  destination: JsaCopyOrganizationSummary;
  sourceJsaId: string;
  sourceVersionId: string;
  sourceJsaNumber: string;
  sourceMatrix: JsaCopyMatrixSummary;
  destinationMatrix: JsaCopyMatrixSummary;
  riskCopyMode: JsaRiskCopyMode;
  matrixReassessmentRequired: boolean;
  excludedAttachmentCount: number;
  promptWarningCount: number;
  masterRowVersion: string;
  versionRowVersion: string;
  route: string;
  idempotentReplay: boolean;
}
export interface JsaCopyProvenance {
  destinationJsaId: string;
  destinationVersionId: string;
  sourceJsaId: string;
  sourceVersionId: string;
  sourceJsaNumber: string;
  sourceSiteId: string;
  sourceSiteCode: string;
  sourceSiteName: string;
  sourceRigId: string;
  sourceRigCode: string;
  sourceRigName: string;
  sourceVersionNumber: number;
  sourceVersionLabel?: string;
  copiedByUserId: string;
  copiedByUsername: string;
  copiedByDisplayName?: string;
  copiedAt: string;
  copyReason: string;
  riskCopyMode: JsaRiskCopyMode;
  matrixReassessmentRequired: boolean;
  excludedAttachmentCount: number;
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

export type TranslationStatus =
  'ASSIGNED' | 'IN_TRANSLATION' | 'STC_REVIEW' | 'RETURNED' | 'PUBLISHED' | 'OUTDATED';

export interface TranslationCapabilities {
  view: boolean;
  assign: boolean;
  translate: boolean;
  approve: boolean;
  print: boolean;
  configured: boolean;
  unavailableReason?: string;
}

export interface TranslationCandidate {
  userId: string;
  username: string;
  displayName: string;
}

export interface TranslationSegment {
  id: string;
  entityType: string;
  sourceEntityId: string;
  sourceLogicalKey: string;
  fieldCode: string;
  sectionCode: string;
  displayOrder: number;
  required: boolean;
  sourceText: string;
  sourceTextHash: string;
  translatedText?: string;
  rowVersion: string;
}

export interface TranslationListItem {
  translationId: string;
  jsaId: string;
  sourceVersionId: string;
  jsaNumber: string;
  jobTitle?: string;
  targetLanguageId: string;
  targetLanguageCode: string;
  targetLanguageName: string;
  status: TranslationStatus;
  cycleNumber: number;
  translatorUserId: string;
  translatorDisplayName: string;
  stcReviewerUserId?: string;
  stcReviewerDisplayName?: string;
  sourceVersionNumber: number;
  sourceVersionLabel?: string;
  replacementVersionId?: string;
  assignedAt: string;
  submittedAt?: string;
  publishedAt?: string;
  outdatedAt?: string;
  updatedAt: string;
  rowVersion: string;
}

export interface PublishedTranslationOption {
  translationId: string;
  targetLanguageCode: string;
  targetLanguageName: string;
  sourceVersionNumber: number;
  sourceVersionLabel?: string;
  publishedAt: string;
}

export type TranslationListResult = PaginatedResponse<TranslationListItem>;

export interface TranslationAction {
  id: string;
  action: string;
  actorUserId: string;
  actorUsername: string;
  actorDisplayName: string;
  fromStatus?: TranslationStatus;
  toStatus?: TranslationStatus;
  comment?: string;
  cycleNumber: number;
  actionAt: string;
}

export interface TranslationDetail extends TranslationListItem {
  ownerSiteId: string;
  rigId: string;
  departmentId: string;
  sourceLanguageCode: string;
  sourceContentHash: string;
  translatedContentHash?: string;
  editable: boolean;
  reviewable: boolean;
  printable: boolean;
  segments: TranslationSegment[];
  actions: TranslationAction[];
}

export interface TranslationNavigationCounts {
  translationTasks: number;
  translationReviews: number;
}
