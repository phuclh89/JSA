import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type {
  AssigneeRecord,
  SaveWorkflowDefinitionInput,
  WorkflowBindingRecord,
  WorkflowRuntimeRecord,
  WorkflowStepRecord,
  WorkflowTarget,
} from './jsa-workflow.types';
export const JSA_WORKFLOW_REPOSITORY = Symbol('JSA_WORKFLOW_REPOSITORY');
export interface JsaWorkflowRepository {
  target(
    context: OracleTransactionContext,
    jsaId: string,
    lock?: boolean,
  ): Promise<WorkflowTarget | undefined>;
  bindings(
    context: OracleTransactionContext,
    target: WorkflowTarget,
  ): Promise<WorkflowBindingRecord[]>;
  steps(context: OracleTransactionContext, definitionId: string): Promise<WorkflowStepRecord[]>;
  assignees(
    context: OracleTransactionContext,
    target: WorkflowTarget,
    roleCode: string,
    approvePermission: string,
  ): Promise<AssigneeRecord[]>;
  submissionIssues(context: OracleTransactionContext, versionId: string): Promise<string[]>;
  runtime(
    context: OracleTransactionContext,
    jsaId: string,
    lock?: boolean,
  ): Promise<WorkflowRuntimeRecord | undefined>;
  begin(
    context: OracleTransactionContext,
    target: WorkflowTarget,
    binding: WorkflowBindingRecord,
    step: WorkflowStepRecord,
    assigneeId: string,
    userId: string,
    username: string,
    correlationId: string,
  ): Promise<string>;
  resubmit(
    context: OracleTransactionContext,
    runtime: WorkflowRuntimeRecord,
    step: WorkflowStepRecord,
    assigneeId: string,
    userId: string,
    username: string,
    correlationId: string,
  ): Promise<void>;
  action(
    context: OracleTransactionContext,
    runtime: WorkflowRuntimeRecord,
    action: 'APPROVE' | 'RETURN' | 'REJECT' | 'COMMENT',
    comment: string | undefined,
    next: WorkflowStepRecord | undefined,
    nextAssigneeId: string | undefined,
    userId: string,
    username: string,
    correlationId: string,
  ): Promise<void>;
  listQueue(
    context: OracleTransactionContext,
    kind: 'approvals' | 'pending' | 'rejected' | 'published',
    userId: string,
  ): Promise<any[]>;
  detail(context: OracleTransactionContext, jsaId: string): Promise<any | undefined>;
  definitions(context: OracleTransactionContext): Promise<any[]>;
  saveDefinition(
    context: OracleTransactionContext,
    input: SaveWorkflowDefinitionInput,
    actor: string,
  ): Promise<string>;
  roleAssignments(context: OracleTransactionContext): Promise<any[]>;
  saveRoleAssignment(
    context: OracleTransactionContext,
    input: {
      id?: string;
      rowVersion?: string;
      workflowRoleCode: string;
      userId: string;
      siteId: string;
      rigId?: string;
      departmentId?: string;
      effectiveFrom: string;
      effectiveTo?: string;
      active: boolean;
    },
    actor: string,
  ): Promise<string>;
  notifications(context: OracleTransactionContext, userId: string): Promise<any[]>;
}
