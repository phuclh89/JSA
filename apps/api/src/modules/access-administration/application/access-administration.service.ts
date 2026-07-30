import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@jsams/shared-types';
import {
  DataScopeDeniedError,
  PendingWorkflowImpactError,
  ValidationError,
} from '../../../common/errors/application-errors';
import { OracleService } from '../../../common/oracle/oracle.service';
import { JsaWorkflowService } from '../../jsa-workflow/application/jsa-workflow.service';
import { DataScopeService } from '../../security/application/data-scope.service';
import { EnterpriseIdentityConfigurationService } from '../../security/application/enterprise-identity-configuration.service';
import { effectivePermissions } from '../../security/application/permission-evaluator';
import {
  SECURITY_REPOSITORY,
  type SecurityRepository,
} from '../../security/domain/security.repository';
import {
  ACCESS_ADMINISTRATION_REPOSITORY,
  type AccessAdministrationRepository,
  type PageQuery,
} from '../domain/access-administration.repository';

@Injectable()
export class AccessAdministrationService {
  constructor(
    private readonly oracle: OracleService,
    @Inject(ACCESS_ADMINISTRATION_REPOSITORY)
    private readonly repository: AccessAdministrationRepository,
    private readonly scopes: DataScopeService,
    private readonly workflow: JsaWorkflowService,
    private readonly identity: EnterpriseIdentityConfigurationService,
    private readonly config: ConfigService,
    @Inject(SECURITY_REPOSITORY) private readonly security: SecurityRepository,
  ) {}
  users(q: PageQuery) {
    return this.tx((c) => this.repository.listUsers(c, q));
  }
  user(id: string) {
    return this.tx((c) => this.repository.user(c, id));
  }
  async register(input: any, actor: AuthenticatedUser) {
    const normalized = this.identity.normalizeConfiguredUsername(input.username);
    this.requireContext(actor, input.defaultSiteId, input.defaultRigId, input.defaultDepartmentId);
    return this.tx(async (c) => ({
      id: await this.repository.registerUser(c, { ...input, username: normalized }, actor),
    }));
  }
  async updateUser(id: string, input: any, actor: AuthenticatedUser) {
    this.requireContext(actor, input.defaultSiteId, input.defaultRigId, input.defaultDepartmentId);
    await this.tx((c) => this.repository.updateUser(c, id, input, actor));
    return { id };
  }
  async userLifecycle(id: string, active: boolean, input: any, actor: AuthenticatedUser) {
    await this.tx(async (c) => {
      if (!active) await this.protect(c, { userId: id });
      await this.repository.setUserActive(c, id, active, input.rowVersion, {
        ...actor,
        reason: input.reason,
      });
    });
    return { id, active };
  }
  roles(q: PageQuery) {
    return this.tx((c) => this.repository.listRoles(c, q));
  }
  role(id: string) {
    return this.tx((c) => this.repository.role(c, id));
  }
  createRole(input: any, actor: AuthenticatedUser) {
    return this.tx(async (c) => ({ id: await this.repository.createRole(c, input, actor) }));
  }
  async updateRole(id: string, input: any, actor: AuthenticatedUser) {
    await this.tx((c) => this.repository.updateRole(c, id, input, actor));
    return { id };
  }
  async roleLifecycle(id: string, active: boolean, input: any, actor: AuthenticatedUser) {
    await this.tx(async (c) => {
      if (!active) await this.protect(c, { roleId: id });
      await this.repository.setRoleActive(c, id, active, input.rowVersion, {
        ...actor,
        reason: input.reason,
      });
    });
    return { id, active };
  }
  permissions(group?: string) {
    return this.tx((c) => this.repository.permissions(c, group));
  }
  userAssignments(id: string, kind: string) {
    return this.tx((c) => this.repository.userAssignments(c, id, kind));
  }
  roleAssignments(id: string, kind: string) {
    return this.tx((c) => this.repository.roleAssignments(c, id, kind));
  }
  async assign(kind: string, input: any, actor: AuthenticatedUser) {
    this.requireContext(actor, input.siteId, input.rigId, input.departmentId);
    return this.tx(async (c) => ({
      id: await this.repository.createAssignment(c, kind, input, actor),
    }));
  }
  async revoke(kind: string, id: string, input: any, actor: AuthenticatedUser) {
    await this.tx(async (c) => {
      const impact: any = {};
      if (kind === 'user-role') impact.roleId = input.roleId;
      if (kind === 'role-permission') impact.permissionId = input.permissionId;
      if (kind === 'scope') impact.scopeId = id;
      if (kind === 'workflow') impact.workflowAssignmentId = id;
      if (kind === 'override' && input.effect === 'ALLOW') impact.userId = input.userId;
      await this.protect(c, impact);
      await this.repository.revokeAssignment(c, kind, id, input.rowVersion, {
        ...actor,
        reason: input.reason,
      });
    });
    return { id, active: false };
  }
  async updateAssignment(kind: string, id: string, input: any, actor: AuthenticatedUser) {
    this.requireContext(actor, input.siteId, input.rigId, input.departmentId);
    await this.tx(async (context) => {
      if (kind === 'override' && input.effect === 'DENY' && input.userId)
        await this.protect(context, { userId: input.userId });
      if (kind === 'scope') await this.protect(context, { scopeId: id });
      if (kind === 'workflow') await this.protect(context, { workflowAssignmentId: id });
      await this.repository.updateAssignment(context, kind, id, input, actor);
    });
    return { id, active: true };
  }
  impact(userId: string) {
    return this.tx((c) => this.repository.pendingImpact(c, { userId }));
  }
  effective(userId: string, effectiveAt?: string) {
    return this.tx(async (context) => {
      const at = effectiveAt ? new Date(effectiveAt) : undefined;
      if (at && Number.isNaN(at.getTime())) throw new ValidationError('effectiveAt is invalid');
      const [base, assignments] = await Promise.all([
        this.repository.effectiveAccess(context, userId, effectiveAt),
        this.security.loadAssignments(context, userId, at),
      ]);
      const allowed = new Set(
        effectivePermissions(assignments.rolePermissions, assignments.overrides),
      );
      const permissionCodes = new Set([
        ...assignments.rolePermissions,
        ...assignments.overrides.map((item) => item.permissionCode),
      ]);
      const permissions = [...permissionCodes].sort().map((permissionCode) => {
        const deny = assignments.overrides.find(
          (item) => item.permissionCode === permissionCode && item.effect === 'DENY',
        );
        const allow = assignments.overrides.find(
          (item) => item.permissionCode === permissionCode && item.effect === 'ALLOW',
        );
        return {
          permissionCode,
          finalResult: allowed.has(permissionCode) ? 'ALLOW' : 'DENY',
          source: deny
            ? 'USER_DENY'
            : allow
              ? 'USER_ALLOW'
              : assignments.rolePermissions.includes(permissionCode)
                ? 'ROLE_GRANT'
                : 'DEFAULT_DENY',
        };
      });
      return {
        ...base,
        roles: assignments.roles,
        permissions,
        scopes: assignments.dataScopes,
      };
    });
  }
  approvers(input: any, actor: AuthenticatedUser) {
    return this.workflow.previewContext(input, actor);
  }
  async readiness(input: any, actor: AuthenticatedUser) {
    const blockers: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];
    const required = [
      'JSA_PERMISSION_VIEW',
      'JSA_PERMISSION_CREATE',
      'JSA_PERMISSION_EDIT',
      'JSA_PERMISSION_CANCEL',
      'JSA_PERMISSION_SUBMIT',
      'JSA_PERMISSION_APPROVE',
      'JSA_PERMISSION_RETURN',
      'JSA_PERMISSION_REJECT',
      'JSA_PERMISSION_COMMENT',
      'JSA_PERMISSION_WORKFLOW_VIEW',
      'JSA_PERMISSION_WORKFLOW_ADMIN',
      'JSA_NUMBER_TEMPLATE',
      'JSA_NUMBER_UNIQUENESS_SCOPE',
    ];
    for (const key of required)
      if (!this.config.get(key))
        blockers.push({ code: 'MISSING_CONFIGURATION', message: `${key} is not configured` });
    let preview: any;
    if (input?.siteId && input?.rigId && input?.departmentId && input?.jobTypeId) {
      preview = await this.approvers(input, actor);
      for (const message of preview.errors ?? [])
        blockers.push({ code: 'APPROVER_RESOLUTION', message });
    } else
      warnings.push({
        code: 'CONTEXT_REQUIRED',
        message: 'Select Site, Rig, Department and Job Type for full readiness evaluation',
      });
    return {
      ready: blockers.length === 0 && Boolean(preview?.configured),
      blockers,
      warnings,
      identityConfiguration: this.identity.status(),
      approverResolution: preview,
      correctiveNavigation: [
        '/operations/access/users',
        '/operations/access/workflow-roles',
        '/operations/workflow',
        '/operations/rig-matrix-assignments',
      ],
    };
  }
  identityStatus() {
    return this.identity.status();
  }
  audits(q: PageQuery) {
    return this.tx((c) => this.repository.auditEvents(c, q));
  }
  audit(id: string) {
    return this.tx((c) => this.repository.auditEvent(c, id));
  }
  private async protect(c: any, impact: any) {
    if (!Object.values(impact).some(Boolean))
      throw new ValidationError('Assignment impact context is required');
    const tasks = await this.repository.pendingImpact(c, impact);
    if (tasks.length) throw new PendingWorkflowImpactError(tasks);
  }
  private requireContext(
    actor: AuthenticatedUser,
    siteId?: string,
    rigId?: string,
    departmentId?: string,
  ) {
    if (!siteId) return;
    if (
      !this.scopes.allows(
        actor,
        {
          scopeType: departmentId ? 'DEPARTMENT' : rigId ? 'RIG' : 'SITE',
          siteId,
          rigId,
          departmentId,
        },
        'ACT',
      )
    )
      throw new DataScopeDeniedError();
  }
  private tx<T>(work: (context: any) => Promise<T>) {
    return this.oracle.withTransaction(work);
  }
}
