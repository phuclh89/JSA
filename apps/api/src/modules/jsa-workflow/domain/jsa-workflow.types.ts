import type { JsaVersionStatus } from '@jsams/shared-types';
export type WorkflowPermission =
  'submit' | 'approve' | 'return' | 'reject' | 'comment' | 'view' | 'admin';
export interface WorkflowTarget {
  jsaId: string;
  versionId: string;
  jsaNumber: string;
  jobTitle?: string;
  siteId: string;
  rigId: string;
  departmentId: string;
  jobTypeId: string;
  creatorUserId: string;
  masterStatus: string;
  versionStatus: JsaVersionStatus;
  masterRowVersion: string;
  versionRowVersion: string;
}
export interface WorkflowBindingRecord {
  bindingId: string;
  definitionId: string;
  definitionCode: string;
  definitionVersion: number;
  priority: number;
  specificity: number;
}
export interface WorkflowStepRecord {
  stepId: string;
  order: number;
  code: string;
  name: string;
  versionStatus: JsaVersionStatus;
  roleCode: string;
  optional: boolean;
  conditionType: 'ALWAYS' | 'TEST_FLAG' | 'RIG_MANAGER_CONFIG';
  conditionValue?: string;
}
export interface AssigneeRecord {
  userId: string;
  displayName: string;
  specificity: number;
}
export interface WorkflowRuntimeRecord {
  instanceId: string;
  cycleNumber: number;
  definitionId: string;
  bindingId: string;
  status: string;
  currentStepOrder?: number;
  currentTaskId?: string;
  assigneeUserId?: string;
  stepId?: string;
  versionStatus: JsaVersionStatus;
  target: WorkflowTarget;
}
export interface SaveWorkflowDefinitionInput {
  id?: string;
  rowVersion?: string;
  code: string;
  versionNumber: number;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  effectiveFrom?: string;
  effectiveTo?: string;
  steps: Array<{
    id?: string;
    order: number;
    code: string;
    name: string;
    versionStatus: JsaVersionStatus;
    roleCode: string;
    optional?: boolean;
    conditionType?: 'ALWAYS' | 'TEST_FLAG' | 'RIG_MANAGER_CONFIG';
    conditionValue?: string;
  }>;
  bindings: Array<{
    id?: string;
    siteId?: string;
    rigId?: string;
    departmentId?: string;
    jobTypeId?: string;
    priority: number;
    effectiveFrom: string;
    effectiveTo?: string;
    active: boolean;
  }>;
}
