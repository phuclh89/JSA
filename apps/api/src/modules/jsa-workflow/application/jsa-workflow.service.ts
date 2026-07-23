import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, WorkflowPreview } from '@jsams/shared-types';
import {
  DataScopeDeniedError,
  ResourceNotFoundError,
  StateConflictError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { correlationContext } from '../../../common/interceptors/correlation-context';
import { OracleService } from '../../../common/oracle/oracle.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { SecurityAuditService } from '../../security/application/security-audit.service';
import {
  JSA_WORKFLOW_REPOSITORY,
  type JsaWorkflowRepository,
} from '../domain/jsa-workflow.repository';
import type {
  SaveWorkflowDefinitionInput,
  WorkflowStepRecord,
  WorkflowTarget,
} from '../domain/jsa-workflow.types';
import { JsaWorkflowCapabilityService } from './jsa-workflow-capability.service';
@Injectable()
export class JsaWorkflowService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(JSA_WORKFLOW_REPOSITORY) private readonly repository: JsaWorkflowRepository,
    private readonly capabilities: JsaWorkflowCapabilityService,
    private readonly scopes: DataScopeService,
    private readonly config: ConfigService,
    private readonly audit: SecurityAuditService,
  ) {}
  capabilityState(user: AuthenticatedUser) {
    return this.capabilities.state(user);
  }
  async preview(jsaId: string, user: AuthenticatedUser): Promise<WorkflowPreview> {
    this.capabilities.require(user, 'view');
    return this.oracle.withTransaction(async (c) => {
      const target = await this.repository.target(c, jsaId);
      if (!target) throw new ResourceNotFoundError('Working JSA was not found');
      this.scope(user, target, 'VIEW');
      return this.resolve(c, target);
    });
  }
  async submit(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'submit');
    await this.oracle.withTransaction(async (c) => {
      const target = await this.repository.target(c, jsaId, true);
      if (!target) throw new ResourceNotFoundError('Working JSA was not found');
      this.scope(user, target, 'ACT');
      if (target.creatorUserId !== user.userId)
        throw new StateConflictError('Only the JSA creator may submit or resubmit');
      if (!['DRAFT', 'RETURNED'].includes(target.versionStatus))
        throw new StateConflictError('Only Draft or Returned JSA Versions may be submitted');
      const issues = await this.repository.submissionIssues(c, target.versionId);
      if (issues.length)
        throw new ValidationError(
          'JSA is not ready for approval',
          issues.map((message) => ({ message })),
        );
      const preview = await this.resolve(c, target);
      if (
        !preview.configured ||
        !preview.bindingId ||
        !preview.definitionId ||
        !preview.steps.length
      )
        throw new StateConflictError(preview.errors.join('; ') || 'No workflow is configured');
      const first = preview.steps[0]!;
      const binding = {
        bindingId: preview.bindingId,
        definitionId: preview.definitionId,
        definitionCode: preview.definitionCode!,
        definitionVersion: preview.definitionVersion!,
        priority: 0,
        specificity: 0,
      };
      const step: WorkflowStepRecord = {
        stepId: first.stepId,
        order: first.stepOrder,
        code: first.stepCode,
        name: first.stepName,
        versionStatus: first.versionStatus,
        roleCode: first.workflowRoleCode,
        optional: false,
        conditionType: 'ALWAYS',
      };
      const runtime = await this.repository.runtime(c, jsaId, true);
      if (target.versionStatus === 'RETURNED') {
        if (!runtime || runtime.status !== 'RETURNED')
          throw new StateConflictError('Returned workflow instance was not found');
        await this.repository.resubmit(
          c,
          runtime,
          step,
          first.assigneeUserId,
          user.userId,
          user.username,
          this.correlation(),
        );
        return runtime.instanceId;
      }
      if (runtime)
        throw new StateConflictError('A workflow instance already exists for this JSA Version');
      return this.repository.begin(
        c,
        target,
        binding,
        step,
        first.assigneeUserId,
        user.userId,
        user.username,
        this.correlation(),
      );
    });
    await this.record(user, 'JSA_WORKFLOW_SUBMITTED', jsaId);
    return this.detail(jsaId, user);
  }
  async perform(
    jsaId: string,
    action: 'APPROVE' | 'RETURN' | 'REJECT' | 'COMMENT',
    comment: string | undefined,
    user: AuthenticatedUser,
  ) {
    this.capabilities.require(
      user,
      action === 'APPROVE'
        ? 'approve'
        : action === 'RETURN'
          ? 'return'
          : action === 'REJECT'
            ? 'reject'
            : 'comment',
    );
    if ((action === 'RETURN' || action === 'REJECT') && !comment?.trim())
      throw new ValidationError(`${action === 'RETURN' ? 'Return' : 'Reject'} comment is required`);
    await this.oracle.withTransaction(async (c) => {
      const runtime = await this.repository.runtime(c, jsaId, true);
      if (!runtime) throw new ResourceNotFoundError('Workflow instance was not found');
      this.scope(user, runtime.target, action === 'COMMENT' ? 'VIEW' : 'ACT');
      if (runtime.status !== 'ACTIVE' && action !== 'COMMENT')
        throw new StateConflictError('Workflow is not active');
      let next: WorkflowStepRecord | undefined, nextAssignee: string | undefined;
      if (action === 'APPROVE') {
        const steps = this.effectiveSteps(await this.repository.steps(c, runtime.definitionId));
        const index = steps.findIndex((x) => x.stepId === runtime.stepId);
        if (index < 0)
          throw new StateConflictError('Current workflow step is not in the bound definition');
        next = steps[index + 1];
        if (next) {
          const assignees = await this.repository.assignees(
            c,
            runtime.target,
            next.roleCode,
            this.approveCode(),
          );
          if (assignees.length !== 1)
            throw new StateConflictError(
              `Step ${next.name} must resolve to exactly one eligible approver`,
            );
          nextAssignee = assignees[0]!.userId;
        } else {
          const issues = await this.repository.submissionIssues(c, runtime.target.versionId);
          if (issues.length)
            throw new ValidationError(
              'JSA no longer passes publication validation',
              issues.map((message) => ({ message })),
            );
        }
      }
      await this.repository.action(
        c,
        runtime,
        action,
        comment?.trim(),
        next,
        nextAssignee,
        user.userId,
        user.username,
        this.correlation(),
      );
    });
    await this.record(user, `JSA_WORKFLOW_${action}`, jsaId);
    return this.detail(jsaId, user);
  }
  async queue(kind: 'approvals' | 'pending' | 'rejected' | 'published', user: AuthenticatedUser) {
    this.capabilities.require(user, 'view');
    return this.oracle.withTransaction((c) => this.repository.listQueue(c, kind, user.userId));
  }
  async detail(jsaId: string, user: AuthenticatedUser) {
    this.capabilities.require(user, 'view');
    const value = await this.oracle.withTransaction((c) => this.repository.detail(c, jsaId));
    if (!value) throw new ResourceNotFoundError('Workflow instance was not found');
    this.scope(
      user,
      {
        siteId: value.ownerSiteId,
        rigId: value.rigId,
        departmentId: value.departmentId,
      } as WorkflowTarget,
      'VIEW',
    );
    return value;
  }
  async definitions(user: AuthenticatedUser) {
    this.capabilities.require(user, 'admin');
    return this.oracle.withTransaction((c) => this.repository.definitions(c));
  }
  async saveDefinition(input: SaveWorkflowDefinitionInput, user: AuthenticatedUser) {
    this.capabilities.require(user, 'admin');
    this.validateDefinition(input);
    const id = await this.oracle.withTransaction((c) =>
      this.repository.saveDefinition(c, input, user.username),
    );
    await this.record(user, 'JSA_WORKFLOW_CONFIG_SAVED', id);
    return { id };
  }
  validateDefinitionConfig(input: SaveWorkflowDefinitionInput, user: AuthenticatedUser) {
    this.capabilities.require(user, 'admin');
    this.validateDefinition(input);
    return { valid: true, errors: [] as string[] };
  }
  async roleAssignments(user: AuthenticatedUser) {
    this.capabilities.require(user, 'admin');
    return this.oracle.withTransaction((c) => this.repository.roleAssignments(c));
  }
  async saveRoleAssignment(
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
    user: AuthenticatedUser,
  ) {
    this.capabilities.require(user, 'admin');
    const ids = [
      input.userId,
      input.siteId,
      ...(input.rigId ? [input.rigId] : []),
      ...(input.departmentId ? [input.departmentId] : []),
    ];
    if (!input.workflowRoleCode?.trim() || !ids.every((x) => /^\d{1,19}$/.test(x)))
      throw new ValidationError('Workflow role and valid scope IDs are required');
    if (
      !this.scopes.allows(
        user,
        {
          scopeType: 'SITE',
          siteId: input.siteId,
          rigId: input.rigId,
          departmentId: input.departmentId,
        },
        'ACT',
      )
    )
      throw new DataScopeDeniedError();
    const id = await this.oracle.withTransaction((c) =>
      this.repository.saveRoleAssignment(c, input, user.username),
    );
    await this.record(user, 'JSA_WORKFLOW_ROLE_ASSIGNED', id);
    return { id };
  }
  async notifications(user: AuthenticatedUser) {
    this.capabilities.require(user, 'view');
    return this.oracle.withTransaction((c) => this.repository.notifications(c, user.userId));
  }
  private async resolve(c: any, target: WorkflowTarget): Promise<WorkflowPreview> {
    const bindings = await this.repository.bindings(c, target);
    if (!bindings.length)
      return {
        configured: false,
        steps: [],
        errors: ['No active workflow binding matches Site, Rig, Department and Job Type'],
      };
    if (
      bindings.length > 1 &&
      bindings[0]!.specificity === bindings[1]!.specificity &&
      bindings[0]!.priority === bindings[1]!.priority
    )
      return { configured: false, steps: [], errors: ['Workflow binding resolution is ambiguous'] };
    const binding = bindings[0]!;
    const steps = this.effectiveSteps(await this.repository.steps(c, binding.definitionId));
    const errors: string[] = [];
    const previewSteps = [];
    if (!steps.length) errors.push('Workflow definition has no effective approval steps');
    for (const step of steps) {
      const assignees = await this.repository.assignees(
        c,
        target,
        step.roleCode,
        this.approveCode(),
      );
      if (assignees.length !== 1) {
        errors.push(
          `${step.name} resolved ${assignees.length} eligible approvers; exactly one is required`,
        );
        continue;
      }
      previewSteps.push({
        stepId: step.stepId,
        stepOrder: step.order,
        stepCode: step.code,
        stepName: step.name,
        versionStatus: step.versionStatus,
        workflowRoleCode: step.roleCode,
        assigneeUserId: assignees[0]!.userId,
        assigneeName: assignees[0]!.displayName,
      });
    }
    return {
      configured: errors.length === 0,
      definitionId: binding.definitionId,
      definitionCode: binding.definitionCode,
      definitionVersion: binding.definitionVersion,
      bindingId: binding.bindingId,
      steps: previewSteps,
      errors,
    };
  }
  private effectiveSteps(steps: WorkflowStepRecord[]) {
    return steps.filter((step) => {
      if (step.conditionType === 'ALWAYS') return true;
      if (this.config.get<string>('NODE_ENV') === 'production')
        throw new StateConflictError(
          `${step.conditionType} is not an approved production condition resolver`,
        );
      return (
        step.conditionValue?.toUpperCase() === 'TRUE' || step.conditionValue?.toUpperCase() === 'Y'
      );
    });
  }
  private validateDefinition(input: SaveWorkflowDefinitionInput) {
    if (
      !input.code?.trim() ||
      !input.name?.trim() ||
      !Number.isInteger(input.versionNumber) ||
      input.versionNumber < 1
    )
      throw new ValidationError('Workflow code, name and positive version are required');
    if (!input.steps.length || !input.bindings.length)
      throw new ValidationError('Workflow requires steps and bindings');
    const orders = input.steps.map((x) => x.order);
    if (new Set(orders).size !== orders.length)
      throw new ValidationError('Workflow step order must be unique');
    const required = ['DEPARTMENT_HEAD_REVIEW', 'STC_REVIEW', 'OIM_REVIEW'];
    for (const status of required)
      if (!input.steps.some((x) => x.versionStatus === status))
        throw new ValidationError(`Workflow requires ${status}`);
    for (const step of input.steps)
      if (
        step.conditionType === 'RIG_MANAGER_CONFIG' &&
        this.config.get<string>('NODE_ENV') === 'production'
      )
        throw new ValidationError('Rig Manager production condition is not confirmed');
  }
  private approveCode() {
    const code = this.capabilities.code('approve');
    if (!code) throw new StateConflictError('Approval permission mapping is not configured');
    return code;
  }
  private scope(user: AuthenticatedUser, target: WorkflowTarget, access: 'VIEW' | 'ACT') {
    if (
      !this.scopes.allows(
        user,
        {
          scopeType: 'DEPARTMENT',
          siteId: target.siteId,
          rigId: target.rigId,
          departmentId: target.departmentId,
        },
        access,
      )
    )
      throw new DataScopeDeniedError();
  }
  private correlation() {
    return correlationContext.getStore()?.correlationId ?? 'unknown';
  }
  private record(user: AuthenticatedUser, actionCode: string, targetId: string) {
    return this.audit.recordRequired({
      actorUserId: user.userId,
      enterpriseUsername: user.username,
      actionCode,
      targetType: 'JSA_MASTER',
      targetId,
    });
  }
}
